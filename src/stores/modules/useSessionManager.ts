import { ref, shallowRef, computed, triggerRef } from 'vue'
import { getSessionManager, type Session, type ChatRound } from '../../agent/session'
import type { ChatMessage } from '../../agent/llm/llmClient'

export function useSessionManager() {
  const sessionManager = getSessionManager()
  const currentTaskId = ref<string | null>(null)
  // 使用 shallowRef 持有当前 Session 对象引用，确保响应式更新
  const _currentSessionRef = shallowRef<Session | null>(null)
  const currentSession = computed(() => {
    // 依赖 currentTaskId 以在切换任务时重新计算
    const tId = currentTaskId.value
    if (!tId) return null
    // 返回 _currentSessionRef 持有的引用（与 sessionManager 中的对象一致）
    return _currentSessionRef.value ?? sessionManager.getSession(tId)
  })

  let saveTimer: ReturnType<typeof setTimeout> | null = null

  /** 强制触发 currentSession 重新计算 */
  function touch() {
    triggerRef(_currentSessionRef)
  }

  /** 防抖保存会话 */
  function scheduleSave(taskId: string) {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      sessionManager.saveSession(taskId)
    }, 500)
  }

  /** 确保会话存在（从磁盘加载或创建新的） */
  async function ensureSession(taskId: string): Promise<Session> {
    let session = sessionManager.getSession(taskId)
    if (!session) {
      // 尝试从磁盘加载
      session = await sessionManager.loadSession(taskId)
      if (!session) {
        // 创建新会话
        session = sessionManager.getOrCreateSession(taskId)
      }
    }
    currentTaskId.value = taskId
    _currentSessionRef.value = session
    return session
  }

  /** 切换当前会话 */
  function switchSession(taskId: string): Session | null {
    const session = sessionManager.getSession(taskId)
    currentTaskId.value = taskId
    _currentSessionRef.value = session
    return session
  }

  /** 更新对话历史 */
  function updateSessionHistory(taskId: string, history: ChatMessage[]) {
    sessionManager.updateHistory(taskId, history)
    scheduleSave(taskId)
    touch()
  }

  /** 添加对话轮次 */
  function addSessionChatRound(taskId: string, round: ChatRound) {
    sessionManager.addChatRound(taskId, round)
    scheduleSave(taskId)
    touch()
  }

  /** 更新对话轮次 */
  function updateSessionChatRound(taskId: string, index: number, updates: Partial<ChatRound>) {
    sessionManager.updateChatRound(taskId, index, updates)
    scheduleSave(taskId)
    touch()
  }

  /** 快照当前轮次 */
  function snapshotSessionRound(taskId: string, report?: string, genFiles?: { name: string; type: string; content: string }[], elapsedSeconds?: number) {
    sessionManager.snapshotRound(taskId, report, genFiles, elapsedSeconds)
    scheduleSave(taskId)
    touch()
  }

  /** 删除会话 */
  function deleteSession(taskId: string) {
    sessionManager.deleteSession(taskId)
    if (currentTaskId.value === taskId) {
      _currentSessionRef.value = null
    }
    touch()
  }

  return {
    currentTaskId,
    currentSession,
    ensureSession,
    switchSession,
    updateSessionHistory,
    addSessionChatRound,
    updateSessionChatRound,
    snapshotSessionRound,
    deleteSession,
  }
}
