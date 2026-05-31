<script setup lang="ts">
/**
 * TaskRunner 调试面板 - 独立组件
 * 用于实时调试 TaskRunner 与 ReAct Agent 的交互过程
 */
import { ref, nextTick, watch } from 'vue'
import { useAgentStore } from '../../../stores/agentStore'
import { TaskRunner } from '../../../agent/core/taskRunner'
import type { ReActResult, ReActStep, ToolResult, ReActRequestPayload } from '../../../agent/core/reactAgent'
import type { ToolCall } from '../../../agent/llm/llmClient'
import { parseConnectorToolName } from '../../../data/tool-definitions/connectorTools'

// ===== Props =====
const props = defineProps<{
  /** 工作目录 */
  workDir?: string
  /** 技能列表 */
  skillNames?: string[]
  /** 套件列表 */
  suiteNames?: string[]
  /** MCP 服务器 ID 列表 */
  mcpServerIds?: string[]
  /** 连接器 ID 列表 */
  connectorIds?: string[]
  /** 用户消息 */
  userMessage: string
  /** 外部传入的 TaskRunner（可选，共享实例避免重复调用） */
  runner?: TaskRunner
}>()

const store = useAgentStore()

// ===== 调试状态 =====
interface DebugLog {
  timestamp: number
  type: 'token' | 'thinking' | 'tool-start' | 'tool-end' | 'step' | 'complete' | 'error' | 'abort' | 'info' | 'prompt'
  data: any
}

const panelVisible = ref(false)
const panelExpanded = ref(true)
const panelMaximized = ref(false)
const logs = ref<DebugLog[]>([])
const tokens = ref('')
const thinking = ref('')
const steps = ref<ReActStep[]>([])
const finalResult = ref<ReActResult | null>(null)
const error = ref<Error | null>(null)
const isRunning = ref(false)

/** 已收集的提示词载荷（每次 LLM 请求前都会追加） */
const promptPayloads = ref<ReActRequestPayload[]>([])
/** 当前展开查看的提示词索引 */
const expandedPrompt = ref<number | null>(null)

let taskRunner: TaskRunner | null = null

/** 将工具名称格式化为可读格式：MCP | 服务名称 | 方法名 或 连接器友好名 */
function formatToolName(name: string): string {
  // MCP 工具名称格式：mcp_{serverName}_{toolName}
  if (name.startsWith('mcp_')) {
    const parts = name.substring(4).split('_')
    if (parts.length >= 2) {
      const serverName = parts[0]
      const toolName = parts.slice(1).join('_')
      return `MCP | ${serverName} | ${toolName}`
    }
  }
  // 连接器工具名称：从 store 查找连接器名称
  const parsed = parseConnectorToolName(name)
  if (parsed) {
    const conn = store.connectors.find(c => c.id === parsed.connectorId)
    const connName = conn?.name
    const connectorPrefixes = [
      { prefix: 'ssh_exec', label: 'SSH', action: '执行命令' },
      { prefix: 'ssh_read_file', label: 'SSH', action: '读取文件' },
      { prefix: 'mysql_query', label: 'MySQL', action: '执行 SQL' },
      { prefix: 'mysql_list_tables', label: 'MySQL', action: '列出表' },
      { prefix: 'pg_query', label: 'PostgreSQL', action: '执行 SQL' },
      { prefix: 'pg_list_tables', label: 'PostgreSQL', action: '列出表' },
    ]
    for (const { prefix, label, action } of connectorPrefixes) {
      if (parsed.toolType === prefix) {
        return connName ? `${label} | ${connName} | ${action}` : `${label} | ${action}`
      }
    }
  }
  return name
}

// ===== 监听外部 runner =====
watch(
  () => props.runner,
  (newRunner) => {
    if (newRunner && newRunner.isRunning) {
      attachToRunner(newRunner)
    }
  },
  { immediate: true }
)

/** 绑定到外部传入的 runner（共享实例） */
function attachToRunner(runner: TaskRunner) {
  panelVisible.value = true
  logs.value = []
  tokens.value = ''
  thinking.value = ''
  steps.value = []
  promptPayloads.value = []
  expandedPrompt.value = null
  finalResult.value = null
  error.value = null
  isRunning.value = true
  taskRunner = runner

  addLog('info', `工作目录: ${props.workDir || '(无)'}`)
  addLog('info', `Skills: ${props.skillNames?.length ? props.skillNames.join(', ') : '(无)'}`)
  addLog('info', `套件: ${props.suiteNames?.length ? props.suiteNames.join(', ') : '(无)'}`)
  addLog('info', `MCP 服务器: ${props.mcpServerIds?.length ? props.mcpServerIds.join(', ') : '(无)'}`)
  addLog('info', `连接器: ${props.connectorIds?.length ? props.connectorIds.join(', ') : '(无)'}`)
  addLog('info', `用户消息: ${props.userMessage}`)

  runner
    .on('token', (token: string) => {
      tokens.value += token
      addLog('token', token)
    })
    .on('thinking', (t: string) => {
      thinking.value += t
      addLog('thinking', t)
    })
    .on('toolCallStart', (tc: ToolCall) => {
      const displayName = formatToolName(tc.name)
      addLog('tool-start', { ...tc, displayName })
    })
    .on('toolCallEnd', (tc: ToolCall, result: ToolResult) => {
      const displayName = formatToolName(tc.name)
      addLog('tool-end', { toolCall: { ...tc, displayName }, result })
    })
    .on('step', (step: ReActStep) => {
      steps.value.push(step)
      addLog('step', step)
    })
    .on('complete', (result: ReActResult) => {
      finalResult.value = result
      isRunning.value = false
      addLog('complete', result)
    })
    .on('error', (err: Error) => {
      error.value = err
      isRunning.value = false
      addLog('error', err)
    })
    .on('abort', () => {
      isRunning.value = false
      addLog('abort', null)
    })
    .on('prompt', (payload: ReActRequestPayload) => {
      promptPayloads.value.push(payload)
      addLog('prompt', `第 ${payload.iteration} 轮 · ${payload.messages.length} 条消息 · ${payload.toolNames.length} 个工具`)
    })
}

// ===== 提示词展开/折叠 =====
function togglePrompt(idx: number) {
  expandedPrompt.value = expandedPrompt.value === idx ? null : idx
}

function truncate(text: string, maxLen = 300): string {
  if (!text) return '(空)'
  return text.length > maxLen ? text.slice(0, maxLen) + `... (${text.length} 字符)` : text
}

function formatMessageContent(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(c => c.text || `[${c.type}]`).join('\n')
  }
  return String(content)
}

// ===== 日志操作 =====
function addLog(type: DebugLog['type'], data: any) {
  logs.value.push({ timestamp: Date.now(), type, data })
  nextTick(() => {
    const el = document.querySelector('.debug-log-container')
    if (el) el.scrollTop = el.scrollHeight
  })
}

function formatData(data: any): string {
  if (data === null || data === undefined) return '(null)'
  if (typeof data === 'string') return data
  if (data instanceof Error) return data.message
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

// ===== 启动/停止调试 =====
function start() {
  // 如果外部已提供 runner，无需自行创建
  if (props.runner) {
    attachToRunner(props.runner)
    return
  }

  if (store.providers.length === 0) {
    panelVisible.value = true
    addLog('error', new Error('没有可用的 LLM 供应商配置'))
    return
  }

  panelVisible.value = true
  logs.value = []
  tokens.value = ''
  thinking.value = ''
  steps.value = []
  promptPayloads.value = []
  expandedPrompt.value = null
  finalResult.value = null
  error.value = null
  isRunning.value = true

  const firstProvider = store.providers.find(p => p.enabled && p.models.length > 0)
  if (!firstProvider) {
    addLog('error', new Error('没有找到可用的供应商'))
    isRunning.value = false
    return
  }

  const modelId = firstProvider.models[0].id

  taskRunner = new TaskRunner({
    modelId,
    providers: store.providers,
    workDir: props.workDir || '',
    skillNames: props.skillNames || [],
    suiteNames: props.suiteNames || [],
    mcpServerIds: props.mcpServerIds || [],
    connectorIds: props.connectorIds || [],
    userMessage: props.userMessage,
    stream: true,
  })

  taskRunner
    .on('token', (token: string) => {
      tokens.value += token
      addLog('token', token)
    })
    .on('thinking', (t: string) => {
      thinking.value += t
      addLog('thinking', t)
    })
    .on('toolCallStart', (tc: ToolCall) => {
      const displayName = formatToolName(tc.name)
      addLog('tool-start', { ...tc, displayName })
    })
    .on('toolCallEnd', (tc: ToolCall, result: ToolResult) => {
      const displayName = formatToolName(tc.name)
      addLog('tool-end', { toolCall: { ...tc, displayName }, result })
    })
    .on('step', (step: ReActStep) => {
      steps.value.push(step)
      addLog('step', step)
    })
    .on('complete', (result: ReActResult) => {
      finalResult.value = result
      isRunning.value = false
      addLog('complete', result)
    })
    .on('error', (err: Error) => {
      error.value = err
      isRunning.value = false
      addLog('error', err)
    })
    .on('abort', () => {
      isRunning.value = false
      addLog('abort', null)
    })
    .on('prompt', (payload: ReActRequestPayload) => {
      promptPayloads.value.push(payload)
      addLog('prompt', `第 ${payload.iteration} 轮 · ${payload.messages.length} 条消息 · ${payload.toolNames.length} 个工具`)
    })

  addLog('info', `模型: ${modelId}`)
  addLog('info', `工作目录: ${props.workDir || '(无)'}`)
  addLog('info', `Skills: ${props.skillNames?.length ? props.skillNames.join(', ') : '(无)'}`)
  addLog('info', `套件: ${props.suiteNames?.length ? props.suiteNames.join(', ') : '(无)'}`)
  addLog('info', `MCP 服务器: ${props.mcpServerIds?.length ? props.mcpServerIds.join(', ') : '(无)'}`)
  addLog('info', `连接器: ${props.connectorIds?.length ? props.connectorIds.join(', ') : '(无)'}`)
  addLog('info', `用户消息: ${props.userMessage}`)

  taskRunner.start().catch((err) => {
    error.value = err instanceof Error ? err : new Error(String(err))
    isRunning.value = false
  })
}

function stop() {
  if (taskRunner && isRunning.value) {
    taskRunner.abort()
  }
}

function togglePanel() {
  panelExpanded.value = !panelExpanded.value
}

function toggleMaximize() {
  panelMaximized.value = !panelMaximized.value
  if (panelMaximized.value) panelExpanded.value = true
}
</script>

<template>
  <!-- 调试面板 -->
  <div v-if="panelVisible" class="debug-panel" :class="{ collapsed: !panelExpanded, maximized: panelMaximized }">
    <!-- 头部 -->
    <div class="debug-header" @click="togglePanel">
      <div class="debug-title">
        <i class="fa-solid fa-bug"></i>
        <span>TaskRunner 调试</span>
        <span v-if="isRunning" class="debug-status running">
          <i class="fa-solid fa-circle-notch fa-spin"></i>
          运行中
        </span>
        <span v-else-if="error" class="debug-status error">
          <i class="fa-solid fa-circle-exclamation"></i>
          错误
        </span>
        <span v-else-if="finalResult" class="debug-status complete">
          <i class="fa-solid fa-circle-check"></i>
          完成
        </span>
      </div>
      <div class="debug-actions">
        <button v-if="isRunning" class="debug-btn stop" @click.stop="stop" title="停止">
          <i class="fa-solid fa-stop"></i>
        </button>
        <button class="debug-btn" @click.stop="toggleMaximize" :title="panelMaximized ? '还原' : '放大'">
          <i class="fa-solid" :class="panelMaximized ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'"></i>
        </button>
        <button class="debug-btn toggle" @click.stop="togglePanel" :title="panelExpanded ? '收起' : '展开'">
          <i class="fa-solid" :class="panelExpanded ? 'fa-chevron-down' : 'fa-chevron-up'"></i>
        </button>
      </div>
    </div>

    <!-- 内容 -->
    <div v-if="panelExpanded" class="debug-body">
      <!-- 配置信息 -->
      <div class="debug-config">
        <div class="debug-config-row">
          <span class="label">工作目录:</span>
          <span class="value">{{ workDir || '(无)' }}</span>
        </div>
        <div class="debug-config-row">
          <span class="label">Skills:</span>
          <span class="value">{{ skillNames?.length ? skillNames.join(', ') : '(无)' }}</span>
        </div>
        <div class="debug-config-row">
          <span class="label">套件:</span>
          <span class="value">{{ suiteNames?.length ? suiteNames.join(', ') : '(无)' }}</span>
        </div>
        <div class="debug-config-row">
          <span class="label">MCP 服务器:</span>
          <span class="value">{{ mcpServerIds?.length ? mcpServerIds.join(', ') : '(无)' }}</span>
        </div>
        <div class="debug-config-row">
          <span class="label">连接器:</span>
          <span class="value">{{ connectorIds?.length ? connectorIds.join(', ') : '(无)' }}</span>
        </div>
      </div>

      <!-- 统计信息 -->
      <div class="debug-stats">
        <div class="debug-stat">
          <span class="label">Tokens:</span>
          <span class="value">{{ tokens.length }}</span>
        </div>
        <div class="debug-stat">
          <span class="label">Thinking:</span>
          <span class="value">{{ thinking.length }}</span>
        </div>
        <div class="debug-stat">
          <span class="label">Steps:</span>
          <span class="value">{{ steps.length }}</span>
        </div>
        <div class="debug-stat">
          <span class="label">Prompts:</span>
          <span class="value">{{ promptPayloads.length }}</span>
        </div>
        <div class="debug-stat">
          <span class="label">Logs:</span>
          <span class="value">{{ logs.length }}</span>
        </div>
      </div>

      <!-- 提示词查看器 -->
      <div v-if="promptPayloads.length > 0" class="debug-prompts">
        <div class="debug-prompts-title">
          <i class="fa-solid fa-paper-plane"></i>
          提示词历史 ({{ promptPayloads.length }} 次请求)
        </div>
        <div
          v-for="(p, idx) in promptPayloads"
          :key="idx"
          class="debug-prompt-item"
          :class="{ expanded: expandedPrompt === idx }"
        >
          <div class="debug-prompt-header" @click="togglePrompt(idx)">
            <i class="fa-solid" :class="expandedPrompt === idx ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
            <span class="prompt-round">第 {{ p.iteration }} 轮</span>
            <span class="prompt-meta">{{ p.messages.length }} 条消息 · {{ p.toolNames.length }} 个工具</span>
          </div>
          <div v-if="expandedPrompt === idx" class="debug-prompt-body">
            <!-- 系统提示 -->
            <div class="prompt-section">
              <div class="prompt-section-title">系统提示 ({{ p.systemPrompt?.length || 0 }} 字符)</div>
              <pre class="prompt-section-content">{{ p.systemPrompt || '(无)' }}</pre>
            </div>
            <!-- 消息列表 -->
            <div class="prompt-section">
              <div class="prompt-section-title">消息列表 ({{ p.messages.length }})</div>
              <div v-for="(msg, mi) in p.messages" :key="mi" class="prompt-message">
                <span class="prompt-msg-role" :class="msg.role">{{ msg.role }}</span>
                <pre class="prompt-msg-content">{{ truncate(formatMessageContent(msg.content), 500) }}</pre>
              </div>
            </div>
            <!-- 工具列表 -->
            <div class="prompt-section">
              <div class="prompt-section-title">可用工具 ({{ p.toolNames.length }})</div>
              <div class="prompt-tools">
                <span v-for="tn in p.toolNames" :key="tn" class="prompt-tool-tag">{{ tn }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 日志流 -->
      <div class="debug-log-container">
        <div v-for="(log, idx) in logs" :key="idx" class="debug-log-entry" :class="log.type">
          <span class="debug-log-time">{{ new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour12: false }) }}</span>
          <span class="debug-log-type">{{ log.type }}</span>
          <pre class="debug-log-data">{{ formatData(log.data) }}</pre>
        </div>
        <div v-if="logs.length === 0" class="debug-log-empty">
          暂无日志...
        </div>
      </div>

      <!-- 最终结果 -->
      <div v-if="finalResult" class="debug-result">
        <div class="debug-result-title">
          <i class="fa-solid fa-check-double"></i>
          最终结果
        </div>
        <pre class="debug-result-text">{{ finalResult.text }}</pre>
        <div class="debug-result-meta">
          迭代次数: {{ finalResult.iterations }} |
          已完成: {{ finalResult.finished ? '是' : '否' }} |
          历史消息: {{ finalResult.history.length }}
        </div>
      </div>

      <!-- 错误信息 -->
      <div v-if="error" class="debug-error">
        <div class="debug-error-title">
          <i class="fa-solid fa-circle-exclamation"></i>
          错误
        </div>
        <pre class="debug-error-text">{{ error.message }}</pre>
      </div>
    </div>
  </div>

  <!-- 悬浮启动按钮（仅在无外部 runner 时显示） -->
  <button
    v-if="!panelVisible && !props.runner"
    class="debug-fab"
    @click="start"
    title="启动 TaskRunner 调试"
  >
    <i class="fa-solid fa-bug"></i>
  </button>
</template>

<style lang="scss" scoped>
.debug-panel {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: 480px;
  max-height: 70vh;
  background: #1a1a1a;
  color: #e0e0e0;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 1000;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 12px;
  transition: all 0.3s ease;

  &.collapsed {
    max-height: 44px;
  }

  &.maximized {
    right: 0;
    bottom: 0;
    width: 100vw;
    max-height: 100vh;
    height: 100vh;
    border-radius: 0;
  }
}

.debug-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #252525;
  border-bottom: 1px solid #333;
  cursor: pointer;
  user-select: none;

  &:hover {
    background: #2a2a2a;
  }
}

.debug-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 13px;

  i {
    color: #ffa500;
  }
}

.debug-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;

  &.running {
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
  }

  &.error {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
  }

  &.complete {
    background: rgba(34, 197, 94, 0.2);
    color: #4ade80;
  }
}

.debug-actions {
  display: flex;
  gap: 6px;
}

.debug-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: #999;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;

  &:hover {
    background: #333;
    color: #fff;
  }

  &.stop:hover {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
  }
}

.debug-body {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.debug-config {
  padding: 10px 16px;
  background: #1e2a3a;
  border-bottom: 1px solid #2a3a4a;
  font-size: 11px;
}

.debug-config-row {
  display: flex;
  gap: 8px;
  padding: 2px 0;

  .label {
    color: #888;
    flex-shrink: 0;
    min-width: 70px;
  }

  .value {
    color: #a5d8ff;
    word-break: break-all;
  }
}

.debug-stats {
  display: flex;
  gap: 16px;
  padding: 12px 16px;
  background: #202020;
  border-bottom: 1px solid #333;
}

.debug-stat {
  display: flex;
  align-items: center;
  gap: 6px;

  .label {
    color: #888;
    font-size: 11px;
  }

  .value {
    color: #4ade80;
    font-weight: 600;
  }
}

.debug-log-container {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  max-height: 400px;

  .maximized & {
    max-height: none;
  }

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: #1a1a1a;
  }

  &::-webkit-scrollbar-thumb {
    background: #444;
    border-radius: 3px;

    &:hover {
      background: #555;
    }
  }
}

.debug-log-entry {
  display: flex;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid #2a2a2a;
  align-items: flex-start;

  &:last-child {
    border-bottom: none;
  }

  &.token .debug-log-type { color: #60a5fa; }
  &.thinking .debug-log-type { color: #a78bfa; }
  &.tool-start .debug-log-type { color: #fbbf24; }
  &.tool-end .debug-log-type { color: #34d399; }
  &.step .debug-log-type { color: #f472b6; }
  &.complete .debug-log-type { color: #4ade80; }
  &.error .debug-log-type { color: #f87171; }
  &.abort .debug-log-type { color: #94a3b8; }
  &.info .debug-log-type { color: #60a5fa; }
}

.debug-log-time {
  color: #666;
  font-size: 10px;
  flex-shrink: 0;
  min-width: 70px;
}

.debug-log-type {
  font-weight: 600;
  font-size: 11px;
  flex-shrink: 0;
  min-width: 80px;
  text-transform: uppercase;
}

.debug-log-data {
  flex: 1;
  margin: 0;
  color: #d0d0d0;
  font-size: 11px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}

.debug-log-empty {
  color: #666;
  text-align: center;
  padding: 40px 20px;
  font-style: italic;
}

.debug-result,
.debug-error {
  padding: 12px 16px;
  border-top: 1px solid #333;
  background: #202020;
}

.debug-result-title,
.debug-error-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 12px;
  margin-bottom: 8px;

  i {
    font-size: 14px;
  }
}

.debug-result-title i {
  color: #4ade80;
}

.debug-error-title i {
  color: #f87171;
}

.debug-result-text,
.debug-error-text {
  margin: 0;
  padding: 8px;
  background: #1a1a1a;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.5;
  max-height: 150px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.debug-result-text {
  color: #4ade80;
}

.debug-error-text {
  color: #f87171;
}

.debug-result-meta {
  margin-top: 8px;
  font-size: 10px;
  color: #888;
}

// 提示词查看器
.debug-prompts {
  border-bottom: 1px solid #333;
  max-height: 350px;
  overflow-y: auto;

  .maximized & {
    max-height: none;
    flex: 1;
  }

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: #1a1a1a;
  }

  &::-webkit-scrollbar-thumb {
    background: #444;
    border-radius: 3px;
  }
}

.debug-prompts-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #1e2230;
  font-weight: 600;
  font-size: 11px;
  color: #93c5fd;
  border-bottom: 1px solid #2a3a4a;

  i {
    font-size: 12px;
  }
}

.debug-prompt-item {
  border-bottom: 1px solid #2a2a2a;

  &.expanded {
    background: #1a1f2e;
  }
}

.debug-prompt-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 11px;
  transition: background 0.15s;

  &:hover {
    background: #252a38;
  }

  i {
    color: #666;
    font-size: 10px;
    flex-shrink: 0;
  }

  .prompt-round {
    color: #fbbf24;
    font-weight: 600;
    flex-shrink: 0;
  }

  .prompt-meta {
    color: #888;
    margin-left: auto;
  }
}

.debug-prompt-body {
  padding: 0 16px 10px;
}

.prompt-section {
  margin-top: 8px;
}

.prompt-section-title {
  color: #93c5fd;
  font-weight: 600;
  font-size: 10px;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.prompt-section-content {
  margin: 0;
  padding: 8px;
  background: #111827;
  border-radius: 4px;
  color: #d0d0d0;
  font-size: 10px;
  line-height: 1.5;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid #1f2937;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: #374151;
    border-radius: 2px;
  }
}

.prompt-message {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  align-items: flex-start;
  border-bottom: 1px solid #1f2937;

  &:last-child {
    border-bottom: none;
  }
}

.prompt-msg-role {
  flex-shrink: 0;
  min-width: 60px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 3px;
  text-align: center;

  &.system {
    background: rgba(147, 197, 253, 0.15);
    color: #93c5fd;
  }

  &.user {
    background: rgba(74, 222, 128, 0.15);
    color: #4ade80;
  }

  &.assistant {
    background: rgba(251, 191, 36, 0.15);
    color: #fbbf24;
  }

  &.tool {
    background: rgba(244, 114, 182, 0.15);
    color: #f472b6;
  }
}

.prompt-msg-content {
  flex: 1;
  margin: 0;
  color: #d0d0d0;
  font-size: 10px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 120px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: #374151;
    border-radius: 2px;
  }
}

.prompt-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.prompt-tool-tag {
  padding: 2px 8px;
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
  border-radius: 3px;
  font-size: 10px;
}

// 悬浮启动按钮
.debug-fab {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: 56px;
  height: 56px;
  border: none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
  transition: all 0.2s ease;
  z-index: 999;

  &:hover {
    transform: scale(1.1);
    box-shadow: 0 6px 24px rgba(102, 126, 234, 0.6);
  }

  &:active {
    transform: scale(0.95);
  }
}
</style>
