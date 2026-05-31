/**
 * Agent Logger 模块
 *
 * 提供 Agent 执行过程的日志记录能力，支持分类与按日归档。
 *
 * 用法：
 *   import { getLogger } from '../logger'
 *   const logger = getLogger()
 *   logger.taskStart(taskId, input)
 *   logger.taskComplete(taskId, result, elapsedSeconds)
 *   logger.taskError(taskId, reason, errorMessage, stack)
 */

export { AgentLogger, getLogger } from './logger'
export type { LogEntry, LogLevel, LogCategory, AgentLoggerConfig } from './types'
export { DEFAULT_LOGGER_CONFIG } from './types'
