/**
 * AgentLogger 类型定义
 *
 * 日志分类：
 *   - task:      任务生命周期（开始、完成、失败）
 *   - llm:       LLM 调用（请求、响应、流式中断）
 *   - tool:      工具执行（调用、结果、超时）
 *   - context:   上下文管理（压缩、裁剪）
 *   - system:    系统级异常（网络、文件系统、Tauri invoke 失败）
 *
 * 日志级别：
 *   - info:  正常流程关键节点
 *   - warn:  非致命异常（自动降级、重试）
 *   - error: 致命错误（任务终止、LLM 调用失败）
 */

export type LogLevel = 'info' | 'warn' | 'error'
export type LogCategory = 'task' | 'llm' | 'tool' | 'context' | 'system'

export interface LogEntry {
  /** ISO 时间戳 */
  timestamp: string
  level: LogLevel
  category: LogCategory
  /** 关联的任务 ID（可选） */
  taskId?: string
  /** 日志消息 */
  message: string
  /** 附加数据（错误堆栈、参数等） */
  detail?: string
}

export interface AgentLoggerConfig {
  /** 是否启用持久化到文件（默认 true） */
  persistToFile: boolean
  /** 是否同时输出到 console（默认 true） */
  consoleOutput: boolean
  /** 日志文件保留天数，超过自动清理（默认 30） */
  retentionDays: number
}

export const DEFAULT_LOGGER_CONFIG: AgentLoggerConfig = {
  persistToFile: true,
  consoleOutput: true,
  retentionDays: 30,
}
