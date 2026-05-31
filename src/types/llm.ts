// LLM 模型 & Provider 实例
export type LLMProvider = 'openai' | 'anthropic' | 'deepseek' | 'qwen' | 'doubao' | 'moonshot' | 'minimax' | 'ollama' | 'custom'

export interface LLMConfig {
  provider: LLMProvider
  model: string
  apiKey: string
  baseUrl: string
  maxOutputTokens: number
  contextWindowSize: number
  temperature: number
  enableThinking: boolean
  thinkingBudget: number
}

export type ApiFormat = 'openai-compatible' | 'anthropic'

export interface ModelInfo {
  id: string
  label: string
  /** 模型最大上下文窗口（token 数），可选，用于上下文压缩参考 */
  contextWindow?: number
}

export interface ProviderInstance {
  id: string
  source: 'builtin' | 'custom'
  name: string
  enabled: boolean
  apiFormat: ApiFormat
  baseUrl: string
  apiKey: string
  models: ModelInfo[]
  status: 'unchecked' | 'checking' | 'verified' | 'failed'
  statusMessage?: string
  statusLatency?: number
  sortOrder: number
  userAdded?: boolean
}

export interface ActiveModel {
  providerId: string
  modelId: string
}

export interface ModelCapability {
  id: string
  name: string
  provider: LLMProvider
  contextWindow: number
  maxOutput: number
  supportsVision: boolean
  supportsThinking: boolean
  supportsFunctionCalling: boolean
}
