/**
 * 子 ReAct Agent — 在子代理上下文中运行独立的 ReAct 循环。
 *
 * 与主 Agent 的区别：
 *   - 工具集与主代理相同（文件操作 + 命令执行 + 搜索 + MCP + 记忆 + 连接器）
 *   - 不含子代理/技能/计划等元工具（避免递归）
 *   - 迭代次数默认更低（避免子任务失控）
 *   - 通过 SubAgentContext 回传流式 token 给 UI
 *   - 自动记录日志（使用 AgentLogger）
 *
 * 适用场景：
 *   - 复杂的多步骤子任务（如：先读取文件 → 分析 → 生成修改 → 写回）
 *   - 需要工具辅助的生成任务（如：搜索参考资料后再生成文档）
 *   - 需要迭代验证的任务（如：生成代码 → 运行测试 → 修复错误）
 *
 * 使用方式：
 *   import { runSubAgent } from '@/agent/subagent'
 *
 *   const result = await runSubAgent({
 *     context: subAgentContext,
 *     task: '分析当前目录下的 Python 文件，生成一份测试报告',
 *     tools: [ ... ],  // 可选，默认提供文件/命令/搜索工具
 *     executeTool: async (name, args) => { ... },
 *     maxIterations: 15,
 *   })
 */

import {
  chatRaw,
  streamChat,
  type ChatMessage,
  type LLMRequestParams,
  type ToolDefinition,
  type ToolCall,
  type RawChatResponse,
} from '../llm/llmClient'
import type { ToolResult } from '../core/reactAgent'
import type { SubAgentContext } from './subagentTools'
import { getLogger } from '../logger'

// ─── 类型 ──────────────────────────────────────────────────

/** 子 ReAct Agent 的参数 */
export interface SubAgentParams {
  /** 子代理上下文（包含 LLM 连接信息和流式回调） */
  context: SubAgentContext
  /** 任务描述（作为 user message 发送给 LLM） */
  task: string
  /** 系统提示（可选，不传则使用默认子代理提示） */
  systemPrompt?: string
  /** 工具定义列表（可选，不传则由外部提供） */
  tools?: ToolDefinition[]
  /**
   * 工具执行器（必须提供）
   * @param name 工具名称
   * @param args 工具参数
   */
  executeTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>
  /** 最大迭代次数（默认 15） */
  maxIterations?: number
  /** 最大对话历史消息数（默认 50） */
  maxHistoryMessages?: number
  /** 是否使用流式调用（默认 true） */
  stream?: boolean
  /** 父任务 ID（用于日志追踪） */
  parentTaskId?: string
}

/** 子 ReAct Agent 的执行结果 */
export interface SubAgentResult {
  /** 最终文本答案 */
  text: string
  /** 执行的迭代次数 */
  iterations: number
  /** 是否自然结束（vs 达到迭代上限） */
  finished: boolean
  /** 完整对话历史 */
  history: ChatMessage[]
  /** 执行耗时（秒） */
  elapsedSeconds: number
}

// ─── 常量 ──────────────────────────────────────────────────

const DEFAULT_SUB_MAX_ITERATIONS = 15
const DEFAULT_SUB_MAX_HISTORY = 50

// ─── 默认系统提示 ──────────────────────────────────────────

const DEFAULT_SUBAGENT_SYSTEM_PROMPT = `你是一个专注的任务执行子代理。你的主代理将一个具体子任务委托给你。

工作原则：
1. 专注于完成当前子任务，不要偏离主题
2. 善用工具完成任务（读文件、写文件、执行命令、搜索等）
3. **每次只能调用一个工具**，不要在一次回复中调用多个工具
4. 每步操作后验证结果，确保正确
5. 完成后给出清晰的总结，**必须列出所有创建/修改的文件及其完整绝对路径**
6. 如果遇到无法解决的问题，说明原因并给出建议
7. 所有输出使用中文
8. 引用文件时，始终使用 write_file 返回的完整绝对路径，不要使用相对路径或仅文件名`

// ─── 核心循环 ──────────────────────────────────────────────

/**
 * 运行子 ReAct Agent 循环。
 *
 * 与主 runReActAgent 类似，但更精简：
 *   - 不含上下文压缩器（子任务通常不会很长）
 *   - 不含计划系统
 *   - 流式 token 通过 SubAgentContext.onToken 回传
 */
export async function runSubAgent(params: SubAgentParams): Promise<SubAgentResult> {
  const {
    context,
    task,
    executeTool,
    parentTaskId,
  } = params

  const logger = getLogger()
  const subTaskId = `${parentTaskId ?? 'unknown'}/sub_${Date.now()}`
  const startTime = Date.now()

  const maxIterations = params.maxIterations ?? DEFAULT_SUB_MAX_ITERATIONS
  const maxHistory = params.maxHistoryMessages ?? DEFAULT_SUB_MAX_HISTORY
  const useStream = params.stream ?? true
  const systemPrompt = params.systemPrompt ?? DEFAULT_SUBAGENT_SYSTEM_PROMPT
  const tools = params.tools ?? []

  // 构建 LLM 配置
  const llmConfig: LLMRequestParams = {
    baseUrl: context.baseUrl,
    apiKey: context.apiKey,
    format: context.format,
    model: context.model,
    messages: [],
    systemPrompt,
    temperature: 0.5,
  }

  // 初始化对话历史
  const history: ChatMessage[] = [{ role: 'user', content: task }]
  let lastText = ''
  let finished = false

  logger.systemInfo(`[SubAgent] 子代理启动: ${task.slice(0, 100)}`, `maxIterations=${maxIterations}, tools=${tools.map(t => t.function.name).join(',')}`)

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    // 裁剪历史
    let trimmedHistory = trimHistory(history, maxHistory)

    // 构建请求
    const requestParams: LLMRequestParams = {
      ...llmConfig,
      messages: trimmedHistory,
      tools: tools.length > 0 ? tools : undefined,
    }

    // 调用 LLM
    let response: RawChatResponse
    try {
      logger.llmCall(subTaskId, context.model)

      if (useStream) {
        response = await streamLLMCall(requestParams, context)
      } else {
        response = await chatRaw(requestParams)
      }

      logger.llmResponse(subTaskId, context.model)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.llmError(subTaskId, context.model, errorMsg)
      return {
        text: lastText || `子代理 LLM 调用失败: ${errorMsg}`,
        iterations: iteration - 1,
        finished: false,
        history,
        elapsedSeconds: (Date.now() - startTime) / 1000,
      }
    }

    lastText = response.text

    // 没有工具调用 → 子代理完成
    if (response.toolCalls.length === 0) {
      const assistantMsg: ChatMessage = { role: 'assistant', content: response.text }
      if (response.reasoningContent) assistantMsg.reasoning_content = response.reasoningContent
      history.push(assistantMsg)

      // 通知迭代完成（无工具调用，自然结束）
      context.onIteration?.({
        iteration, thinking: response.text, toolNames: [], toolResults: [], finished: true,
      })

      finished = true
      break
    }

    // ── 存在工具调用 — 每次迭代只执行第一个工具（串行） ──
    // 即使 LLM 返回多个 tool_calls，也只取第一个执行
    const singleTc = response.toolCalls[0]
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: response.text || '',
      tool_calls: [{
        id: singleTc.id || `sub_call_${iteration}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'function' as const,
        function: { name: singleTc.name, arguments: singleTc.arguments },
      }],
    }
    if (response.reasoningContent) assistantMessage.reasoning_content = response.reasoningContent
    history.push(assistantMessage)

    const iterationToolNames: string[] = []
    const iterationToolResults: { name: string; success: boolean; summary: string; args?: Record<string, unknown> }[] = []

    let args: Record<string, unknown> = {}
    try {
      args = singleTc.arguments ? JSON.parse(singleTc.arguments) : {}
    } catch {
      args = { raw: singleTc.arguments }
    }

    iterationToolNames.push(singleTc.name)

    let result: ToolResult
    try {
      logger.toolCall(subTaskId, singleTc.name, singleTc.arguments?.slice(0, 300))
      result = await executeTool(singleTc.name, args)
      logger.toolResult(subTaskId, singleTc.name, result.success)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      logger.toolError(subTaskId, singleTc.name, errMsg)
      result = { success: false, output: errMsg }
    }

    iterationToolResults.push({
      name: singleTc.name,
      success: result.success,
      summary: result.output.length > 200 ? result.output.slice(0, 200) + '…' : result.output,
      args,
    })

    // 将工具结果追加到历史
    const toolCallId = singleTc.id || assistantMessage.tool_calls![0].id
    history.push({
      role: 'tool',
      content: result.output,
      tool_call_id: toolCallId,
    })

    // 通知本次迭代完成（含工具调用结果）
    context.onIteration?.({
      iteration,
      thinking: response.text || '',
      toolNames: iterationToolNames,
      toolResults: iterationToolResults,
      finished: false,
    })
  }

  // 达到迭代上限
  if (!finished) {
    logger.taskAborted(subTaskId, `子代理达到最大迭代次数 ${maxIterations}`)
    lastText = lastText || `[子代理已达到最大迭代次数 ${maxIterations}，任务终止]`
  }

  const elapsedSeconds = (Date.now() - startTime) / 1000
  logger.systemInfo(`[SubAgent] 子代理完成: ${finished ? '成功' : '终止'}, ${elapsedSeconds.toFixed(1)}s, ${history.length} 条消息`)

  return {
    text: lastText,
    iterations: Math.min(maxIterations, history.filter(m => m.role === 'assistant').length),
    finished,
    history,
    elapsedSeconds,
  }
}

// ─── 流式 LLM 调用（回传 token 到 SubAgentContext）────────────

/**
 * 通过流式调用 LLM，实时将 token 回传到 SubAgentContext.onToken。
 * 累积完整响应后返回 RawChatResponse。
 */
function streamLLMCall(
  params: LLMRequestParams,
  context: SubAgentContext,
): Promise<RawChatResponse> {
  return new Promise((resolve, reject) => {
    const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>()

    streamChat(params, {
      onToken(token: string) {
        context.onToken?.(token)
      },
      onThinking(thinking: string) {
        context.onToken?.(thinking)
      },
      onToolCall(tc) {
        const idx = tc.index ?? 0
        const existing = toolCallMap.get(idx)
        if (existing) {
          existing.arguments += tc.arguments || ''
          if (tc.id) existing.id = tc.id
          if (tc.name) existing.name = tc.name
        } else {
          toolCallMap.set(idx, {
            id: tc.id || '',
            name: tc.name || '',
            arguments: tc.arguments || '',
          })
        }
      },
      onComplete(fullText: string, reasoningContent?: string) {
        const sortedKeys = Array.from(toolCallMap.keys()).sort((a, b) => a - b)
        const toolCalls: ToolCall[] = sortedKeys.map((key, i) => {
          const tc = toolCallMap.get(key)!
          return {
            id: tc.id || `sub_stream_${Date.now()}_${i}`,
            index: key,
            name: tc.name,
            arguments: tc.arguments,
          }
        })

        resolve({
          text: fullText,
          toolCalls,
          finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
          reasoningContent,
        })
      },
      onError(error: Error) {
        reject(error)
      },
    })
  })
}

// ─── 历史裁剪 ──────────────────────────────────────────────

/**
 * 裁剪对话历史，保留最近的消息。
 * 重要：必须保证 assistant(tool_calls) 和对应的 tool 消息成对保留，
 * 否则 OpenAI API 会报错 "Messages with role 'tool' must be a response to a preceding message with 'tool_calls'"。
 */
function trimHistory(history: ChatMessage[], maxMessages: number): ChatMessage[] {
  if (history.length <= maxMessages) {
    return [...history]
  }

  const systemMessages = history.filter((m) => m.role === 'system')
  const nonSystemMessages = history.filter((m) => m.role !== 'system')
  const remaining = maxMessages - systemMessages.length

  // 从末尾开始取消息，但必须保证 assistant+tool 成对
  let startIdx = Math.max(nonSystemMessages.length - remaining, 0)

  // 如果裁剪起点落在 tool 消息上，向前寻找对应的 assistant(tool_calls) 消息
  while (startIdx > 0 && nonSystemMessages[startIdx].role === 'tool') {
    startIdx--
  }

  const trimmed = nonSystemMessages.slice(startIdx)
  return [...systemMessages, ...trimmed]
}
