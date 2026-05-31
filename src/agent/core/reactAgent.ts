/**
 * ReAct Agent — 推理 + 行动循环。
 *
 * 实现 ReAct 模式：模型推理下一步该做什么，
 * 发出工具调用，观察结果，然后重复直到产生
 * 最终答案或达到迭代上限。
 *
 * 使用方式：
 *   import { runReActAgent } from '@/agent/core/reactAgent'
 *
 *   const result = await runReActAgent({
 *     llm: { baseUrl, apiKey, format, model },
 *     systemPrompt: 'You are a helpful assistant.',
 *     userMessage: 'What is the weather in Tokyo?',
 *     tools: [ ... ],
 *     executeTool: async (name, args) => { ... },
 *     maxIterations: 10,
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
import { type ContextCompressor } from '../context/contextCompressor'
import { type PlanContext } from '../plan'
import { getLogger } from '../logger'

// ─── 公共类型 ──────────────────────────────────────────────

/** LLM 连接配置（除消息/工具外的所有参数） */
export interface ReActLLMConfig {
  baseUrl: string
  apiKey: string
  format: LLMRequestParams['format']
  model: string
  temperature?: number
  maxTokens?: number
  /** 模型上下文窗口（token 数），用于上下文压缩参考 */
  contextWindow?: number
}

/** 单个工具执行的结果 */
export interface ToolResult {
  /** 工具是否执行成功 */
  success: boolean
  /** 反馈给模型的文本输出 */
  output: string
  /** run_command 检测到的新文件（内部使用，不传给模型） */
  newFiles?: { path: string; size: number }[]
}

/** ReAct 循环中的单一步骤（一次模型回合 + 其工具调用） */
export interface ReActStep {
  /** 从 1 开始的迭代索引 */
  iteration: number
  /** 此步骤中模型的文本响应（可能为空） */
  text: string
  /** 模型请求的工具调用（无则为空数组） */
  toolCalls: ToolCall[]
  /** 每个工具调用的执行结果（与 toolCalls 平行数组） */
  toolResults: ToolResult[]
}

/** runReActAgent() 返回的最终结果 */
export interface ReActResult {
  /** 模型的最终文本答案（最后一步的文本） */
  text: string
  /** 循环中执行的所有步骤 */
  steps: ReActStep[]
  /** 执行的迭代总次数 */
  iterations: number
  /** 代理是否自然结束（vs 达到迭代上限） */
  finished: boolean
  /** 完整对话历史（包含工具消息） */
  history: ChatMessage[]
}

/** ReAct 循环中实时输出的流式回调 */
export interface ReActStreamCallbacks {
  /** 每个文本 token 流入时触发 */
  onToken?: (token: string) => void
  /** 思考/推理 token 触发（DeepSeek-R1、Claude） */
  onThinking?: (thinking: string) => void
  /** 工具调用即将执行时触发 */
  onToolCallStart?: (toolCall: ToolCall) => void
  /** 工具调用执行完成后触发 */
  onToolCallEnd?: (toolCall: ToolCall, result: ToolResult) => void
}

/** runReActAgent() 的参数 */
export interface ReActAgentParams {
  /** 任务 ID（用于日志追踪） */
  taskId?: string
  /** LLM 连接配置 */
  llm: ReActLLMConfig
  /** 每次请求开头注入的系统提示 */
  systemPrompt?: string
  /** 用户的初始消息 */
  userMessage: string
  /** 已有的对话历史（可选） */
  history?: ChatMessage[]
  /** 传递给模型的工具定义 */
  tools: ToolDefinition[]
  /**
   * 执行工具调用并返回结果。
   * 模型每请求一次工具调用就调用一次。
   * @param name 工具名称
   * @param args 工具参数
   * @param toolCallId 工具调用 ID（可选，用于追踪多个并发的工具调用）
   */
  executeTool: (name: string, args: Record<string, unknown>, toolCallId?: string) => Promise<ToolResult>
  /** 最大 ReAct 迭代次数（默认：10） */
  maxIterations?: number
  /** 对话历史窗口的最大消息数（默认：50） */
  maxHistoryMessages?: number
  /** 是否使用流式 LLM 调用（默认：false） */
  stream?: boolean
  /** 实时 token 输出的流式回调 */
  streamCallbacks?: ReActStreamCallbacks
  /** 每个步骤完成后的可选回调（用于日志/UI 更新） */
  onStep?: (step: ReActStep) => void
  /** 发生错误时的可选回调 */
  onError?: (error: Error) => void
  /** 每次 LLM 请求前触发的可选回调（用于调试查看发送的提示词） */
  onRequest?: (payload: ReActRequestPayload) => void
  /** 上下文压缩器（可选，用于长对话时自动压缩上下文） */
  contextCompressor?: ContextCompressor
  /** 计划上下文（可选，Plan-Execute 模式下传入，用于防止 LLM 提前退出） */
  planContext?: PlanContext
}

/** 每次 LLM 请求前发送的载荷（用于调试） */
export interface ReActRequestPayload {
  /** 当前迭代轮次（从 1 开始） */
  iteration: number
  /** 系统提示词 */
  systemPrompt?: string
  /** 发送给模型的消息列表 */
  messages: ChatMessage[]
  /** 可用工具名称列表 */
  toolNames: string[]
}

// ─── 常量 ─────────────────────────────────────────────────

const DEFAULT_MAX_ITERATIONS = 100
const DEFAULT_MAX_HISTORY = 100
/** Plan-Execute 模式下，LLM 提前退出时最多强制继续的次数 */
const MAX_PLAN_CONTINUATIONS = 5
/** LLM 调用失败后的最大重试次数 */
const MAX_LLM_RETRIES = 2
/** 重试间隔基数（ms），实际间隔 = base × attempt */
const RETRY_BACKOFF_BASE = 1000

// ─── 核心代理循环 ───────────────────────────────────────────

/**
 * 运行 ReAct 代理循环。
 *
 * 代理使用工具定义调用 LLM。如果模型响应包含工具调用，
 * 则执行每个工具并将结果追加到对话历史中。循环重复直到：
 *   - 模型仅返回文本（无工具调用），或
 *   - 达到迭代上限。
 */
export async function runReActAgent(params: ReActAgentParams): Promise<ReActResult> {
  const {
    llm,
    systemPrompt,
    userMessage,
    tools,
    executeTool,
    onStep,
    onError,
    contextCompressor,
    planContext,
  } = params

  const logger = getLogger()
  const taskId = params.taskId ?? 'unknown'

  const maxIterations = params.maxIterations ?? DEFAULT_MAX_ITERATIONS
  const maxHistory = params.maxHistoryMessages ?? DEFAULT_MAX_HISTORY
  const useStream = params.stream ?? false
  const scb = params.streamCallbacks

  // 初始化对话历史
  const history: ChatMessage[] = [...(params.history || [])]
  history.push({ role: 'user', content: userMessage })

  const steps: ReActStep[] = []
  let lastText = ''
  let finished = false
  let continuationCount = 0

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    // 裁剪历史到最近的 maxHistory 条消息（保留系统消息）
    let trimmedHistory = trimHistory(history, maxHistory)

    // 使用上下文压缩器压缩历史（如果配置了压缩器）
    if (contextCompressor) {
      try {
        const beforeCount = trimmedHistory.length
        trimmedHistory = await contextCompressor.maybeCompress(trimmedHistory)
        if (trimmedHistory.length < beforeCount) {
          logger.contextCompress(taskId, beforeCount, trimmedHistory.length, 'llm_summary')
        }
      } catch (err) {
        logger.contextError(taskId, err instanceof Error ? err.message : String(err))
        console.warn('[ReAct] 上下文压缩失败，使用裁剪后的历史:', err)
      }
    }

    // ⚠️ 关键：清理可能因裁剪/压缩产生的孤立 tool 消息
    // trimHistory 或 contextCompressor 可能切断 assistant(tool_calls) + tool 配对，
    // 导致 API 返回 400: "Messages with role 'tool' must be a response to a preceding
    // message with 'tool_calls'"
    sanitizeMessages(trimmedHistory)

    // 构建 LLM 请求
    const requestParams: LLMRequestParams = {
      baseUrl: llm.baseUrl,
      apiKey: llm.apiKey,
      format: llm.format,
      model: llm.model,
      messages: trimmedHistory,
      systemPrompt,
      temperature: llm.temperature,
      maxTokens: llm.maxTokens,
      tools,
    }

    // 请求前回调（用于调试查看提示词）
    params.onRequest?.({
      iteration,
      systemPrompt,
      messages: trimmedHistory,
      toolNames: tools.map(t => t.function.name),
    })

    // 调用 LLM（流式或非流式），带重试机制
    let response!: RawChatResponse
    logger.llmCall(taskId, llm.model)
    let lastError: Error | null = null
    for (let attempt = 0; attempt <= MAX_LLM_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_BACKOFF_BASE * attempt
        console.warn(`[ReAct] LLM 调用失败，${delay}ms 后重试 (第 ${attempt}/${MAX_LLM_RETRIES} 次): ${lastError?.message}`)
        logger.llmCall(taskId, `retry_${attempt}_${llm.model}`)
        await new Promise(r => setTimeout(r, delay))
      }
      try {
        response = useStream
          ? await callLLMStreaming(requestParams, scb)
          : await chatRaw(requestParams)
        logger.llmResponse(taskId, llm.model)
        lastError = null
        break
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        logger.llmError(taskId, llm.model, lastError.message)
      }
    }
    if (lastError) {
      onError?.(lastError)
      return {
        text: lastText,
        steps,
        iterations: iteration - 1,
        finished: false,
        history,
      }
    }

    lastText = response.text

    // 没有工具调用 → 检查是否可以退出
    if (response.toolCalls.length === 0) {
      // Plan-Execute 模式：如果计划还有未完成项，强制 LLM 继续执行
      if (planContext && continuationCount < MAX_PLAN_CONTINUATIONS) {
        const pending = planContext.planItems.filter(
          i => i.status === 'pending' || i.status === 'in_progress'
        )
        if (pending.length > 0) {
          continuationCount++
          const pendingList = pending
            .map(i => `  - [${i.id}] ${i.title} (${i.status === 'in_progress' ? '进行中' : '待执行'})`)
            .join('\n')
          const continuationMsg: ChatMessage = {
            role: 'user',
            content:
              `【系统强制继续】你尚未完成所有计划项。以下 ${pending.length} 个步骤仍未完成，请立即继续执行：\n${pendingList}\n\n` +
              '请勿输出总结或汇报，直接继续执行下一个待执行的计划项。' +
              '使用对应的工具完成操作，并用 update_plan_item 更新状态。',
          }
          history.push({ role: 'assistant', content: response.text })
          history.push(continuationMsg)
          logger.taskStart(taskId, `[plan-continuation] 强制继续第 ${continuationCount} 次，剩余 ${pending.length} 项`)
          console.log(`[ReAct] 计划未完成，注入继续消息 (${continuationCount}/${MAX_PLAN_CONTINUATIONS})，剩余 ${pending.length} 项`)
          continue
        }
      }

      const assistantMsg: ChatMessage = { role: 'assistant', content: response.text }
      if (response.reasoningContent) assistantMsg.reasoning_content = response.reasoningContent
      history.push(assistantMsg)
      const step: ReActStep = {
        iteration,
        text: response.text,
        toolCalls: [],
        toolResults: [],
      }
      steps.push(step)
      try { onStep?.(step) } catch (cbErr) {
        console.warn('[ReAct] onStep 回调异常:', cbErr)
      }
      finished = true
      break
    }

    // ── 存在工具调用 — 执行它们 ──

    // 将带有 tool_calls 的 assistant 消息追加到历史（保留 reasoning_content）
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: response.text || '',
      tool_calls: response.toolCalls.map((tc) => ({
        id: tc.id || `call_${iteration}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    }
    if (response.reasoningContent) assistantMessage.reasoning_content = response.reasoningContent
    history.push(assistantMessage)

    // 执行每个工具调用并收集结果（按顺序执行）
    const toolResults: ToolResult[] = []
    for (let i = 0; i < response.toolCalls.length; i++) {
      const tc = response.toolCalls[i]
      let args: Record<string, unknown> = {}
      try {
        args = tc.arguments ? JSON.parse(tc.arguments) : {}
      } catch {
        args = { raw: tc.arguments }
      }

      try { scb?.onToolCallStart?.(tc) } catch (cbErr) {
        console.warn('[ReAct] onToolCallStart 回调异常:', cbErr)
      }

      let result: ToolResult
      try {
        // 传递 toolCallId 以支持追踪多个并发的工具调用（特别是子代理）
        logger.toolCall(taskId, tc.name, tc.arguments?.slice(0, 300))
        result = await executeTool(tc.name, args, tc.id)
        logger.toolResult(taskId, tc.name, result.success)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        logger.toolError(taskId, tc.name, errMsg)
        result = {
          success: false,
          output: errMsg,
        }
      }

      toolResults.push(result)
      try { scb?.onToolCallEnd?.(tc, result) } catch (cbErr) {
        console.warn('[ReAct] onToolCallEnd 回调异常:', cbErr)
      }

      // 将工具结果消息追加到历史（匹配正确的 tool_call_id）
      const toolCallId = tc.id || assistantMessage.tool_calls![i].id
      history.push({
        role: 'tool',
        content: result.output,
        tool_call_id: toolCallId,
      })
    }

    const step: ReActStep = {
      iteration,
      text: response.text,
      toolCalls: response.toolCalls,
      toolResults,
    }
    steps.push(step)
    try { onStep?.(step) } catch (cbErr) {
      console.warn('[ReAct] onStep 回调异常:', cbErr)
    }
  }

  // 如果耗尽所有迭代仍未完成
  if (!finished) {
    logger.taskAborted(taskId, `达到最大迭代次数 ${maxIterations}`)
    lastText = lastText || '[已达到最大迭代次数，任务终止]'
  }

  return {
    text: lastText,
    steps,
    iterations: steps.length,
    finished,
    history,
  }
}

// ─── 流式 LLM 调用 ────────────────────────────────────────

/**
 * 通过流式调用 LLM 并将结果累积为 RawChatResponse。
 * 实时触发 onToken / onThinking 回调。
 * 支持多工具并行流式返回（通过 index 字段区分）。
 */
function callLLMStreaming(
  params: LLMRequestParams,
  callbacks?: ReActStreamCallbacks,
): Promise<RawChatResponse> {
  return new Promise((resolve, reject) => {
    // 使用 Map 按 index 累积工具调用
    const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>()

    streamChat(params, {
      onToken(token: string) {
        callbacks?.onToken?.(token)
      },
      onThinking(thinking: string) {
        callbacks?.onThinking?.(thinking)
      },
      onToolCall(tc) {
        const idx = tc.index ?? 0
        const existing = toolCallMap.get(idx)
        if (existing) {
          // 累积同一个工具调用的 arguments
          existing.arguments += tc.arguments || ''
          if (tc.id) existing.id = tc.id
          if (tc.name) existing.name = tc.name
        } else {
          // 新的工具调用
          toolCallMap.set(idx, {
            id: tc.id || '',
            name: tc.name || '',
            arguments: tc.arguments || '',
          })
        }
      },
      onComplete(fullText: string, reasoningContent?: string) {
        // 按 index 顺序排列工具调用
        const sortedKeys = Array.from(toolCallMap.keys()).sort((a, b) => a - b)
        const toolCalls: ToolCall[] = sortedKeys.map((key, i) => {
          const tc = toolCallMap.get(key)!
          return {
            id: tc.id || `call_stream_${Date.now()}_${i}`,
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

// ─── 历史裁剪 ──────────────────────────────────────────

/**
 * 裁剪对话历史到最近的 maxMessages 条。
 * 保留第一条系统消息（如果有），然后取
 * 最近的消息来填满上限。
 */
function trimHistory(history: ChatMessage[], maxMessages: number): ChatMessage[] {
  if (history.length <= maxMessages) {
    return [...history]
  }

  // 保留第一条系统消息
  const systemMessages = history.filter((m) => m.role === 'system')
  const nonSystemMessages = history.filter((m) => m.role !== 'system')

  // 保留最近的非系统消息
  const remaining = maxMessages - systemMessages.length
  const trimmed = nonSystemMessages.slice(-Math.max(remaining, 1))

  return [...systemMessages, ...trimmed]
}

// ─── 消息序列清理：修复 tool/assistant 配对 ────────────────────────────────

/**
 * 就地清理消息序列，确保 tool 消息不会成为"孤儿"。
 *
 * OpenAI API 要求：每条 role='tool' 消息之前，必须有一条带 tool_calls 的
 * assistant 消息，且 tool_call_id 一一对应。trimHistory 或 contextCompressor
 * 在任意位置切断消息流时，可能打破这个约束，导致 400 错误。
 *
 * 本函数的处理策略：
 *   1. 移除没有对应 assistant(tool_calls) 的孤立 tool 消息
 *   2. 移除 assistant(tool_calls) 之后缺少全部 tool 响应的情况（防止模型困惑）
 *
 * @param messages 就地修改的消息数组
 */
function sanitizeMessages(messages: ChatMessage[]): void {
  // ── Pass 1：移除没有前置 assistant(tool_calls) 匹配的孤立 tool 消息 ──
  // trackSeenToolCallIds 记录截至当前 tool 消息之前，所有 assistant.tool_calls 的 ID 集合
  const trackSeenToolCallIds = new Set<string>()
  let writeIdx = 0
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]

    // 记录 assistant 消息上声明的 tool_call ID
    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        trackSeenToolCallIds.add(tc.id)
      }
    }

    // tool 消息必须能在已见过的 tool_call ID 中找到自己的 tool_call_id
    if (msg.role === 'tool' && msg.tool_call_id && !trackSeenToolCallIds.has(msg.tool_call_id)) {
      continue // 跳过孤儿 tool 消息
    }

    messages[writeIdx++] = msg
  }
  messages.length = writeIdx

  // ── Pass 2：移除 assistant(tool_calls) 后面缺少任意一个 tool 响应的情况 ──
  // 反向扫描：统计每个 assistant(tool_calls) 之后出现的匹配 tool 消息数量
  const keep = new Array(messages.length).fill(true)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      const expectedIds = new Set(msg.tool_calls.map(tc => tc.id))
      let matched = 0
      for (let j = i + 1; j < messages.length; j++) {
        if (messages[j].role === 'tool' && keep[j] && expectedIds.has(messages[j].tool_call_id!)) {
          matched++
          if (matched >= expectedIds.size) break
        }
      }
      if (matched < expectedIds.size) {
        // assistant(tool_calls) 的工具响应不完整，一并移除
        keep[i] = false
        // 同时移除已匹配的部分 tool 消息，避免它们成为新的孤儿
        for (let j = i + 1; j < messages.length; j++) {
          if (messages[j].role === 'tool' && expectedIds.has(messages[j].tool_call_id!)) {
            keep[j] = false
          }
        }
      }
    }
  }

  // 根据 keep 数组就地压缩
  writeIdx = 0
  for (let i = 0; i < messages.length; i++) {
    if (keep[i]) messages[writeIdx++] = messages[i]
  }
  messages.length = writeIdx
}

// ─── 工具类：JSON 工具调用解析 ──────────────────────────

/**
 * 将工具调用的参数字符串解析为 JSON。
 * 解析失败时返回 null。
 */
export function parseToolCallArgs(argsStr: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(argsStr)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}
