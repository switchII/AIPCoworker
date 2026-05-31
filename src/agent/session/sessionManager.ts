import { invoke } from '@tauri-apps/api/core'
import type { ChatMessage } from '../llm/llmClient'
import type { Session, ChatRound } from './types'

/** 会话管理器 — 管理所有任务的会话上下文 */
export class SessionManager {
  private sessions = new Map<string, Session>()

  /** 获取或创建会话 */
  getOrCreateSession(taskId: string): Session {
    let session = this.sessions.get(taskId)
    if (!session) {
      session = {
        id: taskId,
        taskId,
        conversationHistory: [],
        chatRounds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      this.sessions.set(taskId, session)
    }
    return session
  }

  /** 获取会话（不存在返回 null） */
  getSession(taskId: string): Session | null {
    return this.sessions.get(taskId) || null
  }

  /** 更新对话历史 */
  updateHistory(taskId: string, history: ChatMessage[]): void {
    const session = this.getOrCreateSession(taskId)
    session.conversationHistory = history
    session.updatedAt = new Date().toISOString()
  }

  /** 添加对话轮次 */
  addChatRound(taskId: string, round: ChatRound): void {
    const session = this.getOrCreateSession(taskId)
    session.chatRounds.push(round)
    session.updatedAt = new Date().toISOString()
  }

  /** 更新对话轮次 */
  updateChatRound(taskId: string, index: number, updates: Partial<ChatRound>): void {
    const session = this.sessions.get(taskId)
    if (session && session.chatRounds[index]) {
      Object.assign(session.chatRounds[index], updates)
      session.updatedAt = new Date().toISOString()
    }
  }

  /** 快照当前轮次（记录执行结果） */
  snapshotRound(taskId: string, report?: string, genFiles?: { name: string; type: string; content: string }[], elapsedSeconds?: number): void {
    const session = this.sessions.get(taskId)
    if (!session) return
    const lastRound = session.chatRounds[session.chatRounds.length - 1]
    if (lastRound && !lastRound.completed) {
      lastRound.report = report
      lastRound.genFiles = genFiles ? [...genFiles] : []
      lastRound.elapsedSeconds = elapsedSeconds
      lastRound.completed = true
      session.updatedAt = new Date().toISOString()
    }
  }

  /** 保存会话到磁盘 */
  async saveSession(taskId: string): Promise<void> {
    const session = this.sessions.get(taskId)
    if (!session) return
    try {
      await invoke('save_session', {
        sessionId: session.id,
        sessionJson: JSON.stringify(session),
      })
    } catch (e) {
      console.warn('[SessionManager] 保存会话失败:', e)
    }
  }

  /** 从磁盘加载会话 */
  async loadSession(taskId: string): Promise<Session | null> {
    try {
      const json = await invoke<string>('load_session', { sessionId: taskId })
      // 文件不存在时 Rust 返回 "null"，JSON.parse 结果为 null
      const parsed = JSON.parse(json)
      if (!parsed) return null
      const session = parsed as Session
      this.sessions.set(taskId, session)
      return session
    } catch (e) {
      console.warn('[SessionManager] 加载会话失败:', e)
      return null
    }
  }

  /** 删除会话 */
  deleteSession(taskId: string): void {
    this.sessions.delete(taskId)
  }

  /** 获取所有会话 */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values())
  }
}

let instance: SessionManager | null = null

/** 获取全局 SessionManager 实例 */
export function getSessionManager(): SessionManager {
  if (!instance) {
    instance = new SessionManager()
  }
  return instance
}
