// 会话消息
export type MessageRole = 'user' | 'assistant' | 'system'
export type ToolCallStatus = 'running' | 'success' | 'error' | 'warning'

export interface ToolCall {
  id: string
  name: string
  description: string
  input: string
  output?: string
  status: ToolCallStatus
  duration?: number
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: string
  toolCalls?: ToolCall[]
  thinking?: string
  isStreaming?: boolean
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  agentId: string
  createdAt: string
  updatedAt: string
}
