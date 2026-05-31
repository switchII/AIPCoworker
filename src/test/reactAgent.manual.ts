/**
 * 手动冒烟测试 — 使用真实 LLM 调用 ReAct Agent。
 *
 * 用法：
 *   # 首先设置 API 密钥：
 *   export LLM_API_KEY="sk-your-key-here"
 *   export LLM_BASE_URL="https://api.openai.com"   # 可选，默认为 OpenAI
 *   export LLM_MODEL="gpt-4o-mini"                  # 可选，默认为 gpt-4o-mini
 *   export LLM_FORMAT="openai-compatible"            # 可选：openai-compatible | anthropic
 *
 *   pnpm tsx src/test/reactAgent.manual.ts "hello world"
 *   pnpm tsx src/test/reactAgent.manual.ts --stream "hello world"
 *
 * 如果未设置 LLM_API_KEY，则使用模拟数据并打印示例输出。
 */

import { runReActAgent, type ReActStep, type ToolResult } from '../agent/core/reactAgent'
import type { ToolDefinition } from '../agent/llm/llmClient'

// ─── 命令行参数 ────────────────────────────────────────────────

const args = process.argv.slice(2)
const useStream = args.includes('--stream')
const userMessage = args.filter((a) => a !== '--stream').join(' ') || 'hello world'

// ─── 工具定义 ──────────────────────────────────────────────────

const tools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_time',
      description: 'Get the current date and time',
      parameters: { type: 'object', properties: { timezone: { type: 'string' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculator',
      description: 'Evaluate a math expression',
      parameters: {
        type: 'object',
        properties: { expression: { type: 'string', description: 'Math expression to evaluate' } },
        required: ['expression'],
      },
    },
  },
]

// ─── 工具执行器 ────────────────────────────────────────────────

async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  console.log(`  🔧 Executing tool: ${name}(${JSON.stringify(args)})`)

  switch (name) {
    case 'get_time': {
      const tz = (args.timezone as string) || 'Asia/Shanghai'
      const now = new Date().toLocaleString('zh-CN', { timeZone: tz })
      return { success: true, output: `Current time in ${tz}: ${now}` }
    }
    case 'calculator': {
      try {
        // 安全的数学表达式求值（仅限基本算术运算）
        const expr = String(args.expression || '0').replace(/[^0-9+\-*/().% ]/g, '')
        const result = Function(`"use strict"; return (${expr})`)()
        return { success: true, output: `${args.expression} = ${result}` }
      } catch (e) {
        return { success: false, output: `Calculation error: ${e}` }
      }
    }
    default:
      return { success: false, output: `Unknown tool: ${name}` }
  }
}

// ─── 主函数 ────────────────────────────────────────────────────

const apiKey = process.env.LLM_API_KEY || ''
const baseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com'
const model = process.env.LLM_MODEL || 'gpt-4o-mini'
const format = (process.env.LLM_FORMAT || 'openai-compatible') as 'openai-compatible' | 'anthropic'

async function runWithRealLLM() {
  console.log('\n🤖 ReAct Agent — Real LLM Test' + (useStream ? ' (STREAMING)' : ''))
  console.log(`   Model:   ${model}`)
  console.log(`   Base:    ${baseUrl}`)
  console.log(`   Format:  ${format}`)
  console.log(`   Input:   "${userMessage}"`)
  console.log('─'.repeat(50))

  let streamingText = ''

  const result = await runReActAgent({
    llm: { baseUrl, apiKey, format, model, temperature: 0.7 },
    systemPrompt: 'You are a helpful assistant. When asked about time, use the get_time tool. For math, use the calculator tool.',
    userMessage,
    tools,
    executeTool,
    maxIterations: 5,
    stream: useStream,
    streamCallbacks: useStream ? {
      onToken: (token) => {
        streamingText += token
        process.stdout.write(token)
      },
      onThinking: (thinking) => {
        process.stdout.write(`\x1b[90m${thinking}\x1b[0m`)
      },
      onToolCallStart: (tc) => {
        console.log(`\n\n🔧 Calling: ${tc.name}(${tc.arguments})`)
      },
      onToolCallEnd: (_tc, result) => {
        console.log(`📦 Result: ${result.output}\n`)
      },
    } : undefined,
    onStep: (step: ReActStep) => {
      if (!useStream) {
        console.log(`\n📍 Step ${step.iteration}:`)
        if (step.text) console.log(`   Text: ${step.text.slice(0, 200)}`)
        if (step.toolCalls.length > 0) {
          for (let i = 0; i < step.toolCalls.length; i++) {
            const tc = step.toolCalls[i]
            console.log(`   🔧 Tool call: ${tc.name}(${tc.arguments})`)
            console.log(`   📦 Result: ${step.toolResults[i]?.output}`)
          }
        }
      }
    },
    onError: (err) => {
      console.error(`\n❌ Error: ${err.message}`)
    },
  })

  console.log('\n' + '═'.repeat(50))
  console.log(`\n✅ Final answer (${result.iterations} iterations, finished: ${result.finished}):`)
  if (useStream && streamingText) {
    console.log('(streamed above)')
  } else {
    console.log(result.text)
  }
  console.log(`\n📊 History: ${result.history.length} messages`)
}

async function runWithMock() {
  console.log('\n⚠️  No LLM_API_KEY set — running with mock responses' + (useStream ? ' (STREAMING)' : '') + '\n')
  console.log('To test with a real LLM:')
  console.log('  export LLM_API_KEY="sk-your-key-here"')
  console.log('  pnpm tsx src/test/reactAgent.manual.ts' + (useStream ? ' --stream' : '') + ' "hello world"\n')
  console.log('─'.repeat(50))

  if (useStream) {
    // 模拟 SSE 流式响应
    const mockResponse = `Hello! I'm a mock ReAct agent streaming tokens. You said: "${userMessage}". Set LLM_API_KEY to test with a real model.`
    const words = mockResponse.split(' ')

    ;(globalThis as any).fetch = async () => {
      const encoder = new TextEncoder()
      let wordIdx = 0
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          for (const word of words) {
            const chunk = `data: ${JSON.stringify({ choices: [{ delta: { content: (wordIdx++ > 0 ? ' ' : '') + word } }] })}\n\n`
            controller.enqueue(encoder.encode(chunk))
            await new Promise((r) => setTimeout(r, 50))
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        },
      })
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    }

    const result = await runReActAgent({
      llm: { baseUrl: 'https://mock.api', apiKey: 'mock-key', format: 'openai-compatible', model: 'mock' },
      systemPrompt: 'You are a helpful assistant.',
      userMessage,
      tools,
      executeTool,
      maxIterations: 5,
      stream: true,
      streamCallbacks: {
        onToken: (token) => process.stdout.write(token),
        onThinking: (thinking) => process.stdout.write(`\x1b[90m${thinking}\x1b[0m`),
      },
    })

    console.log('\n' + '═'.repeat(50))
    console.log(`\n✅ Final answer (${result.iterations} iterations, finished: ${result.finished})`)
  } else {
    // 模拟非流式响应
    ;(globalThis as any).fetch = async () => {
      const body = JSON.stringify({
        choices: [{
          message: {
            role: 'assistant',
            content: `Hello! I'm a mock ReAct agent. You said: "${userMessage}". Set LLM_API_KEY to test with a real model.`,
          },
          finish_reason: 'stop',
        }],
      })
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const result = await runReActAgent({
      llm: { baseUrl: 'https://mock.api', apiKey: 'mock-key', format: 'openai-compatible', model: 'mock' },
      systemPrompt: 'You are a helpful assistant.',
      userMessage,
      tools,
      executeTool,
      maxIterations: 5,
      onStep: (step: ReActStep) => {
        console.log(`\n📍 Step ${step.iteration}:`)
        if (step.text) console.log(`   Text: ${step.text}`)
      },
    })

    console.log('\n' + '═'.repeat(50))
    console.log(`\n✅ Final answer (${result.iterations} iterations, finished: ${result.finished}):`)
    console.log(result.text)
  }
}

// 运行
if (apiKey) {
  runWithRealLLM().catch(console.error)
} else {
  runWithMock().catch(console.error)
}
