import type { ChatMessage } from '../llm/llmClient'

/** 对话轮次 — 记录一次用户输入及其执行结果 */
export interface ChatRound {
  input: string
  startBlockCount: number
  report?: string
  genFiles?: { name: string; type: string; content: string }[]
  elapsedSeconds?: number
  completed?: boolean
}

/** 会话 — 绑定到一个任务的完整对话上下文 */
export interface Session {
  id: string              // same as taskId
  taskId: string
  conversationHistory: ChatMessage[]
  chatRounds: ChatRound[]
  createdAt: string
  updatedAt: string
}
