/**
 * 统一 LLM 客户端的单元测试（`agent/llm/llmClient.ts`）。
 *
 * 所有 HTTP 调用通过 `globalThis.fetch` 模拟 — 无需真实 API 密钥或网络连接。
 *
 * 运行方式：
 *   pnpm test                          # 监听模式
 *   pnpm test:run                      # 单次运行
 *   pnpm test:run -- llmClient         # 按文件名过滤
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  chat,
  streamChat,
  type LLMRequestParams,
  type StreamCallbacks,
  type ChatMessage,
} from '../agent/llm/llmClient'

// ─── 辅助工具 ──────────────────────────────────────────────────

const OPENAI_BASE: LLMRequestParams = {
  baseUrl: 'https://api.openai.com',
  apiKey: 'sk-test-key',
  format: 'openai-compatible',
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
}

const ANTHROPIC_BASE: LLMRequestParams = {
  ...OPENAI_BASE,
  baseUrl: 'https://api.anthropic.com',
  format: 'anthropic',
  model: 'claude-sonnet-4-20250514',
}

/** 构建一个非流式的模拟 Response，包含 JSON 响应体。 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * 构建一个流式的模拟 Response，发送带有短暂延迟的 SSE 数据块。
 * `chunks` 是原始的 SSE 行（例如 "data: {...}"）。
 */
function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk + '\n\n'))
        // 在每个数据块之间让出微任务队列
        await new Promise((r) => setTimeout(r, 1))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

/** 构建 OpenAI SSE 数据行，用于内容增量。 */
function openAIDelta(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`
}

/** 构建 OpenAI SSE 数据行，用于工具调用增量。 */
function openAIToolDelta(name: string, args: string): string {
  return `data: ${JSON.stringify({
    choices: [{ delta: { tool_calls: [{ function: { name, arguments: args } }] } }],
  })}`
}

/** 构建 OpenAI SSE 数据行，用于 reasoning_content（DeepSeek）。 */
function openAIThinkingDelta(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: text } }] })}`
}

/** 构建 Anthropic SSE 数据行，用于文本增量。 */
function anthropicTextDelta(text: string): string {
  return `data: ${JSON.stringify({
    type: 'content_block_delta',
    delta: { type: 'text_delta', text },
  })}`
}

/** 构建 Anthropic SSE 数据行，用于思考增量。 */
function anthropicThinkingDelta(text: string): string {
  return `data: ${JSON.stringify({
    type: 'content_block_delta',
    delta: { type: 'thinking_delta', thinking: text },
  })}`
}

/** 收集 streamChat 的所有回调结果，用于断言验证。 */
function collectCallbacks(): StreamCallbacks & {
  tokens: string[]
  thinkingChunks: string[]
  toolCalls: { name: string; arguments: string }[]
  fullText: string | null
  error: Error | null
} {
  const result = {
    tokens: [] as string[],
    thinkingChunks: [] as string[],
    toolCalls: [] as { name: string; arguments: string }[],
    fullText: null as string | null,
    error: null as Error | null,
    onToken(token: string) { result.tokens.push(token) },
    onThinking(thinking: string) { result.thinkingChunks.push(thinking) },
    onToolCall(tc: { name: string; arguments: string }) { result.toolCalls.push(tc) },
    onComplete(fullText: string) { result.fullText = fullText },
    onError(error: Error) { result.error = error },
  }
  return result
}

// ─── 安装/卸载 ────────────────────────────────────────────────

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn()
  ;(globalThis as any).fetch = fetchSpy
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── chat() — 非流式 ──────────────────────────────────────────

describe('chat() — OpenAI-compatible', () => {
  it('returns response text on success', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'Hi there!' } }] })
    )

    const text = await chat(OPENAI_BASE)
    expect(text).toBe('Hi there!')

    // 验证请求格式是否正确
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toContain('/chat/completions')
    expect(init.method).toBe('POST')

    const body = JSON.parse(init.body)
    expect(body.model).toBe('gpt-4o')
    expect(body.messages[0].content).toBe('Hello')
    expect(body.stream).toBe(false)
    expect(init.headers['Authorization']).toBe('Bearer sk-test-key')
  })

  it('prepends systemPrompt as a system message', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'ok' } }] })
    )

    await chat({ ...OPENAI_BASE, systemPrompt: 'You are a pirate.' })

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content).toBe('You are a pirate.')
    expect(body.messages[1].role).toBe('user')
  })

  it('includes tools when provided', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: '' } }] })
    )

    await chat({
      ...OPENAI_BASE,
      tools: [
        {
          type: 'function',
          function: { name: 'search', description: 'Search the web', parameters: {} },
        },
      ],
    })

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body.tools).toHaveLength(1)
    expect(body.tools[0].function.name).toBe('search')
  })

  it('throws on HTTP 401', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ error: { message: 'bad key' } }, 401))
    await expect(chat(OPENAI_BASE)).rejects.toThrow(/API key invalid/i)
  })

  it('throws on HTTP 429', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({}, 429))
    await expect(chat(OPENAI_BASE)).rejects.toThrow(/Rate limit/i)
  })

  it('throws on HTTP 503', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({}, 503))
    await expect(chat(OPENAI_BASE)).rejects.toThrow(/unavailable/i)
  })

  it('throws on network failure', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(chat(OPENAI_BASE)).rejects.toThrow(/Network connection failed/i)
  })

  it('passes temperature and maxTokens', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: '' } }] })
    )

    await chat({ ...OPENAI_BASE, temperature: 0.2, maxTokens: 100 })

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body.temperature).toBe(0.2)
    expect(body.max_tokens).toBe(100)
  })
})

describe('chat() — Anthropic', () => {
  it('returns content text on success', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ content: [{ text: 'Bonjour!' }] })
    )

    const text = await chat(ANTHROPIC_BASE)
    expect(text).toBe('Bonjour!')

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toContain('/messages')
    expect(init.headers['x-api-key']).toBe('sk-test-key')
    expect(init.headers['anthropic-version']).toBe('2023-06-01')
  })

  it('puts systemPrompt in body.system (not in messages)', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ content: [{ text: 'ok' }] })
    )

    await chat({ ...ANTHROPIC_BASE, systemPrompt: 'You are helpful.' })

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body.system).toBe('You are helpful.')
    expect(body.messages.every((m: ChatMessage) => m.role !== 'system')).toBe(true)
  })

  it('converts OpenAI tools to Anthropic format', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ content: [{ text: '' }] })
    )

    await chat({
      ...ANTHROPIC_BASE,
      tools: [
        {
          type: 'function',
          function: {
            name: 'read_file',
            description: 'Read a file',
            parameters: { type: 'object', properties: { path: { type: 'string' } } },
          },
        },
      ],
    })

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body.tools[0]).toEqual({
      name: 'read_file',
      description: 'Read a file',
      input_schema: { type: 'object', properties: { path: { type: 'string' } } },
    })
  })

  it('throws on Anthropic error response', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ error: { message: 'overloaded' } }, 529))
    await expect(chat(ANTHROPIC_BASE)).rejects.toThrow(/529/)
  })
})

// ─── streamChat() — 流式 ──────────────────────────────────────

describe('streamChat() — OpenAI-compatible', () => {
  it('streams content tokens and calls onComplete', async () => {
    fetchSpy.mockResolvedValue(
      sseResponse([
        openAIDelta('Hello'),
        openAIDelta(' '),
        openAIDelta('world'),
        'data: [DONE]',
      ])
    )

    const cb = collectCallbacks()
    const handle = streamChat(OPENAI_BASE, cb)

    // 等待流式传输完成
    await new Promise((r) => setTimeout(r, 50))

    expect(cb.tokens).toEqual(['Hello', ' ', 'world'])
    expect(cb.fullText).toBe('Hello world')
    expect(cb.error).toBeNull()
    expect(handle.abort).toBeTypeOf('function')
  })

  it('fires onToolCall for function-calling deltas', async () => {
    fetchSpy.mockResolvedValue(
      sseResponse([
        openAIToolDelta('web_search', '{"query":'),
        openAIToolDelta('', '"hello"}'),
        'data: [DONE]',
      ])
    )

    const cb = collectCallbacks()
    streamChat(OPENAI_BASE, cb)
    await new Promise((r) => setTimeout(r, 50))

    expect(cb.toolCalls).toHaveLength(2)
    expect(cb.toolCalls[0].name).toBe('web_search')
    expect(cb.toolCalls[0].arguments).toBe('{"query":')
  })

  it('fires onThinking for reasoning_content (DeepSeek)', async () => {
    fetchSpy.mockResolvedValue(
      sseResponse([
        openAIThinkingDelta('Let me think...'),
        openAIDelta('The answer is 42.'),
        'data: [DONE]',
      ])
    )

    const cb = collectCallbacks()
    streamChat(OPENAI_BASE, cb)
    await new Promise((r) => setTimeout(r, 50))

    expect(cb.thinkingChunks).toEqual(['Let me think...'])
    expect(cb.tokens).toEqual(['The answer is 42.'])
    expect(cb.fullText).toBe('The answer is 42.')
  })

  it('calls onError on HTTP failure', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ error: { message: 'forbidden' } }, 403))

    const cb = collectCallbacks()
    streamChat(OPENAI_BASE, cb)
    await new Promise((r) => setTimeout(r, 50))

    expect(cb.error).toBeInstanceOf(Error)
    expect(cb.error!.message).toMatch(/Access forbidden/i)
    expect(cb.fullText).toBeNull()
  })

  it('calls onError on network failure', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'))

    const cb = collectCallbacks()
    streamChat(OPENAI_BASE, cb)
    await new Promise((r) => setTimeout(r, 50))

    expect(cb.error).toBeInstanceOf(Error)
    expect(cb.error!.message).toMatch(/Network connection failed/i)
  })

  it('does not fire callbacks after abort', async () => {
    // 创建一个慢速流，在我们中止之前不会完成
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(openAIDelta('chunk1') + '\n\n'))
        await new Promise((r) => setTimeout(r, 200))
        controller.enqueue(encoder.encode(openAIDelta('chunk2') + '\n\n'))
        controller.close()
      },
    })

    fetchSpy.mockResolvedValue(new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }))

    const cb = collectCallbacks()
    const handle = streamChat(OPENAI_BASE, cb)

    // 在第一个数据块之后中止
    await new Promise((r) => setTimeout(r, 10))
    handle.abort()
    await new Promise((r) => setTimeout(r, 50))

    // 第一个 token 应该已经到达，但流应该已被中断
    expect(cb.tokens.length).toBeGreaterThanOrEqual(1)
    // AbortError 应该被静默吞掉
    expect(cb.error).toBeNull()
  })

  it('handles mixed content + thinking + tool deltas in one stream', async () => {
    fetchSpy.mockResolvedValue(
      sseResponse([
        openAIThinkingDelta('thinking...'),
        openAIDelta('answer'),
        openAIToolDelta('calc', '{}'),
        openAIDelta(' done'),
        'data: [DONE]',
      ])
    )

    const cb = collectCallbacks()
    streamChat(OPENAI_BASE, cb)
    await new Promise((r) => setTimeout(r, 50))

    expect(cb.thinkingChunks).toEqual(['thinking...'])
    expect(cb.tokens).toEqual(['answer', ' done'])
    expect(cb.fullText).toBe('answer done')
    expect(cb.toolCalls).toHaveLength(1)
    expect(cb.toolCalls[0].name).toBe('calc')
  })

  it('ignores malformed SSE lines gracefully', async () => {
    fetchSpy.mockResolvedValue(
      sseResponse([
        'event: keep-alive',              // 非 data 行
        'data: not-json',                 // 格式错误的 JSON
        openAIDelta('valid'),
        'data: {"bad":"shape"}',           // 缺少 choices
        'data: [DONE]',
      ])
    )

    const cb = collectCallbacks()
    streamChat(OPENAI_BASE, cb)
    await new Promise((r) => setTimeout(r, 50))

    expect(cb.error).toBeNull()
    expect(cb.tokens).toEqual(['valid'])
    expect(cb.fullText).toBe('valid')
  })
})

describe('streamChat() — Anthropic', () => {
  it('streams text deltas and calls onComplete on message_stop', async () => {
    fetchSpy.mockResolvedValue(
      sseResponse([
        anthropicTextDelta('Hi '),
        anthropicTextDelta('Claude'),
        `data: ${JSON.stringify({ type: 'message_stop' })}`,
      ])
    )

    const cb = collectCallbacks()
    streamChat(ANTHROPIC_BASE, cb)
    await new Promise((r) => setTimeout(r, 50))

    expect(cb.tokens).toEqual(['Hi ', 'Claude'])
    expect(cb.fullText).toBe('Hi Claude')
    expect(cb.error).toBeNull()
  })

  it('fires onThinking for thinking_delta', async () => {
    fetchSpy.mockResolvedValue(
      sseResponse([
        anthropicThinkingDelta('I am reasoning...'),
        anthropicTextDelta('The result is X.'),
        `data: ${JSON.stringify({ type: 'message_stop' })}`,
      ])
    )

    const cb = collectCallbacks()
    streamChat(ANTHROPIC_BASE, cb)
    await new Promise((r) => setTimeout(r, 50))

    expect(cb.thinkingChunks).toEqual(['I am reasoning...'])
    expect(cb.tokens).toEqual(['The result is X.'])
  })

  it('calls onError on Anthropic HTTP error', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ type: 'error', error: { message: 'rate limited' } }, 429)
    )

    const cb = collectCallbacks()
    streamChat(ANTHROPIC_BASE, cb)
    await new Promise((r) => setTimeout(r, 50))

    expect(cb.error).toBeInstanceOf(Error)
    expect(cb.error!.message).toMatch(/Rate limit/i)
  })

  it('does not call onComplete after abort', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(anthropicTextDelta('part1') + '\n\n'))
        await new Promise((r) => setTimeout(r, 200))
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'message_stop' })}\n\n`)
        )
        controller.close()
      },
    })

    fetchSpy.mockResolvedValue(new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }))

    const cb = collectCallbacks()
    const handle = streamChat(ANTHROPIC_BASE, cb)

    await new Promise((r) => setTimeout(r, 10))
    handle.abort()
    await new Promise((r) => setTimeout(r, 50))

    // onComplete 不应被调用（在 message_stop 之前中止）
    expect(cb.fullText).toBeNull()
    expect(cb.error).toBeNull()
  })
})

// ─── 边界情况 ─────────────────────────────────────────────────

describe('edge cases', () => {
  it('defaults temperature to 0.7 and maxTokens to 4096', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: '' } }] })
    )

    await chat(OPENAI_BASE)

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body.temperature).toBe(0.7)
    expect(body.max_tokens).toBe(4096)
  })

  it('handles empty response body gracefully (non-streaming)', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: null } }] })
    )

    const text = await chat(OPENAI_BASE)
    expect(text).toBe('')
  })

  it('handles Anthropic empty content array', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ content: [] }))

    const text = await chat(ANTHROPIC_BASE)
    expect(text).toBe('')
  })

  it('handles stream that ends without [DONE] sentinel (OpenAI)', async () => {
    fetchSpy.mockResolvedValue(
      sseResponse([openAIDelta('only-chunk')])
    )

    const cb = collectCallbacks()
    streamChat(OPENAI_BASE, cb)
    await new Promise((r) => setTimeout(r, 50))

    // 即使没有 [DONE] 标记，也应使用已累积的内容调用 onComplete
    expect(cb.fullText).toBe('only-chunk')
  })
})
