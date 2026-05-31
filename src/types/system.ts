// 记忆 / 上下文 / Soul / 沙箱 / 日志 / 更新 / 诊断
export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

export interface MemoryEntry {
  id: string
  name: string
  description: string
  type: MemoryType
  content: string
  source: string
  created: string
  updated: string
  isPrivate: boolean
}

export interface ContextConfig {
  contextWindowSize: number
  maxOutputTokens: number
  autoCompaction: boolean
  compressionStrategy: 'semantic' | 'truncation' | 'hybrid'
}

export interface SoulConfig {
  personality: string
  proactivityLevel: 'companion' | 'balanced' | 'proactive'
  communicationStyle: string
  customInstructions: string
}

export interface UpdateConfig {
  autoCheck: boolean
  checkIntervalHours: number
  autoInstall: boolean
}

export interface SandboxConfig {
  enabled: boolean
  isolationLevel: 'none' | 'basic' | 'strict'
  allowedCommands: string[]
  blockedPaths: string[]
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogConfig {
  level: LogLevel
  persistLevel: LogLevel
  retentionDays: number
  maxBufferSize: number
}

export type CheckStatus = 'pass' | 'warn' | 'fail'

export interface DiagnosticResult {
  category: string
  name: string
  status: CheckStatus
  message: string
  timestamp: string
}
