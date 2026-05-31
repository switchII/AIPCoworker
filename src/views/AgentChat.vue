<script setup lang="ts">
import { ref, nextTick, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAgentStore } from '../stores/agentStore'
import { runAgentLoop, buildSystemPrompt } from '../services/agentLoop'
import type { ChatMessage, ToolCall } from '../types/agent'

const route = useRoute()
const router = useRouter()
const store = useAgentStore()

// ===== 状态 =====
const isRunning = ref(false)
const chatInput = ref('')
const messagesRef = ref<HTMLElement | null>(null)
const streamingContent = ref('')
const streamingThinking = ref('')
const streamingToolCalls = ref<ToolCall[]>([])
const showThinking = ref<Record<string, boolean>>({})
const showToolOutput = ref<Record<string, boolean>>({})
const errorMessage = ref('')
const workDir = ref('')

// 会话消息列表
const messages = computed(() => store.currentConversation?.messages || [])

// ===== 初始化：接收新任务或恢复对话 =====
onMounted(() => {
  // 从 query 获取任务参数
  const taskText = route.query.task as string
  const dirParam = route.query.dir as string

  if (dirParam) workDir.value = dirParam

  // 创建新对话
  store.createConversation(store.currentAgentId)

  // 如果有任务文本，自动发送
  if (taskText) {
    nextTick(() => {
      chatInput.value = taskText
      sendMessage()
    })
  }
})

// ===== 滚动到底部 =====
function scrollToBottom() {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

// ===== 发送消息 =====
async function sendMessage() {
  const text = chatInput.value.trim()
  if (!text || isRunning.value) return

  // 检查 API Key 配置
  if (!store.llmConfig.apiKey) {
    errorMessage.value = '请先配置 API Key。点击右上角设置按钮进入 Agent 设置。'
    return
  }

  errorMessage.value = ''
  chatInput.value = ''

  // 确保对话存在
  if (!store.currentConversationId) {
    store.createConversation(store.currentAgentId)
  }

  // 添加用户消息
  const userMsg: ChatMessage = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content: text,
    timestamp: new Date().toISOString()
  }
  store.addMessage(store.currentConversationId!, userMsg)
  scrollToBottom()

  // 启动 Agent Loop
  isRunning.value = true
  streamingContent.value = ''
  streamingThinking.value = ''
  streamingToolCalls.value = []

  // 构建系统提示词
  const systemPrompt = buildSystemPrompt({
    soulPersonality: store.soulConfig.personality,
    agentName: store.currentAgent.name,
    agentSystemPrompt: store.currentAgent.systemPrompt,
    skills: store.skills.filter(s => s.enabled).map(s => s.name),
    permissionMode: store.permissionConfig.mode,
    customInstructions: store.soulConfig.customInstructions + (workDir.value ? `\n\n当前工作目录: ${workDir.value}` : '')
  })

  try {
    await runAgentLoop({
      conversationId: store.currentConversationId!,
      messages: messages.value,
      systemPrompt,
      llmConfig: store.llmConfig,
      maxTurns: store.currentAgent.maxTurns,
      onToken: (token: string) => {
        streamingContent.value += token
        scrollToBottom()
      },
      onThinking: (thinking: string) => {
        streamingThinking.value += thinking
        scrollToBottom()
      },
      onToolCallStart: (toolCall: ToolCall) => {
        streamingToolCalls.value.push({ ...toolCall })
        scrollToBottom()
      },
      onToolCallEnd: (toolCall: ToolCall) => {
        const idx = streamingToolCalls.value.findIndex(tc => tc.id === toolCall.id)
        if (idx >= 0) {
          streamingToolCalls.value[idx] = { ...toolCall }
        }
        scrollToBottom()
      },
      onComplete: (message: ChatMessage) => {
        // 合并流式内容
        if (!message.content && streamingContent.value) {
          message.content = streamingContent.value
        }
        message.thinking = streamingThinking.value || undefined
        message.toolCalls = streamingToolCalls.value.length > 0 ? [...streamingToolCalls.value] : undefined

        store.addMessage(store.currentConversationId!, message)
        streamingContent.value = ''
        streamingThinking.value = ''
        streamingToolCalls.value = []
        isRunning.value = false
        scrollToBottom()
      },
      onError: (error: Error) => {
        errorMessage.value = error.message
        streamingContent.value = ''
        streamingThinking.value = ''
        streamingToolCalls.value = []
        isRunning.value = false
      }
    })
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
    isRunning.value = false
  }
}

// ===== 键盘事件 =====
function handleKeydown(e: KeyboardEvent) {
  // Skip if IME is composing (e.g. Chinese/Japanese input method on Mac)
  if (e.isComposing) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

// ===== 新对话 =====
function newConversation() {
  store.createConversation(store.currentAgentId)
  streamingContent.value = ''
  streamingThinking.value = ''
  streamingToolCalls.value = []
  errorMessage.value = ''
  router.replace({ path: '/chat' })
}

// ===== 返回首页 =====
function goHome() {
  router.push('/new-task')
}

// ===== 设置 =====
function goToSettings() {
  router.push('/agent-settings')
}

// ===== 停止生成 =====
function stopGeneration() {
  // 通过 LLM service abort
  import('../services/llmService').then(mod => {
    const service = mod.getLLMService(store.llmConfig)
    service.abort()
  })
  isRunning.value = false
  if (streamingContent.value) {
    const msg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: streamingContent.value + '\n\n[已停止生成]',
      timestamp: new Date().toISOString(),
      thinking: streamingThinking.value || undefined,
      toolCalls: streamingToolCalls.value.length > 0 ? [...streamingToolCalls.value] : undefined
    }
    store.addMessage(store.currentConversationId!, msg)
  }
  streamingContent.value = ''
  streamingThinking.value = ''
  streamingToolCalls.value = []
}

// ===== UI 辅助 =====
function toggleThinking(id: string) {
  showThinking.value[id] = !showThinking.value[id]
}

function toggleToolOutput(id: string) {
  showToolOutput.value[id] = !showToolOutput.value[id]
}

function getToolIcon(name: string): string {
  const icons: Record<string, string> = {
    'web_search': 'fa-solid fa-globe',
    'read_file': 'fa-solid fa-file-lines',
    'write_file': 'fa-solid fa-pen-to-square',
    'run_command': 'fa-solid fa-terminal',
    'list_directory': 'fa-solid fa-folder-open',
    'edit_file': 'fa-solid fa-code',
    'find_files': 'fa-solid fa-magnifying-glass',
    'http_fetch': 'fa-solid fa-link',
    'generate_image': 'fa-solid fa-image',
  }
  return icons[name] || 'fa-solid fa-wrench'
}
</script>

<template>
  <div class="agent-chat-page">
    <!-- 顶部栏 -->
    <header class="chat-header">
      <div class="header-left">
        <button class="header-btn" @click="goHome" title="返回">
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <span class="agent-badge">{{ store.currentAgent.avatar }}</span>
        <span class="agent-label">{{ store.currentAgent.name }}</span>
        <span class="model-badge">{{ store.llmConfig.model }}</span>
      </div>
      <div class="header-right">
        <button class="header-btn" @click="newConversation" title="新对话">
          <i class="fa-solid fa-plus"></i>
        </button>
        <button class="header-btn" @click="goToSettings" title="Agent 设置">
          <i class="fa-solid fa-gear"></i>
        </button>
      </div>
    </header>

    <!-- 消息区 -->
    <div class="chat-messages" ref="messagesRef">
      <!-- 空状态 -->
      <div v-if="messages.length === 0 && !streamingContent && !isRunning" class="welcome-state">
        <div class="welcome-avatar">{{ store.currentAgent.avatar }}</div>
        <h2 class="welcome-title">你好！我是 {{ store.currentAgent.name }}</h2>
        <p class="welcome-desc">{{ store.currentAgent.description }}</p>
        <div class="welcome-hints">
          <div class="hint-card" @click="chatInput = '帮我分析一下当前项目的结构'; sendMessage()">帮我分析一下当前项目的结构</div>
          <div class="hint-card" @click="chatInput = '搜索最新的Vue 3最佳实践'; sendMessage()">搜索最新的Vue 3最佳实践</div>
          <div class="hint-card" @click="chatInput = '写一个Python脚本处理CSV文件'; sendMessage()">写一个Python脚本处理CSV文件</div>
        </div>

        <!-- API Key 未配置提示 -->
        <div v-if="!store.llmConfig.apiKey" class="setup-hint">
          <i class="fa-solid fa-circle-exclamation"></i>
          <span>尚未配置 API Key，请先 <a @click="goToSettings">进入设置</a> 配置模型</span>
        </div>
      </div>

      <!-- 消息列表 -->
      <template v-for="msg in messages" :key="msg.id">
        <!-- 用户消息 -->
        <div v-if="msg.role === 'user'" class="message message-user">
          <div class="user-bubble">{{ msg.content }}</div>
        </div>

        <!-- AI消息 -->
        <div v-else-if="msg.role === 'assistant'" class="message message-assistant">
          <!-- 思考过程 -->
          <div v-if="msg.thinking" class="thinking-block">
            <div class="thinking-trigger" @click="toggleThinking(msg.id)">
              <i class="fa-solid fa-brain thinking-icon"></i>
              <span>深度思考</span>
              <i class="fa-solid fa-chevron-right thinking-arrow" :class="{ open: showThinking[msg.id] }"></i>
            </div>
            <div v-if="showThinking[msg.id]" class="thinking-content">{{ msg.thinking }}</div>
          </div>

          <!-- 工具调用 -->
          <div v-if="msg.toolCalls && msg.toolCalls.length > 0" class="tool-calls-block">
            <div v-for="tc in msg.toolCalls" :key="tc.id" class="tool-call-item">
              <div class="tool-call-header">
                <i class="fa-solid fa-circle-check" v-if="tc.status === 'success'" style="color: #10b981;"></i>
                <i class="fa-solid fa-xmark" v-else-if="tc.status === 'error'" style="color: #ef4444;"></i>
                <i class="fa-solid fa-circle-exclamation" v-else-if="tc.status === 'warning'" style="color: #f59e0b;"></i>
                <i class="fa-solid fa-spinner fa-spin" v-else style="color: #999;"></i>
                <i :class="getToolIcon(tc.name)" style="color: #666;"></i>
                <span class="tool-call-name">{{ tc.description || tc.name }}</span>
                <span class="tool-call-status" :class="tc.status">
                  {{ tc.status === 'success' ? '成功' : tc.status === 'error' ? '失败' : tc.status === 'warning' ? '警告' : '运行中' }}
                </span>
              </div>
              <div v-if="tc.input" class="tool-call-input"><code>{{ tc.input }}</code></div>
              <div v-if="tc.output" class="tool-call-output-toggle" @click="toggleToolOutput(tc.id)">
                <i class="fa-solid fa-chevron-right" :class="{ open: showToolOutput[tc.id] }"></i>
                <span>查看结果</span>
              </div>
              <div v-if="showToolOutput[tc.id] && tc.output" class="tool-call-output" :class="tc.status">
                <pre>{{ tc.output }}</pre>
              </div>
            </div>
          </div>

          <!-- 文本内容 -->
          <div v-if="msg.content" class="assistant-content">{{ msg.content }}</div>
        </div>
      </template>

      <!-- 正在流式输出 -->
      <div v-if="isRunning" class="message message-assistant streaming">
        <!-- 思考中 -->
        <div v-if="streamingThinking" class="thinking-block">
          <div class="thinking-trigger active">
            <i class="fa-solid fa-brain thinking-icon"></i>
            <span>正在思考...</span>
          </div>
          <div class="thinking-content">{{ streamingThinking }}</div>
        </div>

        <!-- 工具执行中 -->
        <div v-if="streamingToolCalls.length > 0" class="tool-calls-block">
          <div v-for="tc in streamingToolCalls" :key="tc.id" class="tool-call-item">
            <div class="tool-call-header">
              <i class="fa-solid fa-circle-check" v-if="tc.status === 'success'" style="color: #10b981;"></i>
              <i class="fa-solid fa-xmark" v-else-if="tc.status === 'error'" style="color: #ef4444;"></i>
              <i class="fa-solid fa-spinner fa-spin" v-else style="color: #999;"></i>
              <i :class="getToolIcon(tc.name)" style="color: #666;"></i>
              <span class="tool-call-name">{{ tc.description || tc.name }}</span>
              <span class="tool-call-status" :class="tc.status">
                {{ tc.status === 'running' ? '运行中' : tc.status === 'success' ? '成功' : '失败' }}
              </span>
            </div>
            <div v-if="tc.output" class="tool-call-output" :class="tc.status">
              <pre>{{ tc.output }}</pre>
            </div>
          </div>
        </div>

        <!-- 流式文本 -->
        <div v-if="streamingContent" class="assistant-content">
          {{ streamingContent }}<span class="cursor-blink">|</span>
        </div>

        <!-- 等待中 -->
        <div v-if="!streamingContent && !streamingThinking && streamingToolCalls.length === 0" class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>

      <!-- 错误提示 -->
      <div v-if="errorMessage" class="error-banner">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>{{ errorMessage }}</span>
        <button class="error-action" v-if="errorMessage.includes('API Key')" @click="goToSettings">去设置</button>
        <button @click="errorMessage = ''" class="error-close"><i class="fa-solid fa-xmark"></i></button>
      </div>
    </div>

    <!-- 底部输入区 -->
    <div class="chat-input-area">
      <div class="chat-input-card">
        <div class="input-top-row">
          <div v-if="workDir" class="folder-tag">
            <i class="fa-solid fa-folder folder-tag-icon"></i>
            <span>{{ workDir.split('/').pop() || workDir }}</span>
          </div>
          <div class="agent-tag" @click="goToSettings">
            <span class="agent-tag-avatar">{{ store.currentAgent.avatar }}</span>
            <span>{{ store.currentAgent.name }}</span>
          </div>
        </div>
        <textarea
          v-model="chatInput"
          class="chat-textarea"
          :placeholder="isRunning ? 'Agent 正在处理中...' : '描述任务或继续对话，按 Enter 发送'"
          rows="3"
          :disabled="isRunning"
          @keydown="handleKeydown"
        ></textarea>
        <div class="input-bottom-row">
          <div class="input-hints">
            <span class="hint-text">{{ store.llmConfig.model }}</span>
            <span class="hint-sep">·</span>
            <span class="hint-text">{{ store.permissionConfig.mode === 'default' ? '默认模式' : store.permissionConfig.mode === 'auto' ? '自动模式' : '严格模式' }}</span>
          </div>
          <button
            v-if="isRunning"
            class="stop-btn"
            @click="stopGeneration"
            title="停止生成"
          >
            <i class="fa-solid fa-stop"></i>
            <span>停止</span>
          </button>
          <button
            v-else
            class="send-btn"
            :class="{ active: chatInput.trim() }"
            @click="sendMessage"
            :disabled="!chatInput.trim()"
          >
            <i class="fa-solid fa-paper-plane"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-chat-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #FAFAFA;
}

/* ===== Header ===== */
.chat-header {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid #F0F0F0;
  background: #FFF;
  flex-shrink: 0;
}
.header-left { display: flex; align-items: center; gap: 10px; }
.header-right { display: flex; gap: 4px; }
.header-btn {
  width: 34px; height: 34px; border: none; background: transparent;
  border-radius: 8px; cursor: pointer; display: flex; align-items: center;
  justify-content: center; color: #666; font-size: 14px; transition: all 0.12s;
}
.header-btn:hover { background: #F0F0F0; color: #1A1A1A; }
.agent-badge { font-size: 20px; }
.agent-label { font-size: 15px; font-weight: 600; color: #1A1A1A; }
.model-badge { font-size: 11px; padding: 2px 8px; background: #F3F3F3; border-radius: 6px; color: #666; }

/* ===== Messages ===== */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px 0;
}
.message {
  max-width: 780px;
  margin: 0 auto 20px;
  padding: 0 32px;
}

/* User */
.message-user { display: flex; justify-content: flex-end; }
.user-bubble {
  background: #1A1A1A;
  color: #FFF;
  border-radius: 16px 16px 4px 16px;
  padding: 12px 18px;
  font-size: 14px;
  line-height: 1.6;
  max-width: 75%;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Assistant */
.message-assistant { display: flex; flex-direction: column; gap: 10px; }
.assistant-content {
  font-size: 14px;
  line-height: 1.8;
  color: #1A1A1A;
  white-space: pre-wrap;
  word-break: break-word;
}
.cursor-blink { animation: blink 1s step-end infinite; color: #999; }
@keyframes blink { 50% { opacity: 0; } }

/* Thinking */
.thinking-block { margin-bottom: 8px; }
.thinking-trigger {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px; background: #F3F0FF; border-radius: 8px;
  font-size: 12px; color: #7C3AED; cursor: pointer;
  user-select: none; transition: background 0.12s;
}
.thinking-trigger:hover { background: #EDE9FE; }
.thinking-trigger.active { background: #EDE9FE; animation: pulse 2s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
.thinking-icon { font-size: 12px; }
.thinking-arrow { font-size: 9px; margin-left: 4px; transition: transform 0.2s; }
.thinking-arrow.open { transform: rotate(90deg); }
.thinking-content {
  margin-top: 8px; padding: 12px 14px;
  background: #FAFAF5; border: 1px solid #F0EEE0;
  border-radius: 8px; font-size: 13px; color: #666;
  line-height: 1.6; white-space: pre-wrap;
  max-height: 200px; overflow-y: auto;
}

/* Tool Calls */
.tool-calls-block { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.tool-call-item {
  background: #FFF; border: 1px solid #F0F0F0;
  border-radius: 10px; padding: 10px 14px;
}
.tool-call-header { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.tool-call-name { font-weight: 500; color: #1A1A1A; }
.tool-call-status {
  margin-left: auto; font-size: 11px; padding: 2px 8px;
  border-radius: 10px; font-weight: 500;
}
.tool-call-status.success { background: #d1fae5; color: #059669; }
.tool-call-status.error { background: #fee2e2; color: #dc2626; }
.tool-call-status.running { background: #F3F3F3; color: #666; }
.tool-call-status.warning { background: #fef3c7; color: #d97706; }
.tool-call-input { margin-top: 6px; padding-left: 22px; }
.tool-call-input code {
  font-size: 12px; color: #555; background: #F7F7F7;
  padding: 2px 6px; border-radius: 4px; font-family: 'SF Mono', Monaco, monospace;
  word-break: break-all;
}
.tool-call-output-toggle {
  display: inline-flex; align-items: center; gap: 5px;
  margin-top: 6px; margin-left: 22px; padding: 3px 8px;
  font-size: 12px; color: #999; cursor: pointer;
  border-radius: 4px; transition: background 0.12s;
}
.tool-call-output-toggle:hover { background: #F5F5F5; color: #666; }
.tool-call-output-toggle i { font-size: 9px; transition: transform 0.2s; }
.tool-call-output-toggle i.open { transform: rotate(90deg); }
.tool-call-output {
  margin: 6px 0 0 22px; padding: 8px 12px; border-radius: 6px; font-size: 12px;
}
.tool-call-output.success { background: #f0fdf4; border: 1px solid #d1fae5; }
.tool-call-output.error { background: #fef2f2; border: 1px solid #fee2e2; }
.tool-call-output.warning { background: #fffbeb; border: 1px solid #fef3c7; }
.tool-call-output pre {
  margin: 0; font-family: 'SF Mono', Monaco, monospace;
  color: #374151; white-space: pre-wrap; line-height: 1.5;
}

/* Typing */
.typing-indicator { display: flex; gap: 4px; padding: 8px 0; }
.typing-indicator span {
  width: 6px; height: 6px; background: #CCC;
  border-radius: 50%; animation: typing 1.4s infinite;
}
.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
@keyframes typing {
  0%, 100% { opacity: 0.3; transform: translateY(0); }
  50% { opacity: 1; transform: translateY(-3px); }
}

/* Welcome */
.welcome-state {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; height: 100%; padding: 40px; text-align: center;
}
.welcome-avatar { font-size: 48px; margin-bottom: 16px; }
.welcome-title { font-size: 22px; font-weight: 700; color: #1A1A1A; margin: 0 0 8px 0; }
.welcome-desc { font-size: 14px; color: #999; margin: 0 0 32px 0; }
.welcome-hints { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-bottom: 24px; }
.hint-card {
  padding: 12px 18px; background: #FFF; border: 1px solid #E8E8E8;
  border-radius: 10px; font-size: 13px; color: #555;
  cursor: pointer; transition: all 0.12s;
}
.hint-card:hover { border-color: #CCC; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }

.setup-hint {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 18px; background: #fffbeb;
  border: 1px solid #fef3c7; border-radius: 10px;
  font-size: 13px; color: #92400e;
}
.setup-hint a { color: #2563eb; cursor: pointer; text-decoration: underline; }

/* Error */
.error-banner {
  display: flex; align-items: center; gap: 10px;
  max-width: 780px; margin: 12px auto; padding: 12px 18px;
  background: #fef2f2; border: 1px solid #fee2e2;
  border-radius: 10px; font-size: 13px; color: #dc2626;
}
.error-banner i:first-child { font-size: 16px; flex-shrink: 0; }
.error-banner span { flex: 1; }
.error-action {
  padding: 4px 12px; background: #FFF; border: 1px solid #fca5a5;
  border-radius: 6px; font-size: 12px; color: #dc2626;
  cursor: pointer; transition: all 0.12s; white-space: nowrap;
}
.error-action:hover { background: #fef2f2; }
.error-close {
  width: 24px; height: 24px; border: none; background: transparent;
  border-radius: 4px; cursor: pointer; display: flex; align-items: center;
  justify-content: center; color: #dc2626; font-size: 12px;
}

/* ===== Input Area ===== */
.chat-input-area {
  padding: 12px 32px 20px;
  max-width: 780px;
  margin: 0 auto;
  width: 100%;
}
.chat-input-card {
  border: 1px solid #E8E8E8; border-radius: 16px;
  padding: 12px 16px; background: #FFF;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.chat-input-card:focus-within {
  border-color: #CCC; box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.input-top-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.folder-tag {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 8px; background: #F3F3F3; border-radius: 6px;
  font-size: 12px; color: #555;
}
.folder-tag-icon { font-size: 11px; color: #999; }
.agent-tag {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 8px; background: #F3F0FF; border-radius: 6px;
  font-size: 12px; color: #7C3AED; cursor: pointer;
  transition: background 0.12s;
}
.agent-tag:hover { background: #EDE9FE; }
.agent-tag-avatar { font-size: 12px; }

.chat-textarea {
  width: 100%; border: none; outline: none; resize: none;
  font-size: 14px; font-family: inherit; color: #1A1A1A;
  line-height: 1.5; background: transparent;
}
.chat-textarea::placeholder { color: #BBB; }
.chat-textarea:disabled { opacity: 0.6; }

.input-bottom-row {
  display: flex; align-items: center;
  justify-content: space-between; margin-top: 8px;
}
.input-hints { display: flex; align-items: center; gap: 6px; }
.hint-text { font-size: 11px; color: #BBB; }
.hint-sep { font-size: 11px; color: #DDD; }

.send-btn {
  width: 32px; height: 32px; border: none; background: #E8E8E8;
  border-radius: 50%; cursor: pointer; display: flex;
  align-items: center; justify-content: center;
  color: #999; font-size: 13px; transition: all 0.15s;
}
.send-btn.active { background: #1A1A1A; color: #FFF; }
.send-btn:disabled { cursor: not-allowed; opacity: 0.5; }

.stop-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 14px; border: 1px solid #fca5a5;
  background: #FFF; border-radius: 8px;
  font-size: 12px; color: #ef4444; cursor: pointer;
  transition: all 0.12s;
}
.stop-btn:hover { background: #fef2f2; }
</style>
