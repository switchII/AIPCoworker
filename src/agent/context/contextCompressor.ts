/**
 * 会话上下文压缩器 — 在会话过程中动态监控并压缩上下文。
 *
 * 设计思路：
 *   1. 根据模型的 maxContextTokens 计算可用上下文容量
 *   2. 每轮对话后估算当前消息总 token 数
 *   3. 当总 token 数超过 triggerRatio（如 75%）时触发压缩
 *   4. 压缩策略：保留最近 N 条消息 + 系统提示，将旧消息摘要化
 *   5. 压缩后的消息数组替代原始消息，显著减少上下文长度
 *
 * 使用方式（示例，暂未集成到其他模块）：
 *   import { ContextCompressor } from '@/agent/context/contextCompressor'
 *
 *   const compressor = new ContextCompressor({
 *     maxContextTokens: 128000,
 *     triggerRatio: 0.75,
 *     keepRecentMessages: 6,
 *     llm: { baseUrl, apiKey, format, model },
 *   })
 *
 *   // 每轮对话后检查并压缩
 *   const compressed = await compressor.maybeCompress(messages)
 *   // compressed 可能是原数组（无需压缩）或压缩后的新数组
 */

import { chatRaw, type ChatMessage, type LLMRequestParams } from '../llm/llmClient'
import type { ApiFormat } from '../llm/providerConfigs'

// ─── 配置类型 ────────────────────────────────────────────────

export interface ContextCompressorConfig {
  /** 模型最大上下文 token 数（从 ModelInfo.contextWindow 获取） */
  maxContextTokens: number
  /** 触发压缩的比例阈值（0-1），默认 0.75 */
  triggerRatio?: number
  /** 压缩后保留的最近消息条数，默认 6 */
  keepRecentMessages?: number
  /** 始终保留系统提示，默认 true */
  keepSystemPrompt?: boolean
  /** LLM 配置（用于生成摘要） */
  llm: {
    baseUrl: string
    apiKey: string
    format: ApiFormat
    model: string
  }
  /** 单次摘要最大 token 数，默认 2000 */
  maxSummaryTokens?: number
  /** 字符到 token 的估算比例（默认 4 字符 ≈ 1 token） */
  charsPerToken?: number
  /** 是否启用压缩（默认 true） */
  enabled?: boolean
}

// ─── 内部统计 ────────────────────────────────────────────────

export interface CompressionStats {
  /** 压缩前消息总 token 数（估算） */
  tokensBefore: number
  /** 压缩后消息总 token 数（估算） */
  tokensAfter: number
  /** 被摘要化的消息条数 */
  compressedMessageCount: number
  /** 压缩耗时（ms） */
  durationMs: number
  /** 触发压缩的轮次 */
  compressionRound: number
}

// ─── 常量 ────────────────────────────────────────────────────

const DEFAULT_TRIGGER_RATIO = 0.75
const DEFAULT_KEEP_RECENT = 6
const DEFAULT_CHARS_PER_TOKEN = 4
const DEFAULT_MAX_SUMMARY_TOKENS = 2000

// ─── 核心类 ──────────────────────────────────────────────────

export class ContextCompressor {
  private config: Required<Omit<ContextCompressorConfig, 'llm'>> & { llm: ContextCompressorConfig['llm'] }
  private compressionRound = 0
  private statsHistory: CompressionStats[] = []

  constructor(config: ContextCompressorConfig) {
    this.config = {
      maxContextTokens: config.maxContextTokens,
      triggerRatio: config.triggerRatio ?? DEFAULT_TRIGGER_RATIO,
      keepRecentMessages: config.keepRecentMessages ?? DEFAULT_KEEP_RECENT,
      keepSystemPrompt: config.keepSystemPrompt ?? true,
      maxSummaryTokens: config.maxSummaryTokens ?? DEFAULT_MAX_SUMMARY_TOKENS,
      charsPerToken: config.charsPerToken ?? DEFAULT_CHARS_PER_TOKEN,
      enabled: config.enabled ?? true,
      llm: config.llm,
    }
  }

  /** 获取当前配置 */
  getConfig(): Readonly<ContextCompressorConfig> {
    return { ...this.config }
  }

  /** 更新配置（如切换模型后更新 maxContextTokens） */
  updateConfig(partial: Partial<ContextCompressorConfig>): void {
    Object.assign(this.config, partial)
  }

  /** 获取历史压缩统计 */
  getStatsHistory(): ReadonlyArray<CompressionStats> {
    return this.statsHistory
  }

  /** 估算消息数组的总 token 数 */
  estimateTokens(messages: ChatMessage[]): number {
    let totalChars = 0
    for (const msg of messages) {
      totalChars += msg.content.length
      // role 和 tool_call_id 等字段也占少量 token
      totalChars += 20
    }
    return Math.ceil(totalChars / this.config.charsPerToken)
  }

  /** 获取当前上下文容量使用率（0-1） */
  getUsageRatio(messages: ChatMessage[]): number {
    const tokens = this.estimateTokens(messages)
    return tokens / this.config.maxContextTokens
  }

  /**
   * 检查是否需要压缩，如果需要则执行压缩。
   * 返回压缩后的消息数组（可能是原数组或新数组）。
   */
  async maybeCompress(messages: ChatMessage[]): Promise<ChatMessage[]> {
    if (!this.config.enabled) return messages
    if (messages.length <= this.config.keepRecentMessages + 1) return messages

    const totalTokens = this.estimateTokens(messages)
    const threshold = Math.floor(this.config.maxContextTokens * this.config.triggerRatio)

    if (totalTokens <= threshold) {
      console.log(
        `[ContextCompressor] 上下文正常: ${totalTokens} tokens / ${this.config.maxContextTokens} capacity (${((totalTokens / this.config.maxContextTokens) * 100).toFixed(1)}%)`
      )
      return messages
    }

    console.log(
      `[ContextCompressor] 上下文过大: ${totalTokens} tokens > 阈值 ${threshold} (${(this.config.triggerRatio * 100).toFixed(0)}%), 开始压缩...`
    )

    const startTime = Date.now()

    try {
      const compressed = await this.compress(messages)
      // 压缩可能切断 assistant(tool_calls) + tool 配对，需要清理
      sanitizeCompressedMessages(compressed)
      const tokensAfter = this.estimateTokens(compressed)
      const duration = Date.now() - startTime

      this.compressionRound++
      const stats: CompressionStats = {
        tokensBefore: totalTokens,
        tokensAfter,
        compressedMessageCount: messages.length - compressed.length,
        durationMs: duration,
        compressionRound: this.compressionRound,
      }
      this.statsHistory.push(stats)

      console.log(
        `[ContextCompressor] 压缩完成: ${totalTokens} → ${tokensAfter} tokens, ` +
        `压缩了 ${stats.compressedMessageCount} 条消息, 耗时 ${duration}ms`
      )

      return compressed
    } catch (err) {
      console.warn('[ContextCompressor] 压缩失败，返回原始消息:', err)
      // 降级：硬截断旧消息（保留最近的 + 系统提示）
      return this.hardTruncate(messages)
    }
  }

  // ─── 压缩实现 ──────────────────────────────────────────────

  /**
   * 执行智能压缩：
   * 1. 分离系统提示 + 旧消息 + 最近消息
   * 2. 对旧消息进行 LLM 摘要
   * 3. 将摘要作为一条 system/user 消息插入到最近消息之前
   */
  private async compress(messages: ChatMessage[]): Promise<ChatMessage[]> {
    const { keepRecentMessages, keepSystemPrompt } = this.config

    // 1. 分离消息
    let systemPrompt: ChatMessage | null = null
    let workingMessages = [...messages]

    if (keepSystemPrompt && workingMessages[0]?.role === 'system') {
      systemPrompt = workingMessages.shift()!
    }

    // 分割为旧消息和最近消息
    const recentStart = Math.max(0, workingMessages.length - keepRecentMessages)
    const oldMessages = workingMessages.slice(0, recentStart)
    const recentMessages = workingMessages.slice(recentStart)

    if (oldMessages.length === 0) return messages

    // 2. 生成摘要
    const summary = await this.generateSummary(oldMessages)

    // 3. 构建压缩后的消息
    const compressed: ChatMessage[] = []

    if (systemPrompt) {
      compressed.push(systemPrompt)
    }

    // 插入摘要消息
    compressed.push({
      role: 'user',
      content: [
        `[会话上下文摘要 — 以下是之前 ${oldMessages.length} 轮对话的压缩摘要]`,
        '',
        summary,
        '',
        `[摘要结束 — 以下是最新的对话内容]`,
      ].join('\n'),
    })

    compressed.push(...recentMessages)

    return compressed
  }

  /** 使用 LLM 对旧消息生成摘要 */
  private async generateSummary(messages: ChatMessage[]): Promise<string> {
    // 准备摘要输入：限制总字符数避免摘要请求本身过大
    const MAX_INPUT_CHARS = 30000
    const formatted = this.formatMessagesForSummary(messages, MAX_INPUT_CHARS)

    const systemPrompt = [
      '你是一个专业的会话上下文压缩器。你的任务是将对话历史压缩为简洁的摘要。',
      '',
      '规则：',
      '1. 保留关键决策、重要结论和用户明确的要求',
      '2. 保留代码修改的文件名和关键改动点',
      '3. 保留工具调用的结果摘要（成功/失败、关键数据）',
      '4. 保留用户表达的偏好和约束条件',
      '5. 丢弃冗余的问候、确认性对话和重复内容',
      '6. 使用结构化的中文输出，按主题分组',
      '7. 摘要长度控制在 300-800 字之间',
      '',
      '输出格式：',
      '## 会话摘要',
      '### 关键决策',
      '- ...',
      '### 已完成的工作',
      '- ...',
      '### 待处理事项',
      '- ...',
      '### 用户偏好与约束',
      '- ...',
    ].join('\n')

    const params: LLMRequestParams = {
      baseUrl: this.config.llm.baseUrl,
      apiKey: this.config.llm.apiKey,
      format: this.config.llm.format,
      model: this.config.llm.model,
      messages: [{ role: 'user', content: `请压缩以下对话历史：\n\n${formatted}` }],
      systemPrompt,
      temperature: 0.2,
      maxTokens: this.config.maxSummaryTokens,
    }

    const response = await chatRaw(params)
    const summary = response.text.trim()

    return summary || '（摘要生成失败，请基于后续对话继续工作）'
  }

  /** 将消息格式化为可读的文本，用于摘要输入 */
  private formatMessagesForSummary(messages: ChatMessage[], maxChars: number): string {
    const parts: string[] = []
    let totalChars = 0

    for (const msg of messages) {
      const roleLabel = this.getRoleLabel(msg.role)
      let content = msg.content

      // 截断单条过长的内容（如大型工具输出）
      if (content.length > 3000) {
        content = content.slice(0, 3000) + `\n... [内容过长已截断，原长度 ${msg.content.length} 字符]`
      }

      const line = `[${roleLabel}]: ${content}`
      if (totalChars + line.length > maxChars) {
        parts.push(`\n... [剩余 ${messages.length - parts.length} 条消息已省略]`)
        break
      }

      parts.push(line)
      totalChars += line.length
    }

    return parts.join('\n\n')
  }

  /** 将消息角色转为可读标签 */
  private getRoleLabel(role: string): string {
    switch (role) {
      case 'user': return '用户'
      case 'assistant': return '助手'
      case 'system': return '系统'
      case 'tool': return '工具'
      default: return role
    }
  }

  /** 降级方案：硬截断，保留系统提示 + 最近消息 */
  private hardTruncate(messages: ChatMessage[]): ChatMessage[] {
    const { keepRecentMessages, keepSystemPrompt } = this.config
    const result: ChatMessage[] = []

    if (keepSystemPrompt && messages[0]?.role === 'system') {
      result.push(messages[0])
    }

    const start = Math.max(keepSystemPrompt ? 1 : 0, messages.length - keepRecentMessages)

    // 插入一条提示消息
    result.push({
      role: 'user',
      content: `[上下文压缩提示] 之前的 ${start - (keepSystemPrompt ? 1 : 0)} 条对话消息因上下文长度限制已被移除。请基于当前可见的对话内容继续工作。`,
    })

    result.push(...messages.slice(start))

    // 截断可能切断 assistant(tool_calls) + tool 配对，需要清理
    sanitizeCompressedMessages(result)

    console.warn(
      `[ContextCompressor] 降级截断: ${messages.length} → ${result.length} 条消息`
    )

    return result
  }
}

// ─── 便捷工厂函数 ────────────────────────────────────────────

/**
 * 根据模型 ID 创建上下文压缩器。
 * 自动从模型能力表中查找 contextWindow。
 */
export function createContextCompressor(
  config: ContextCompressorConfig,
): ContextCompressor {
  return new ContextCompressor(config)
}

/**
 * 快速估算一组消息的 token 数（无需实例化压缩器）。
 * 使用简单的字符数 / 4 估算。
 */
export function estimateMessageTokens(messages: ChatMessage[], charsPerToken = 4): number {
  let totalChars = 0
  for (const msg of messages) {
    totalChars += msg.content.length + 20
  }
  return Math.ceil(totalChars / charsPerToken)
}

/**
 * 判断是否需要压缩（快速检查，不执行压缩）。
 */
export function shouldCompress(
  messages: ChatMessage[],
  maxContextTokens: number,
  triggerRatio = DEFAULT_TRIGGER_RATIO,
): boolean {
  const tokens = estimateMessageTokens(messages)
  return tokens > Math.floor(maxContextTokens * triggerRatio)
}

// ─── 消息序列清理 ──────────────────────────────────────────

/**
 * 就地清理压缩后可能产生的孤立 tool 消息。
 *
 * OpenAI API 要求：每条 role='tool' 消息之前，必须有一条带 tool_calls 的
 * assistant 消息，且 tool_call_id 一一对应。压缩在任意位置切断消息流时，
 * 可能打破这个约束，导致 400 错误。
 */
function sanitizeCompressedMessages(messages: ChatMessage[]): void {
  // Pass 1：移除没有前置 assistant(tool_calls) 匹配的孤立 tool 消息
  const seenToolCallIds = new Set<string>()
  let writeIdx = 0
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) seenToolCallIds.add(tc.id)
    }
    if (msg.role === 'tool' && msg.tool_call_id && !seenToolCallIds.has(msg.tool_call_id)) {
      continue // 跳过孤儿 tool 消息
    }
    messages[writeIdx++] = msg
  }
  messages.length = writeIdx

  // Pass 2：移除 assistant(tool_calls) 后面缺少完整 tool 响应的情况
  const keep = new Array(messages.length).fill(true)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      const expectedIds = new Set(msg.tool_calls.map(tc => tc.id))
      let matched = 0
      for (let j = i + 1; j < messages.length; j++) {
        if (messages[j].role === 'tool' && keep[j] && expectedIds.has(messages[j].tool_call_id!)) {
          if (++matched >= expectedIds.size) break
        }
      }
      if (matched < expectedIds.size) {
        keep[i] = false
        for (let j = i + 1; j < messages.length; j++) {
          if (messages[j].role === 'tool' && expectedIds.has(messages[j].tool_call_id!)) keep[j] = false
        }
      }
    }
  }
  writeIdx = 0
  for (let i = 0; i < messages.length; i++) {
    if (keep[i]) messages[writeIdx++] = messages[i]
  }
  messages.length = writeIdx
}
