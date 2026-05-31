/**
 * AgentLogger — Agent 执行日志记录器
 *
 * 日志持久化到 ~/.aipcowork/logs/{category}/{YYYY-MM-DD}.log
 * 每行一条 JSON（JSONL 格式），便于后续检索与分析。
 *
 * 日志分类目录结构：
 *   ~/.aipcowork/logs/
 *     ├── task/2026-05-28.log        ← 任务生命周期
 *     ├── llm/2026-05-28.log         ← LLM 调用
 *     ├── tool/2026-05-28.log        ← 工具执行
 *     ├── context/2026-05-28.log     ← 上下文管理
 *     └── system/2026-05-28.log      ← 系统异常
 *
 * 使用：
 *   import { getLogger } from '../logger'
 *   const logger = getLogger()
 *   logger.taskStart('task-123', '分析 k8s 集群')
 *   logger.taskComplete('task-123', 'success', '报告已生成')
 *   logger.taskError('task-123', 'llm_timeout', 'LLM 调用超时')
 *   logger.llmCall('task-123', 'gpt-4', 1500)
 *   logger.toolCall('task-123', 'read_file', '/tmp/test.txt')
 */

import type { LogEntry, LogLevel, LogCategory, AgentLoggerConfig } from './types'
import { DEFAULT_LOGGER_CONFIG } from './types'

/** 日志文件根目录（相对于 ~/.aipcowork） */
const LOG_BASE = 'logs'

/** 刷新间隔（毫秒） */
const FLUSH_INTERVAL_MS = 5000

/** 缓冲区大小阈值，达到后自动刷新 */
const BUFFER_FLUSH_SIZE = 20

export class AgentLogger {
  private config: AgentLoggerConfig
  /** 写缓冲区，按文件路径分组 */
  private buffer: Map<string, string[]> = new Map()
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private initialized = false

  constructor(config?: Partial<AgentLoggerConfig>) {
    this.config = { ...DEFAULT_LOGGER_CONFIG, ...config }
  }

  // ─── 初始化与清理 ──────────────────────────────────────────

  /** 启动定时刷新 */
  init() {
    if (this.initialized) return
    this.initialized = true
    if (this.config.persistToFile) {
      this.flushTimer = setInterval(() => {
        this.flushAll().catch(err => {
          console.warn('[AgentLogger] flush failed:', err)
        })
      }, FLUSH_INTERVAL_MS)
    }
  }

  /** 停止定时刷新，立即刷盘 */
  async destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    await this.flushAll()
    this.initialized = false
  }

  // ─── 任务生命周期日志 ────────────────────────────────────────

  /** 任务开始 */
  taskStart(taskId: string, input: string, extra?: Record<string, unknown>) {
    this.log('info', 'task', taskId, `任务开始: ${input.slice(0, 200)}`, extra ? JSON.stringify(extra) : undefined)
  }

  /** 任务完成（成功） */
  taskComplete(taskId: string, result: string, elapsedSeconds?: number) {
    const detail = elapsedSeconds != null ? `耗时 ${elapsedSeconds.toFixed(1)}s` : undefined
    this.log('info', 'task', taskId, `任务完成: ${result.slice(0, 300)}`, detail)
  }

  /** 任务失败（重点记录退出原因） */
  taskError(taskId: string, reason: string, errorMessage?: string, stack?: string) {
    const parts: string[] = []
    if (errorMessage) parts.push(errorMessage)
    if (stack) parts.push(stack.split('\n').slice(0, 5).join('\n'))
    this.log('error', 'task', taskId, `任务失败 [${reason}]`, parts.join('\n') || undefined)
  }

  /** 任务中止（用户主动取消或超时） */
  taskAborted(taskId: string, reason: string) {
    this.log('warn', 'task', taskId, `任务中止 [${reason}]`)
  }

  // ─── LLM 调用日志 ──────────────────────────────────────────

  /** LLM 请求发起 */
  llmCall(taskId: string, model: string, estimatedTokens?: number) {
    const detail = estimatedTokens != null ? `~${estimatedTokens} tokens` : undefined
    this.log('info', 'llm', taskId, `LLM 请求: ${model}`, detail)
  }

  /** LLM 响应完成 */
  llmResponse(taskId: string, model: string, usage?: { promptTokens?: number; completionTokens?: number }) {
    const detail = usage ? `prompt=${usage.promptTokens ?? '?'}, completion=${usage.completionTokens ?? '?'}` : undefined
    this.log('info', 'llm', taskId, `LLM 响应: ${model}`, detail)
  }

  /** LLM 调用失败 */
  llmError(taskId: string, model: string, error: string, statusCode?: number) {
    const detail = statusCode != null ? `HTTP ${statusCode}` : undefined
    this.log('error', 'llm', taskId, `LLM 失败 [${model}]: ${error.slice(0, 200)}`, detail)
  }

  /** LLM 流式中断 */
  llmStreamAbort(taskId: string, model: string, reason: string) {
    this.log('warn', 'llm', taskId, `LLM 流式中断 [${model}]: ${reason}`)
  }

  // ─── 工具执行日志 ──────────────────────────────────────────

  /** 工具调用 */
  toolCall(taskId: string, toolName: string, params?: string) {
    this.log('info', 'tool', taskId, `工具调用: ${toolName}`, params?.slice(0, 500))
  }

  /** 工具执行完成 */
  toolResult(taskId: string, toolName: string, success: boolean, elapsedMs?: number) {
    const detail = elapsedMs != null ? `${elapsedMs}ms` : undefined
    this.log(success ? 'info' : 'warn', 'tool', taskId, `工具结果 [${toolName}]: ${success ? '成功' : '失败'}`, detail)
  }

  /** 工具执行异常 */
  toolError(taskId: string, toolName: string, error: string) {
    this.log('error', 'tool', taskId, `工具异常 [${toolName}]: ${error.slice(0, 300)}`)
  }

  // ─── 上下文管理日志 ─────────────────────────────────────────

  /** 上下文压缩 */
  contextCompress(taskId: string, beforeTokens: number, afterTokens: number, method: string) {
    this.log('info', 'context', taskId, `上下文压缩 [${method}]: ${beforeTokens} → ${afterTokens} tokens`)
  }

  /** 上下文裁剪 */
  contextTrim(taskId: string, beforeCount: number, afterCount: number) {
    this.log('info', 'context', taskId, `上下文裁剪: ${beforeCount} → ${afterCount} 条消息`)
  }

  /** 上下文异常 */
  contextError(taskId: string, error: string) {
    this.log('error', 'context', taskId, `上下文异常: ${error.slice(0, 300)}`)
  }

  // ─── 系统日志 ──────────────────────────────────────────────

  /** 系统信息 */
  systemInfo(message: string, detail?: string) {
    this.log('info', 'system', undefined, message, detail)
  }

  /** 系统警告 */
  systemWarn(message: string, detail?: string) {
    this.log('warn', 'system', undefined, message, detail)
  }

  /** 系统错误 */
  systemError(message: string, error?: Error | string) {
    const detail = error instanceof Error
      ? `${error.message}\n${error.stack?.split('\n').slice(0, 5).join('\n') ?? ''}`
      : error
    this.log('error', 'system', undefined, message, detail)
  }

  // ─── 通用日志方法 ──────────────────────────────────────────

  /** 写入一条日志 */
  log(level: LogLevel, category: LogCategory, taskId: string | undefined, message: string, detail?: string) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      taskId,
      message,
      detail,
    }

    // Console 输出
    if (this.config.consoleOutput) {
      const prefix = `[${entry.level.toUpperCase()}] [${entry.category}]`
      const taskTag = taskId ? ` [${taskId}]` : ''
      const msg = `${prefix}${taskTag} ${entry.message}`
      if (level === 'error') {
        console.error(msg, entry.detail ?? '')
      } else if (level === 'warn') {
        console.warn(msg, entry.detail ?? '')
      } else {
        console.log(msg)
      }
    }

    // 持久化到文件
    if (this.config.persistToFile) {
      const line = JSON.stringify(entry)
      const date = this.getDateStr()
      const filePath = `${LOG_BASE}/${category}/${date}.log`

      if (!this.buffer.has(filePath)) {
        this.buffer.set(filePath, [])
      }
      this.buffer.get(filePath)!.push(line)

      // 达到阈值自动刷新
      if (this.buffer.get(filePath)!.length >= BUFFER_FLUSH_SIZE) {
        this.flushFile(filePath).catch(err => {
          console.warn('[AgentLogger] auto-flush failed:', err)
        })
      }
    }
  }

  /** 手动刷新所有缓冲日志到磁盘 */
  async flushAll() {
    const paths = Array.from(this.buffer.keys())
    for (const filePath of paths) {
      await this.flushFile(filePath)
    }
  }

  // ─── 内部方法 ──────────────────────────────────────────────

  /** 将指定文件的缓冲区写入磁盘 */
  private async flushFile(filePath: string) {
    const lines = this.buffer.get(filePath)
    if (!lines || lines.length === 0) return

    // 取出当前缓冲，清空
    this.buffer.set(filePath, [])
    const content = lines.join('\n') + '\n'

    try {
      // 读取已有内容并追加（Tauri write_memory_file 会覆盖，所以先 read 再 append）
      let existing = ''
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        existing = await invoke<string>('read_memory_file', { path: filePath })
      } catch {
        // 文件不存在，忽略
      }

      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('write_memory_file', {
        path: filePath,
        content: existing + content,
      })
    } catch (err) {
      console.warn(`[AgentLogger] 写入日志文件失败 [${filePath}]:`, err)
      // 写失败不丢日志，放回缓冲区头部
      const current = this.buffer.get(filePath) ?? []
      this.buffer.set(filePath, [...lines, ...current])
    }
  }

  /** 获取当前日期字符串 YYYY-MM-DD（本地时间） */
  private getDateStr(): string {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
}

// ─── 单例管理 ──────────────────────────────────────────────────

let instance: AgentLogger | null = null

/** 获取全局 AgentLogger 单例 */
export function getLogger(config?: Partial<AgentLoggerConfig>): AgentLogger {
  if (!instance) {
    instance = new AgentLogger(config)
    instance.init()
  }
  return instance
}
