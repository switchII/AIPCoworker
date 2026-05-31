import { ref, computed } from 'vue'
import type { Conversation, ChatMessage } from '../../types/agent'

export function useConversationManager() {
  const conversations = ref<Conversation[]>([])
  const currentConversationId = ref<string | null>(null)
  const currentConversation = computed(() =>
    conversations.value.find(c => c.id === currentConversationId.value)
  )
  const isAgentRunning = ref(false)

  function createConversation(agentId: string = 'default'): string {
    const id = `conv-${Date.now()}`
    conversations.value.push({
      id, title: '新对话', messages: [], agentId,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    })
    currentConversationId.value = id
    return id
  }

  function addMessage(conversationId: string, message: ChatMessage) {
    const conv = conversations.value.find(c => c.id === conversationId)
    if (conv) {
      conv.messages.push(message)
      conv.updatedAt = new Date().toISOString()
      if (message.role === 'user' && conv.messages.length <= 2) {
        conv.title = message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '')
      }
    }
  }

  function updateMessage(conversationId: string, messageId: string, updates: Partial<ChatMessage>) {
    const conv = conversations.value.find(c => c.id === conversationId)
    if (conv) {
      const msg = conv.messages.find(m => m.id === messageId)
      if (msg) Object.assign(msg, updates)
    }
  }

  return {
    conversations, currentConversationId, currentConversation, isAgentRunning,
    createConversation, addMessage, updateMessage
  }
}
