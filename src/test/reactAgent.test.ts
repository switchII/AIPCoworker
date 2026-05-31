/**
 * ReAct Agent 单元测试 (`agent/core/reactAgent.ts`)。
 *
 * 所有 HTTP 调用通过 `globalThis.fetch` 模拟 — 无需真实 API 密钥。
 *
 * 运行方式：
 *   pnpm test                          # 监听模式
 *   pnpm test:run                      # 单次运行
 *   pnpm test:run -- reactAgent        # 按文件名过滤
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  runReActAgent,
  parseToolCallArgs,
  type ToolResult,
} from '../agent/core/reactAgent'
import type { ToolDefinition, ChatMessage } from '../agent/llm/llmClient'

// ─── 模拟辅助工具 ─────────────────────────────────────────────

const LLM_CONFIG = {
  baseUrl: 'https://api.openai.com',
  apiKey: 'sk-test',
  format: 'openai-compatible' as const,
  model: 'gpt-4o',
}

const TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web',
      parameters: { type: 'object', properties: { query: { type: 'string' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
    },
  },
]

/** 构建模拟的 OpenAI 响应体 */
function openAIResponse(options: {
  content?: string
  toolCalls?: Array<{ id: string; name: string; arguments: string }>
  finishReason?: string
}) {
  const { content = '', toolCalls = [], finishReason = 'stop' } = options

  const message: any = { role: 'assistant', content }
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function',
      function: { name: tc.name, arguments: tc.arguments },
    }))
  }

  return {
    choices: [{ message, finish_reason: finishReason || (toolCalls.length > 0 ? 'tool_calls' : 'stop') }],
  }
}

/** 设置 fetch 以返回一系列响应（每次调用一个） */
function mockFetchSequence(responses: any[]) {
  let callIndex = 0
  fetchSpy.mockImplementation(async () => {
    const body = responses[callIndex] ?? responses[responses.length - 1]
    callIndex++
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

/** 创建一个简单的 executeTool，按工具名返回预设结果 */
function mockExecutor(results: Record<string, ToolResult>) {
  return vi.fn(async (name: string, _args: Record<string, unknown>): Promise<ToolResult> => {
    return results[name] || { success: false, output: `Unknown tool: ${name}` }
  })
}

// ─── 安装/卸载 ─────────────────────────────────────────

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn()
  ;(globalThis as any).fetch = fetchSpy
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── 基本行为 ───────────────────────────────────────────

describe('runReActAgent — basic', () => {
  it('returns text directly when model gives a final answer (no tools)', async () => {
    mockFetchSequence([
      openAIResponse({ content: 'The answer is 42.' }),
    ])

    const result = await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'What is the meaning of life?',
      tools: TOOLS,
      executeTool: mockExecutor({}),
    })

    expect(result.finished).toBe(true)
    expect(result.iterations).toBe(1)
    expect(result.text).toBe('The answer is 42.')
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0].toolCalls).toHaveLength(0)
  })

  it('executes a single tool call then returns the final answer', async () => {
    const executor = mockExecutor({
      web_search: { success: true, output: 'Search result: React is a JS library.' },
    })

    mockFetchSequence([
      // 第1次迭代：模型请求 web_search
      openAIResponse({
        content: '',
        toolCalls: [{ id: 'call_1', name: 'web_search', arguments: '{"query":"React"}' }],
        finishReason: 'tool_calls',
      }),
      // 第2次迭代：模型给出最终答案
      openAIResponse({ content: 'React is a JavaScript library for building UIs.' }),
    ])

    const result = await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'What is React?',
      tools: TOOLS,
      executeTool: executor,
    })

    expect(result.finished).toBe(true)
    expect(result.iterations).toBe(2)
    expect(result.text).toBe('React is a JavaScript library for building UIs.')

    // 工具被调用了一次
    expect(executor).toHaveBeenCalledTimes(1)
    expect(executor).toHaveBeenCalledWith('web_search', { query: 'React' })

    // 步骤1应该包含工具调用
    expect(result.steps[0].toolCalls).toHaveLength(1)
    expect(result.steps[0].toolCalls[0].name).toBe('web_search')
    expect(result.steps[0].toolResults[0].output).toContain('React is a JS library')
  })

  it('handles multi-step tool chain (3 iterations)', async () => {
    const executor = mockExecutor({
      web_search: { success: true, output: 'Vue.js is a progressive framework.' },
      read_file: { success: true, output: 'File content: <template>...</template>' },
    })

    mockFetchSequence([
      // 第1次迭代：搜索
      openAIResponse({
        toolCalls: [{ id: 'call_1', name: 'web_search', arguments: '{"query":"Vue.js"}' }],
        finishReason: 'tool_calls',
      }),
      // 第2次迭代：读取文件
      openAIResponse({
        toolCalls: [{ id: 'call_2', name: 'read_file', arguments: '{"path":"main.vue"}' }],
        finishReason: 'tool_calls',
      }),
      // 第3次迭代：最终答案
      openAIResponse({ content: 'Here is what I found about Vue.js and the file.' }),
    ])

    const result = await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'Research Vue.js and read main.vue',
      tools: TOOLS,
      executeTool: executor,
    })

    expect(result.finished).toBe(true)
    expect(result.iterations).toBe(3)
    expect(result.steps).toHaveLength(3)
    expect(executor).toHaveBeenCalledTimes(2)
  })

  it('handles multiple tool calls in a single turn', async () => {
    const executor = mockExecutor({
      web_search: { success: true, output: 'Result for query A' },
      read_file: { success: true, output: 'Content of file B' },
    })

    mockFetchSequence([
      openAIResponse({
        toolCalls: [
          { id: 'call_1', name: 'web_search', arguments: '{"query":"A"}' },
          { id: 'call_2', name: 'read_file', arguments: '{"path":"B"}' },
        ],
        finishReason: 'tool_calls',
      }),
      openAIResponse({ content: 'I searched A and read B.' }),
    ])

    const result = await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'Do two things at once',
      tools: TOOLS,
      executeTool: executor,
    })

    expect(result.finished).toBe(true)
    expect(result.steps[0].toolCalls).toHaveLength(2)
    expect(result.steps[0].toolResults).toHaveLength(2)
    expect(executor).toHaveBeenCalledTimes(2)
  })
})

// ─── 迭代次数限制 ──────────────────────────────────────────

describe('runReActAgent — iteration limit', () => {
  it('stops after maxIterations and returns unfinished', async () => {
    const executor = mockExecutor({
      web_search: { success: true, output: 'Still searching...' },
    })

    // 模型持续调用工具，永不停止
    fetchSpy.mockImplementation(async () => {
      return new Response(
        JSON.stringify(
          openAIResponse({
            toolCalls: [{ id: 'call_n', name: 'web_search', arguments: '{"query":"loop"}' }],
            finishReason: 'tool_calls',
          })
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    })

    const result = await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'Loop forever',
      tools: TOOLS,
      executeTool: executor,
      maxIterations: 3,
    })

    expect(result.finished).toBe(false)
    expect(result.iterations).toBe(3)
    expect(result.steps).toHaveLength(3)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('respects custom maxIterations = 1', async () => {
    mockFetchSequence([
      openAIResponse({ content: 'Quick answer' }),
    ])

    const result = await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'Be quick',
      tools: TOOLS,
      executeTool: mockExecutor({}),
      maxIterations: 1,
    })

    expect(result.finished).toBe(true)
    expect(result.iterations).toBe(1)
  })
})

// ─── 错误处理 ───────────────────────────────────────────

describe('runReActAgent — error handling', () => {
  it('handles tool execution errors gracefully', async () => {
    const executor = vi.fn(async () => {
      throw new Error('Disk full')
    })

    mockFetchSequence([
      openAIResponse({
        toolCalls: [{ id: 'call_1', name: 'write_file', arguments: '{"path":"big.bin"}' }],
        finishReason: 'tool_calls',
      }),
      openAIResponse({ content: 'I could not write the file due to disk space.' }),
    ])

    const result = await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'Write a big file',
      tools: TOOLS,
      executeTool: executor,
    })

    expect(result.finished).toBe(true)
    expect(result.steps[0].toolResults[0].success).toBe(false)
    expect(result.steps[0].toolResults[0].output).toBe('Disk full')
  })

  it('handles LLM API errors and returns partial results', async () => {
    fetchSpy.mockImplementation(async () => {
      return new Response(
        JSON.stringify({ error: { message: 'Internal server error' } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    })

    const errors: Error[] = []
    const result = await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'Hello',
      tools: TOOLS,
      executeTool: mockExecutor({}),
      onError: (err) => errors.push(err),
    })

    expect(result.finished).toBe(false)
    expect(result.iterations).toBe(0)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('500')
  })

  it('handles malformed tool call arguments', async () => {
    const executor = mockExecutor({
      web_search: { success: true, output: 'Searched with raw args' },
    })

    mockFetchSequence([
      openAIResponse({
        toolCalls: [{ id: 'call_1', name: 'web_search', arguments: 'not-valid-json' }],
        finishReason: 'tool_calls',
      }),
      openAIResponse({ content: 'Done searching.' }),
    ])

    const result = await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'Search with bad args',
      tools: TOOLS,
      executeTool: executor,
    })

    expect(result.finished).toBe(true)
    // 执行器应该被调用时传入 { raw: 'not-valid-json' }
    expect(executor).toHaveBeenCalledWith('web_search', { raw: 'not-valid-json' })
  })
})

// ─── 历史消息管理 ───────────────────────────────────────

describe('runReActAgent — history management', () => {
  it('preserves existing conversation history', async () => {
    mockFetchSequence([
      openAIResponse({ content: 'Nice to meet you again!' }),
    ])

    const existingHistory: ChatMessage[] = [
      { role: 'user', content: 'Hi, my name is Alice' },
      { role: 'assistant', content: 'Hello Alice!' },
    ]

    const result = await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'Remember me?',
      tools: TOOLS,
      executeTool: mockExecutor({}),
      history: existingHistory,
    })

    // 验证请求中包含了已有的历史消息
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    const userMessages = body.messages.filter((m: any) => m.role === 'user')
    expect(userMessages.length).toBeGreaterThanOrEqual(2)
    expect(result.history.length).toBeGreaterThanOrEqual(3)
  })

  it('trims long history to maxHistoryMessages', async () => {
    mockFetchSequence([
      openAIResponse({ content: 'Got it' }),
    ])

    // 创建 60 条历史消息
    const longHistory: ChatMessage[] = Array.from({ length: 60 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Message ${i}`,
    }))

    await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'New question',
      tools: TOOLS,
      executeTool: mockExecutor({}),
      history: longHistory,
      maxHistoryMessages: 10,
    })

    // 验证请求中最多包含 11 条消息（10 条裁剪后的历史 + 1 条新的用户消息）
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body.messages.length).toBeLessThanOrEqual(11)
  })

  it('includes tool messages in history after tool execution', async () => {
    const executor = mockExecutor({
      web_search: { success: true, output: 'Found it!' },
    })

    mockFetchSequence([
      openAIResponse({
        toolCalls: [{ id: 'call_1', name: 'web_search', arguments: '{"query":"test"}' }],
        finishReason: 'tool_calls',
      }),
      openAIResponse({ content: 'Found the answer.' }),
    ])

    const result = await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'Search for test',
      tools: TOOLS,
      executeTool: executor,
    })

    // 历史消息应包含：user、assistant（tool_calls）、tool（结果）、assistant（最终回答）
    const roles = result.history.map((m) => m.role)
    expect(roles).toContain('user')
    expect(roles).toContain('assistant')
    expect(roles).toContain('tool')
  })
})

// ─── 回调函数 ────────────────────────────────────────────────

describe('runReActAgent — callbacks', () => {
  it('fires onStep for each iteration', async () => {
    const onStep = vi.fn()

    mockFetchSequence([
      openAIResponse({
        toolCalls: [{ id: 'call_1', name: 'web_search', arguments: '{}' }],
        finishReason: 'tool_calls',
      }),
      openAIResponse({ content: 'Done' }),
    ])

    await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'Go',
      tools: TOOLS,
      executeTool: mockExecutor({ web_search: { success: true, output: 'ok' } }),
      onStep,
    })

    expect(onStep).toHaveBeenCalledTimes(2)
    expect(onStep.mock.calls[0][0].iteration).toBe(1)
    expect(onStep.mock.calls[1][0].iteration).toBe(2)
  })

  it('passes systemPrompt in the request', async () => {
    mockFetchSequence([
      openAIResponse({ content: 'ok' }),
    ])

    await runReActAgent({
      llm: LLM_CONFIG,
      systemPrompt: 'You are a pirate.',
      userMessage: 'Hello',
      tools: TOOLS,
      executeTool: mockExecutor({}),
    })

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content).toBe('You are a pirate.')
  })
})

// ─── JSON 工具参数 ──────────────────────────────────────

describe('runReActAgent — JSON tool arguments', () => {
  it('correctly parses JSON arguments and passes them to executor', async () => {
    const executor = vi.fn(async () => ({ success: true, output: 'ok' }))

    mockFetchSequence([
      openAIResponse({
        toolCalls: [{
          id: 'call_1',
          name: 'web_search',
          arguments: JSON.stringify({ query: 'test query', limit: 5 }),
        }],
        finishReason: 'tool_calls',
      }),
      openAIResponse({ content: 'Done' }),
    ])

    await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'Search',
      tools: TOOLS,
      executeTool: executor,
    })

    expect(executor).toHaveBeenCalledWith('web_search', { query: 'test query', limit: 5 })
  })
})

// ─── 工具函数：parseToolCallArgs ───────────────────────────────

describe('parseToolCallArgs', () => {
  it('parses valid JSON object', () => {
    expect(parseToolCallArgs('{"key":"value","num":42}')).toEqual({ key: 'value', num: 42 })
  })

  it('returns null for invalid JSON', () => {
    expect(parseToolCallArgs('not json')).toBeNull()
  })

  it('returns null for JSON arrays', () => {
    expect(parseToolCallArgs('[1,2,3]')).toBeNull()
  })

  it('returns null for JSON primitives', () => {
    expect(parseToolCallArgs('"hello"')).toBeNull()
    expect(parseToolCallArgs('42')).toBeNull()
    expect(parseToolCallArgs('true')).toBeNull()
  })

  it('parses empty object', () => {
    expect(parseToolCallArgs('{}')).toEqual({})
  })

  it('parses nested objects', () => {
    const input = '{"outer":{"inner":"value"}}'
    expect(parseToolCallArgs(input)).toEqual({ outer: { inner: 'value' } })
  })
})

// ─── 边界情况 ───────────────────────────────────────────

describe('runReActAgent — edge cases', () => {
  it('handles empty text with tool calls (model only requests tools)', async () => {
    mockFetchSequence([
      openAIResponse({
        content: '',
        toolCalls: [{ id: 'call_1', name: 'read_file', arguments: '{"path":"a.txt"}' }],
        finishReason: 'tool_calls',
      }),
      openAIResponse({ content: 'File A contains...' }),
    ])

    const result = await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'Read file A',
      tools: TOOLS,
      executeTool: mockExecutor({ read_file: { success: true, output: 'content of A' } }),
    })

    expect(result.finished).toBe(true)
    expect(result.text).toBe('File A contains...')
    expect(result.steps[0].text).toBe('')
  })

  it('handles tool call with empty arguments string', async () => {
    const executor = vi.fn(async () => ({ success: true, output: 'ok' }))

    mockFetchSequence([
      openAIResponse({
        toolCalls: [{ id: 'call_1', name: 'web_search', arguments: '' }],
        finishReason: 'tool_calls',
      }),
      openAIResponse({ content: 'Done' }),
    ])

    await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'Search',
      tools: TOOLS,
      executeTool: executor,
    })

    // 空字符串应解析为 {}（因为 JSON.parse('') 会抛出异常）
    expect(executor).toHaveBeenCalledWith('web_search', {})
  })

  it('sends tools definition in every request', async () => {
    mockFetchSequence([
      openAIResponse({
        toolCalls: [{ id: 'call_1', name: 'web_search', arguments: '{}' }],
        finishReason: 'tool_calls',
      }),
      openAIResponse({ content: 'Done' }),
    ])

    await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'Go',
      tools: TOOLS,
      executeTool: mockExecutor({ web_search: { success: true, output: 'ok' } }),
    })

    // 两个请求都应包含工具定义
    for (const call of fetchSpy.mock.calls) {
      const body = JSON.parse(call[1].body)
      expect(body.tools).toHaveLength(2)
    }
  })
})

// ─── JSON 工具调用格式（深入测试）────────────────────────────

describe('JSON tool call format', () => {
  it('handles complex nested JSON arguments', async () => {
    const executor = vi.fn(async () => ({ success: true, output: 'ok' }))
    const complexArgs = {
      query: 'advanced search',
      filters: {
        date_range: { from: '2024-01-01', to: '2024-12-31' },
        categories: ['tech', 'science'],
        min_score: 4.5,
      },
      pagination: { page: 1, per_page: 20 },
    }

    mockFetchSequence([
      openAIResponse({
        toolCalls: [{ id: 'call_1', name: 'web_search', arguments: JSON.stringify(complexArgs) }],
        finishReason: 'tool_calls',
      }),
      openAIResponse({ content: 'Found results' }),
    ])

    await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'Complex search',
      tools: TOOLS,
      executeTool: executor,
    })

    expect(executor).toHaveBeenCalledWith('web_search', complexArgs)
  })

  it('handles unicode and special characters in arguments', async () => {
    const executor = vi.fn(async () => ({ success: true, output: 'ok' }))
    const unicodeArgs = {
      query: '搜索中文内容 🚀',
      path: '/path/with spaces/and"quotes',
      newline: 'line1\nline2\ttabbed',
    }

    mockFetchSequence([
      openAIResponse({
        toolCalls: [{ id: 'call_1', name: 'web_search', arguments: JSON.stringify(unicodeArgs) }],
        finishReason: 'tool_calls',
      }),
      openAIResponse({ content: 'Done' }),
    ])

    await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'Search unicode',
      tools: TOOLS,
      executeTool: executor,
    })

    expect(executor).toHaveBeenCalledWith('web_search', unicodeArgs)
  })

  it('sends correct tool result structure back to model', async () => {
    const executor = mockExecutor({
      web_search: { success: true, output: 'Search result: React is great' },
    })

    mockFetchSequence([
      openAIResponse({
        toolCalls: [{ id: 'call_abc123', name: 'web_search', arguments: '{"query":"React"}' }],
        finishReason: 'tool_calls',
      }),
      openAIResponse({ content: 'Final answer' }),
    ])

    await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'Search React',
      tools: TOOLS,
      executeTool: executor,
    })

    // 第二个请求应包含工具结果消息
    const secondRequestBody = JSON.parse(fetchSpy.mock.calls[1][1].body)
    const toolMessage = secondRequestBody.messages.find((m: any) => m.role === 'tool')

    expect(toolMessage).toBeDefined()
    expect(toolMessage.role).toBe('tool')
    expect(toolMessage.content).toBe('Search result: React is great')
    expect(toolMessage.tool_call_id).toBe('call_abc123')
  })

  it('handles multiple tool calls with different argument types', async () => {
    const executor = vi.fn(async (name: string, _args: Record<string, unknown>) => {
      return { success: true, output: `${name} done` }
    })

    mockFetchSequence([
      openAIResponse({
        toolCalls: [
          { id: 'call_1', name: 'web_search', arguments: '{"query":"test","limit":10,"strict":true}' },
          { id: 'call_2', name: 'read_file', arguments: '{"path":"config.json","encoding":"utf-8"}' },
        ],
        finishReason: 'tool_calls',
      }),
      openAIResponse({ content: 'Both done' }),
    ])

    await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'Do both',
      tools: TOOLS,
      executeTool: executor,
    })

    expect(executor).toHaveBeenCalledTimes(2)
    expect(executor).toHaveBeenNthCalledWith(1, 'web_search', { query: 'test', limit: 10, strict: true })
    expect(executor).toHaveBeenNthCalledWith(2, 'read_file', { path: 'config.json', encoding: 'utf-8' })
  })

  it('preserves tool_call_id through the conversation', async () => {
    const executor = mockExecutor({
      web_search: { success: true, output: 'result' },
    })

    mockFetchSequence([
      openAIResponse({
        toolCalls: [{ id: 'unique_id_xyz', name: 'web_search', arguments: '{}' }],
        finishReason: 'tool_calls',
      }),
      openAIResponse({ content: 'Done' }),
    ])

    await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'Test',
      tools: TOOLS,
      executeTool: executor,
    })

    // 检查第二个请求中的 tool_call_id 是否正确
    const secondBody = JSON.parse(fetchSpy.mock.calls[1][1].body)
    const assistantMsg = secondBody.messages.find((m: any) => m.role === 'assistant' && m.tool_calls)
    const toolMsg = secondBody.messages.find((m: any) => m.role === 'tool')

    expect(assistantMsg.tool_calls[0].id).toBe('unique_id_xyz')
    expect(toolMsg.tool_call_id).toBe('unique_id_xyz')
  })

  it('handles numeric and boolean JSON values correctly', async () => {
    const executor = vi.fn(async () => ({ success: true, output: 'ok' }))
    const numericArgs = {
      count: 42,
      temperature: 0.7,
      negative: -10,
      scientific: 1.5e10,
      enabled: false,
      nullable: null,
    }

    mockFetchSequence([
      openAIResponse({
        toolCalls: [{ id: 'call_1', name: 'web_search', arguments: JSON.stringify(numericArgs) }],
        finishReason: 'tool_calls',
      }),
      openAIResponse({ content: 'Done' }),
    ])

    await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'Numeric test',
      tools: TOOLS,
      executeTool: executor,
    })

    expect(executor).toHaveBeenCalledWith('web_search', numericArgs)
  })

  it('verifies complete request/response cycle structure', async () => {
    const executor = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({
      success: true,
      output: JSON.stringify({ data: [1, 2, 3], count: 3 }),
    }))

    mockFetchSequence([
      openAIResponse({
        toolCalls: [{ id: 'call_full', name: 'web_search', arguments: '{"query":"test"}' }],
        finishReason: 'tool_calls',
      }),
      openAIResponse({ content: 'Processed' }),
    ])

    const result = await runReActAgent({
      llm: LLM_CONFIG,
      userMessage: 'Full test',
      tools: TOOLS,
      executeTool: executor,
    })

    // 验证完整的历史消息结构
    expect(result.history).toHaveLength(4) // user、assistant（tool_calls）、tool（结果）、assistant（最终回答）
    expect(result.history[0].role).toBe('user')
    expect(result.history[1].role).toBe('assistant')
    expect(result.history[1].tool_calls).toBeDefined()
    expect(result.history[1].tool_calls![0].id).toBe('call_full')
    expect(result.history[2].role).toBe('tool')
    expect(result.history[2].tool_call_id).toBe('call_full')
    expect(result.history[3].role).toBe('assistant')

    // 验证步骤结构
    expect(result.steps[0].toolCalls[0].name).toBe('web_search')
    expect(result.steps[0].toolCalls[0].arguments).toBe('{"query":"test"}')
    expect(result.steps[0].toolResults[0].success).toBe(true)
    expect(result.steps[0].toolResults[0].output).toContain('"data":[1,2,3]')
  })
})
