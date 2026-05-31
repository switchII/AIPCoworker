<script lang="ts">
import { shallowRef as _shallowRef } from 'vue'
import type { TaskRunner as _TaskRunner } from '../agent/core/taskRunner'

/**
 * 模块级守卫：防止同一任务被重复启动。
 *
 * 必须放在 <script setup> 外面（模块作用域），因为 <script setup>
 * 中的变量在组件销毁后会被重置。当用户离开 TaskView 再回来时，
 * 新组件实例会重新初始化，但旧 runner 仍在后台运行。
 * 模块级 Set 在所有组件实例间共享，确保同一 taskId 永远不会
 * 被 startRealTask 启动两次。
 */
const startedTaskIds = new Set<string>()

/**
 * 模块级 runner 映射表：跨组件实例持久化。
 *
 * 与 startedTaskIds 同理，必须放在模块作用域。当用户离开 TaskView
 * （如回到 NewTask 提交新任务）再返回时，旧组件被销毁但后台 runner
 * 仍在运行。如果 runnerMap 放在 <script setup> 内，新组件实例会创建
 * 空的 runnerMap，导致无法找到旧 runner，澄清问题提交无门，任务永久卡住。
 */
const runnerMap = _shallowRef(new Map<string, _TaskRunner>())
</script>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAgentStore } from '../stores/agentStore'
import { runSimulation, type SimulatorCallbacks } from '../services/taskSimulator'
import type { ExecutionBlock, ClarificationAnswer } from '../types/task'
import { notifyTaskComplete, notifyTaskFailed } from '../agent/notification'
import type { ChatRound } from '../agent/session'
import type { ChatMessage } from '../agent/llm/llmClient'

// Agent modules
import { TaskRunner } from '../agent/core/taskRunner'
import { useTaskRunnerBridge } from '../components/task/composables/useTaskRunnerBridge'

// Composables
import { useBlockHelpers } from '../components/task/composables/useBlockHelpers'
import { useCodeActions } from '../components/task/composables/useCodeActions'
import { useFileUtils, isImageType, isDocxType, isPptxType, isExcelType, isPdfType } from '../components/task/composables/useFileUtils'

// Block components
import ThinkingBlock from '../components/task/blocks/ThinkingBlock.vue'
import ComplexThinkingBlock from '../components/task/blocks/ComplexThinkingBlock.vue'
import SubAgentBlock from '../components/task/blocks/SubAgentBlock.vue'
import CodeEditBlock from '../components/task/blocks/CodeEditBlock.vue'
import WebSearchBlock from '../components/task/blocks/WebSearchBlock.vue'
import FileQueryBlock from '../components/task/blocks/FileQueryBlock.vue'
import McpExecuteBlock from '../components/task/blocks/McpExecuteBlock.vue'
import FileGenBlock from '../components/task/blocks/FileGenBlock.vue'
import HtmlRenderBlock from '../components/task/blocks/HtmlRenderBlock.vue'
import ClarificationBlock from '../components/task/blocks/ClarificationBlock.vue'
import PlanOutputBlock from '../components/task/blocks/PlanOutputBlock.vue'
import ErrorBlock from '../components/task/blocks/ErrorBlock.vue'

// Shared components
import TopBar from '../components/task/components/TopBar.vue'
import ChatInput from '../components/task/components/ChatInput.vue'
import SidePanel from '../components/task/components/SidePanel.vue'
import PreviewPanel from '../components/task/components/PreviewPanel.vue'
import CodePopup from '../components/task/components/CodePopup.vue'
import WaitingArea from '../components/task/components/WaitingArea.vue'
import TaskRunnerDebug from '../components/task/components/TaskRunnerDebug.vue'

// API
import { helpApi } from '../api'
import type { HelpInfo } from '../api/help'

const router = useRouter()
const route = useRoute()
const store = useAgentStore()

// Composable instances
const blockHelpers = useBlockHelpers()
const codeActions = useCodeActions()
const fileUtils = useFileUtils()
const taskRunnerBridge = useTaskRunnerBridge()

// ===== TaskRunner 实例（支持多任务后台并行） =====
// runnerMap 已提升至模块作用域（见 <script lang="ts">），跨组件实例持久化
const MAX_PARALLEL_TASKS = 3

const currentRunner = computed(() => {
  const id = taskId.value
  return id ? runnerMap.value.get(id) ?? null : null
})

// ===== 对话历史（从 session 获取） =====
const conversationHistory = computed(() => store.currentSession?.conversationHistory ?? [])

// ===== 从 store 获取当前任务 =====
const taskId = computed(() => route.query.taskId as string | undefined)
const task = computed(() => {
  if (!taskId.value) return null
  return store.tasks.find(t => t.id === taskId.value) || null
})

const isRunning = computed(() => task.value?.status === 'running')
const taskTitle = computed(() => task.value?.title || '')
const elapsedSeconds = computed(() => task.value?.elapsedSeconds || 0)

// ===== 会话加载状态（防止空白渲染）=====
// 初始值同步为 true（有 taskId 时立即显示加载遮罩，避免组件挂载到 onMounted 之间的空白闪烁）
const sessionLoading = ref(!!route.query.taskId)

// ===== 聊天输入 =====
const chatInput = ref('')

// ===== 任务等待区 =====
const pendingFollowUp = ref('')
const showPendingDropdown = ref(false)
const followUpLimitToast = ref(false)

const canQueue = computed(() => isRunning.value && pendingFollowUp.value === '')

function queueFollowUp() {
  if (!chatInput.value.trim()) return
  pendingFollowUp.value = chatInput.value.trim()
  chatInput.value = ''
  showPendingDropdown.value = false
}

function cancelPendingFollowUp() {
  chatInput.value = pendingFollowUp.value
  pendingFollowUp.value = ''
  showPendingDropdown.value = false
}

function togglePendingDropdown() {
  showPendingDropdown.value = !showPendingDropdown.value
}

// 监听 taskId 变化 → 切换会话（支持从侧边栏切换任务，不中止后台任务）
watch(taskId, async (newTaskId, oldTaskId) => {
  console.log(`[TaskView] watch(taskId): ${oldTaskId} → ${newTaskId}`)
  if (newTaskId && newTaskId !== oldTaskId) {
    // 重置本地 UI 状态
    chatInput.value = ''
    pendingFollowUp.value = ''
    showPendingDropdown.value = false
    // 初始化新任务会话（如果该任务还没有 runner 在运行）
    if (task.value) {
      await initTaskSession(task.value)
    }
  }
})

// 监听当前任务完成 → 自动发送等待中的追问 + 快照本轮结果
watch(
  () => task.value?.status,
  (newStatus, oldStatus) => {
    if (oldStatus === 'running' && (newStatus === 'completed' || newStatus === 'failed')) {
      // 任务已结束，清除模块级守卫以允许后续 follow-up 重新启动
      const completedTaskId = taskId.value
      if (completedTaskId) startedTaskIds.delete(completedTaskId)
      // 快照本轮结果（确保真实 TaskRunner 模式下 report 被正确捕获）
      snapshotCurrentRound()
      // 桌面通知
      const title = task.value?.title || task.value?.input || '任务'
      if (newStatus === 'completed') {
        notifyTaskComplete(title)
      } else {
        notifyTaskFailed(title)
      }
      // 如果有等待中的追问，自动发送
      if (pendingFollowUp.value) {
        const msg = pendingFollowUp.value
        pendingFollowUp.value = ''
        sendFollowUpWith(msg)
      }
    }
  }
)

// ===== 报告操作 =====
const copyToast = ref(false)
let copyToastTimer: ReturnType<typeof setTimeout> | null = null

function formatTime(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function showCopyToast() {
  if (copyToastTimer) clearTimeout(copyToastTimer)
  copyToast.value = true
  copyToastTimer = setTimeout(() => { copyToast.value = false }, 2000)
}

function copyRoundReport(round: ChatRound) {
  if (!round.report) return
  navigator.clipboard.writeText(round.report).then(showCopyToast)
}

function copyUserInput(text: string) {
  navigator.clipboard.writeText(text).then(showCopyToast)
}

// ===== 计时器 =====
let timer: number | null = null

// ===== 启动真实任务执行（TaskRunner + Bridge） =====
function startRealTask(t: NonNullable<typeof task.value>, historyOverride?: ChatMessage[]) {
  if (t.status !== 'running') return
  // 模块级守卫：防止同一任务被重复启动（跨组件实例持久化）
  if (startedTaskIds.has(t.id)) {
    console.log(`[TaskView] startRealTask skipped: task ${t.id} already started (module-level guard)`)
    return
  }
  if (store.providers.length === 0) {
    console.warn('[TaskView] 无可用 LLM 供应商，回退到模拟模式')
    startTaskSimulation(t)
    return
  }

  const firstProvider = store.providers.find(p => p.enabled && p.models.length > 0)
  if (!firstProvider) {
    startTaskSimulation(t)
    return
  }

  const modelId = firstProvider.models[0].id

  // 如果该任务已有 runner 在运行，跳过
  const map = runnerMap.value
  if (map.has(t.id) && map.get(t.id)!.isRunning) {
    console.log(`[TaskView] startRealTask skipped: runner already running for ${t.id}`)
    return
  }

  // 永久标记任务已启动（不再清除，防止组件重建后重复启动）
  startedTaskIds.add(t.id)
  console.log(`[TaskView] startRealTask: starting task ${t.id}, history=${historyOverride?.length ?? 0} messages`)

  const runner = new TaskRunner({
    taskId: t.id,
    modelId,
    providers: store.providers,
    workDir: t.dir || '',
    skillNames: t.skills || [],
    suiteNames: t.suites || [],
    mcpServerIds: t.mcpServerIds || [],
    connectorIds: t.connectorIds || [],
    userMessage: t.input,
    stream: true,
    history: historyOverride,
    executionMode: t.executionMode === 'plan_execute' ? 'plan_execute' : 'auto',
  })

  // 将 runner 加入 map（触发响应式更新）
  map.set(t.id, runner)
  runnerMap.value = new Map(map)

  // 绑定 bridge
  taskRunnerBridge.bind(runner, t.id, {
    onCompleteHistory: (history) => {
      store.updateSessionHistory(t.id, history)
    }
  })

  // 任务完成后从 map 中移除（清理资源）+ 清除守卫以允许 follow-up
  runner.start().then(() => {
    console.log(`[TaskView] runner.start() resolved for task ${t.id}`)
    startedTaskIds.delete(t.id) // 允许后续 follow-up 重新启动
    const m = runnerMap.value
    if (m.get(t.id) === runner) {
      m.delete(t.id)
      runnerMap.value = new Map(m)
    }
  }).catch((err) => {
    console.error('[TaskView] TaskRunner error:', err)
    startedTaskIds.delete(t.id) // 失败也清除守卫
    const m = runnerMap.value
    if (m.get(t.id) === runner) {
      m.delete(t.id)
      runnerMap.value = new Map(m)
    }
  })
  // 注意：不再使用 .finally() 清除 startedTaskIds
  // 守卫是永久的，防止组件重建时重复启动同一任务
}

// ===== 澄清问题提交 =====
function onClarificationSubmit(blockId: string, answers: ClarificationAnswer[]) {
  const taskIdVal = taskId.value
  if (!taskIdVal) return

  // 更新 block 状态（显示已回答）
  taskRunnerBridge.submitClarificationAnswer(taskIdVal, blockId, answers)

  // 通过 runner 提交答案（解除 ReAct 循环的 pending Promise）
  // 优先使用当前任务的 runner（最常见场景）
  const runner = currentRunner.value
  if (runner?.isWaitingForClarification) {
    runner.submitClarification(answers)
    return
  }

  // 回退：当前 runner 不在等待澄清时，遍历所有 runner 找到正在等待的那个。
  // 这在以下场景会发生：
  //   1. 用户从 TaskView 离开再返回，旧 runner 仍在后台运行并等待澄清，
  //      但新组件的 currentRunner 可能为 null 或指向不同的 runner。
  //   2. 多任务并行时，当前查看的任务不在等待澄清，但另一个后台任务在等待。
  for (const [, r] of runnerMap.value) {
    if (r.isWaitingForClarification) {
      console.log(`[TaskView] onClarificationSubmit: found waiting runner (not currentRunner)`)
      r.submitClarification(answers)
      return
    }
  }

  console.warn('[TaskView] onClarificationSubmit: no runner is waiting for clarification')
}

// ===== 任务模拟（备用） =====
function startTaskSimulation(t: NonNullable<typeof task.value>) {
  if (t.status !== 'running') return
  if (t.blocks.some(b => b.status === 'running' || b.status === 'pending')) return
  const callbacks: SimulatorCallbacks = {
    onBlockAdd(block) {
      store.addBlock(t.id, block)
      scrollToBottom()
    },
    onBlockStatusChange(blockId, status) {
      store.updateBlockStatus(t.id, blockId, status)
    },
    onStepStatusChange(blockId, stepId, status) {
      store.updateStepStatus(t.id, blockId, stepId, status)
    },
    onTimerTick(elapsed) {
      store.updateTask(t.id, { elapsedSeconds: elapsed })
    },
    onComplete(totalDuration, report) {
      store.updateTask(t.id, {
        status: 'completed',
        elapsedSeconds: totalDuration,
        report,
      })
      snapshotCurrentRound()
    },
  }
  runSimulation(t, callbacks)
}

// ===== 对话轮次追踪（从 session 获取） =====
const chatRounds = computed(() => store.currentSession?.chatRounds ?? [])

function getBlocksForRound(roundIdx: number) {
  const round = chatRounds.value[roundIdx]
  if (!round) return [] as ExecutionBlock[]
  const next = chatRounds.value[roundIdx + 1]
  const end = next ? next.startBlockCount : (task.value?.blocks.length ?? 0)
  return (task.value?.blocks ?? []).slice(round.startBlockCount, end)
}

function snapshotCurrentRound() {
  const tId = taskId.value
  if (!tId) return
  const rounds = chatRounds.value
  const r = rounds[rounds.length - 1]
  if (!r || r.completed) return
  const roundIdx = rounds.length - 1
  store.updateSessionChatRound(tId, roundIdx, {
    report: task.value?.report,
    genFiles: [...(task.value?.genFiles ?? [])],
    elapsedSeconds: task.value?.elapsedSeconds,
    completed: true,
  })
}

function isRoundComplete(roundIdx: number) {
  return chatRounds.value[roundIdx]?.completed ?? false
}

/** 初始化或切换任务会话 */
async function initTaskSession(t: NonNullable<typeof task.value>) {
  console.log(`[TaskView] initTaskSession: starting for task ${t.id}, status=${t.status}`)
  // 显示加载状态（防止空白渲染 — ensureSession 涉及 Tauri IPC 异步调用）
  sessionLoading.value = true
  try {
    // 确保会话存在（从磁盘加载或创建新的）
    await store.ensureSession(t.id)
  } finally {
    sessionLoading.value = false
  }
  // 防止并发 initTaskSession 导致 currentSession 被另一个任务覆盖：
  // 如果 ensureSession 返回后 currentSession 已不是本任务的，跳过后续操作（另一个调用会负责）
  if (store.currentSession?.taskId !== t.id) {
    console.log(`[TaskView] initTaskSession: stale session for ${t.id} (current=${store.currentSession?.taskId}), skipping`)
    return
  }
  // 如果是新会话（无历史记录），创建初始对话轮次
  const session = store.currentSession
  if (session && session.chatRounds.length === 0) {
    store.addSessionChatRound(t.id, { input: t.input, startBlockCount: 0 })
  }
  // 如果任务正在运行，启动 TaskRunner 执行（自动回退到模拟）
  if (t.status === 'running') {
    // 快照当前会话历史（避免后续异步操作时 currentSession 被切换导致拿到错误的历史）
    const historySnapshot = session?.conversationHistory ?? []
    console.log(`[TaskView] initTaskSession: calling startRealTask for ${t.id}`)
    startRealTask(t, historySnapshot.length > 0 ? historySnapshot : undefined)
  }
}

onMounted(async () => {
  console.log(`[TaskView] onMounted: taskId=${taskId.value}`)
  if (task.value) {
    await initTaskSession(task.value)
  }
})

// 补全 onMounted 时 task 尚未解析的场景（首次进入时 store 异步加载）
watch(task, async (t) => {
  if (t && !sessionLoading.value) {
    const session = store.currentSession
    if (!session || session.taskId !== t.id) {
      await initTaskSession(t)
    }
  }
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  // 离开页面时不中止后台任务，任务继续运行
})

// ===== 右侧面板数据（动态从任务计划中获取） =====
const todoItems = computed(() => {
  const planItems = task.value?.planItems
  if (!planItems || planItems.length === 0) return []

  return planItems.map(item => ({
    text: item.title,
    done: item.status === 'completed',
    status: item.status,
  }))
})

// ===== Task configuration (real data from task record + store) =====
const taskConfig = computed(() => {
  const t = task.value
  if (!t) return { workDir: '', skills: [], suites: [], mcpServers: [], connectors: [] }

  // Look up MCP server names by ID
  const mcpServers = (t.mcpServerIds || []).map(id => {
    const server = store.mcpServers.find(s => s.id === id)
    return server ? server.name : id
  })

  // Look up connector names by ID
  const connectors = (t.connectorIds || []).map(id => {
    const conn = store.connectors.find(c => c.id === id)
    return conn ? conn.name : id
  })

  return {
    workDir: t.dir || '',
    skills: t.skills || [],
    suites: t.suites || [],
    mcpServers,
    connectors,
  }
})

// ===== Context token count (estimated from conversation history) =====
const contextTokenCount = computed(() => {
  const history = conversationHistory.value
  if (!history || history.length === 0) return 0
  // Rough estimate: ~4 chars per token (English) or ~2 chars per token (Chinese)
  let totalChars = 0
  for (const msg of history) {
    if (msg.content) totalChars += msg.content.length
    if (msg.reasoning_content) totalChars += msg.reasoning_content.length
  }
  // Use ~3 chars per token as a middle ground
  return Math.round(totalChars / 3)
})

// ===== genFiles =====
const genFiles = computed(() => {
  if (!task.value) return []
  const files: { name: string; type: string; content: string }[] = []
  for (const block of task.value.blocks) {
    if (block.type === 'file_gen' && block.genFiles) files.push(...block.genFiles)
  }
  return files
})

// ===== FileGen 文件操作 =====
function openGenFilePreview(file: { name: string; type: string; content: string; filePath?: string }) {
  // 图片文件 → 在预览面板中显示，并附带画廊导航
  if (isImageType(file.type)) {
    const allImages = genFiles.value.filter(f => isImageType(f.type))
    const gallery = allImages.map(f => ({ name: f.name, type: f.type, filePath: (f as any).filePath }))
    fileUtils.previewFile.value = {
      name: file.name,
      type: file.type,
      content: file.content || '',
      filePath: file.filePath,
      gallery: gallery.length > 1 ? gallery : undefined,
    }
    fileUtils.showPreview.value = true
    return
  }
  // 文档类型（DOCX/XLSX/PPTX/PDF）→ 使用内置查看器预览
  const t = file.type.toLowerCase()
  if (file.filePath && (isDocxType(t) || isPptxType(t) || isExcelType(t) || isPdfType(t))) {
    fileUtils.previewFile.value = {
      name: file.name,
      type: file.type,
      content: file.content || '',
      filePath: file.filePath,
    }
    fileUtils.showPreview.value = true
    return
  }
  // 二进制文件（由 run_command 生成，内容仅为占位符）→ 用系统默认应用打开
  if (file.filePath && file.content.startsWith('[文件]')) {
    fileUtils.openInBrowser(file)
    return
  }
  if (file.content) {
    // 使用真实内容预览
    fileUtils.previewFile.value = {
      name: file.name,
      type: file.type,
      content: file.content,
    }
    fileUtils.showPreview.value = true
  } else {
    fileUtils.openPreview(file)
  }
}

function downloadGenFile(file: { name: string; type: string; content: string; filePath?: string }) {
  if (!file.content) return
  // 二进制文件（占位符内容）→ 在文件管理器中打开所在目录
  if (file.filePath && file.content.startsWith('[文件]')) {
    fileUtils.openInBrowser(file)
    return
  }
  const mimeType = getMimeType(file.type)
  const blob = new Blob([file.content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function copyGenFile(file: { name: string; type: string; content: string; filePath?: string }) {
  if (!file.content) return
  // 二进制文件 → 复制文件路径
  if (file.filePath && file.content.startsWith('[文件]')) {
    navigator.clipboard.writeText(file.filePath).then(() => {
      codeActions.codeCopyToast.value = true
      setTimeout(() => { codeActions.codeCopyToast.value = false }, 2000)
    })
    return
  }
  navigator.clipboard.writeText(file.content).then(() => {
    codeActions.codeCopyToast.value = true
    setTimeout(() => { codeActions.codeCopyToast.value = false }, 2000)
  })
}

function copyGenFilePath(file: { name: string; type: string; content: string; filePath?: string }) {
  if (!file.filePath) return
  navigator.clipboard.writeText(file.filePath).then(() => {
    codeActions.codeCopyToast.value = true
    setTimeout(() => { codeActions.codeCopyToast.value = false }, 2000)
  })
}

function getMimeType(type: string): string {
  const map: Record<string, string> = {
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    ts: 'text/typescript',
    json: 'application/json',
    md: 'text/markdown',
    py: 'text/x-python',
    sql: 'text/x-sql',
    csv: 'text/csv',
    xml: 'text/xml',
    yaml: 'text/yaml',
    yml: 'text/yaml',
    txt: 'text/plain',
  }
  return map[type] || 'text/plain'
}

// ===== 面板展开状态 =====
const panelExpanded = ref<Record<string, boolean>>({
  todo: true, artifacts: true, skills: true, context: true,
})
const sidePanelCollapsed = ref(false)

function togglePanel(panel: string) {
  panelExpanded.value[panel] = !panelExpanded.value[panel]
}
function toggleSidePanel() {
  sidePanelCollapsed.value = !sidePanelCollapsed.value
}

// ===== 聊天滚动 =====
const chatScrollRef = ref<HTMLElement | null>(null)

function scrollToBottom() {
  nextTick(() => {
    if (chatScrollRef.value) {
      chatScrollRef.value.scrollTop = chatScrollRef.value.scrollHeight
      const innerScrollables = chatScrollRef.value.querySelectorAll<HTMLElement>(
        'pre.step-result-content, pre.code-block, .html-render-frame-wrapper'
      )
      innerScrollables.forEach((el) => { el.scrollTop = el.scrollHeight })
    }
  })
}

/** 仅在用户已滚动到底部附近时才自动滚动，避免点击展开时强制滚到底部 */
function scrollToBottomIfNeeded() {
  nextTick(() => {
    const el = chatScrollRef.value
    if (!el) return
    const threshold = 80
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight
    }
  })
}

watch(
  () => {
    if (!task.value) return ''
    return JSON.stringify(task.value.blocks.map(b => ({
      id: b.id, expanded: b.expanded, status: b.status, text: b.text,
      code: (b as any).code, htmlContent: (b as any).htmlContent,
      steps: b.steps?.map(s => ({ id: s.id, status: s.status, result: s.result, searchResults: s.searchResults })),
      results: (b as any).results?.map((r: any) => ({ title: r.title, status: r.status })),
      list: b.list, extraText: b.extraText, genFiles: b.genFiles,
    })))
  },
  () => {
    // 任务进行中始终滚动到底部，空闲时仅在用户已在底部附近才滚动
    if (isRunning.value) {
      scrollToBottom()
    } else {
      scrollToBottomIfNeeded()
    }
  },
  { deep: true }
)

// ===== 帮助数据（从 API 加载） =====
const helpData = ref<HelpInfo>({
  title: '',
  desc: '',
  features: [],
  links: [],
  version: '',
})

async function loadHelpInfo() {
  try {
    helpData.value = await helpApi.getInfo()
  } catch (err) {
    console.error('[TaskView] 获取帮助信息失败:', err)
  }
}

// 组件挂载时加载帮助信息
loadHelpInfo()

// ===== 发送消息 =====
function sendFollowUp() {
  if (!chatInput.value.trim()) return
  if (isRunning.value) { queueFollowUp(); return }
  const msg = chatInput.value.trim()
  chatInput.value = ''
  sendFollowUpWith(msg)
}

function sendFollowUpWith(msg: string) {
  if (!task.value) return
  // 检查并行任务上限（排除当前任务自身）
  const runningOthers = store.tasks.filter(t => t.status === 'running' && t.id !== task.value!.id).length
  if (runningOthers >= MAX_PARALLEL_TASKS) {
    // 显示提示
    followUpLimitToast.value = true
    setTimeout(() => { followUpLimitToast.value = false }, 3000)
    return
  }
  snapshotCurrentRound()
  store.addSessionChatRound(task.value.id, { input: msg, startBlockCount: task.value.blocks.length })
  store.updateTask(task.value.id, {
    status: 'running', input: msg,
    title: msg.slice(0, 30) + (msg.length > 30 ? '...' : ''),
    elapsedSeconds: 0, report: undefined,
  })
  // ⚠️ 安全网：直接从 sessionManager 读取最新历史，绕过 Vue 响应式链路。
  // 在 pending follow-up 场景中，此函数由 watch(task.status) 同步调用，
  // 此时 conversationHistory（computed）可能尚未重新计算，读到的是上一轮的旧值。
  // 直接从 session 对象读取可确保拿到 onCompleteHistory 刚写入的最新历史。
  const session = store.currentSession
  const history = session?.conversationHistory ?? []
  console.log(`[TaskView] sendFollowUpWith: sending follow-up with ${history.length} history messages, session=${session?.taskId}, msg="${msg.slice(0, 50)}"`)
  startRealTask(task.value, history.length > 0 ? history : undefined)
}

// ===== 停止任务 =====
function stopTask() {
  const runner = currentRunner.value
  if (runner && isRunning.value) {
    runner.abort()
  }
}

// ===== 导航 =====
function goBack() { router.push('/new-task') }
</script>

<template>
  <div class="task-view" :class="{ 'preview-open': fileUtils.showPreview.value }">
    <!-- ===== 顶部导航栏 ===== -->
    <TopBar
      :task-title="taskTitle"
      :is-running="isRunning"
      :elapsed-seconds="elapsedSeconds"
      :help-data="helpData"
      @go-back="goBack"
    />

    <!-- ===== 主体区域 ===== -->
    <div class="body-area">
      <!-- ===== 左侧主操作区 ===== -->
      <div class="main-panel">
        <!-- ◆ 会话加载中遮罩（防止空白渲染） -->
        <div v-if="sessionLoading" class="session-loading">
          <div class="session-loading-spinner">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>正在加载任务会话...</span>
          </div>
        </div>

        <div ref="chatScrollRef" class="chat-scroll">
          <!-- ===== 按轮次渲染对话历史 ===== -->
          <template v-for="(round, rIdx) in chatRounds" :key="'round-' + rIdx">
            <!-- 用户对话气泡 -->
            <div class="user-bubble-wrapper">
              <div class="user-bubble">
                <p>{{ round.input }}</p>
                <p v-if="rIdx === 0 && task?.dir" class="bubble-meta">工作目录: {{ task?.dir }}</p>
              </div>
              <button class="bubble-copy-btn" title="复制" @click="copyUserInput(round.input)">
                <i class="fa-solid fa-copy"></i>
              </button>
            </div>

            <!-- 该轮执行块 -->
            <template v-for="block in getBlocksForRound(rIdx)" :key="block.id">
              <PlanOutputBlock
                v-if="block.type === 'plan_output'"
                :block="block"
                @toggle-block="blockHelpers.toggleBlock(block)"
                @toggle-output="blockHelpers.togglePlanOutput(block)"
                @copy-code="(c) => codeActions.copyCode(c)"
              />
              <ThinkingBlock
                v-else-if="block.type === 'thinking'"
                :block="block"
                @toggle-block="blockHelpers.toggleBlock(block)"
                @toggle-step-result="(s) => blockHelpers.toggleStepResult(s)"
                @copy-code="(c) => codeActions.copyCode(c)"
                @download-code="(c, f) => codeActions.downloadCode(c, f)"
                @open-code-popup="(c, l, f) => codeActions.openCodePopup(c, l, f)"
                @open-code-popup-preview="(c, l, f) => codeActions.openCodePopupPreview(c, l, f)"
              />
              <ComplexThinkingBlock
                v-else-if="block.type === 'complex_thinking'"
                :block="block"
                @toggle-block="blockHelpers.toggleBlock(block)"
                @toggle-step-result="(s) => blockHelpers.toggleStepResult(s)"
                @toggle-search-result-content="(r) => blockHelpers.toggleSearchResultContent(r)"
                @copy-code="(c) => codeActions.copyCode(c)"
                @download-code="(c, f) => codeActions.downloadCode(c, f)"
                @open-code-popup="(c, l, f) => codeActions.openCodePopup(c, l, f)"
                @open-code-popup-preview="(c, l, f) => codeActions.openCodePopupPreview(c, l, f)"
              />
              <SubAgentBlock
                v-else-if="block.type === 'sub_agent'"
                :block="block"
                @toggle-block="blockHelpers.toggleBlock(block)"
                @copy-code="(c) => codeActions.copyCode(c)"
              />
              <CodeEditBlock
                v-else-if="block.type === 'code_edit' || block.type === 'document'"
                :block="block"
                @toggle-block="blockHelpers.toggleBlock(block)"
                @copy-code="(c) => codeActions.copyCode(c)"
                @download-code="(c, f) => codeActions.downloadCode(c, f)"
                @open-code-popup="(c, l, f) => codeActions.openCodePopup(c, l, f)"
                @open-code-popup-preview="(c, l, f) => codeActions.openCodePopupPreview(c, l, f)"
              />
              <WebSearchBlock
                v-else-if="block.type === 'web_search'"
                :block="block"
                @toggle-block="blockHelpers.toggleBlock(block)"
                @toggle-search-result-content="(r) => blockHelpers.toggleSearchResultContent(r)"
                @copy-code="(c) => codeActions.copyCode(c)"
                @download-code="(c, f) => codeActions.downloadCode(c, f)"
                @open-code-popup="(c, l, f) => codeActions.openCodePopup(c, l, f)"
                @open-code-popup-preview="(c, l, f) => codeActions.openCodePopupPreview(c, l, f)"
              />
              <FileQueryBlock
                v-else-if="block.type === 'file_query'"
                :block="block"
                @toggle-block="blockHelpers.toggleBlock(block)"
              />
              <McpExecuteBlock
                v-else-if="block.type === 'mcp_execute'"
                :block="block"
                @toggle-block="blockHelpers.toggleBlock(block)"
                @toggle-mcp-result="blockHelpers.toggleMcpResult(block)"
                @copy-code="(c) => codeActions.copyCode(c)"
                @download-code="(c, f) => codeActions.downloadCode(c, f)"
                @open-code-popup="(c, l, f) => codeActions.openCodePopup(c, l, f)"
              />
              <FileGenBlock
                v-else-if="block.type === 'file_gen'"
                :block="block"
                @toggle-block="blockHelpers.toggleBlock(block)"
                @open-preview="(f) => openGenFilePreview(f)"
                @download-file="(f) => downloadGenFile(f)"
                @copy-file="(f) => copyGenFile(f)"
                @copy-file-path="(f) => copyGenFilePath(f)"
                @open-in-browser="(f) => fileUtils.openInBrowser(f)"
              />
              <HtmlRenderBlock
                v-else-if="block.type === 'html_render'"
                :block="block"
                @toggle-block="blockHelpers.toggleBlock(block)"
                @copy-code="(c) => codeActions.copyCode(c)"
                @download-code="(c, f) => codeActions.downloadCode(c, f)"
                @open-code-popup="(c, l, f) => codeActions.openCodePopup(c, l, f)"
                @open-code-popup-preview="(c, l, f) => codeActions.openCodePopupPreview(c, l, f)"
              />
              <ClarificationBlock
                v-else-if="block.type === 'clarification'"
                :block="block"
                @submit="(answers) => onClarificationSubmit(block.id, answers)"
              />
              <ErrorBlock
                v-else-if="block.type === 'error'"
                :block="block"
              />
            </template>

            <!-- ◆ 本轮完成标记 -->
            <div v-if="isRoundComplete(rIdx)" class="round-complete-divider">
              <span class="round-divider-text">
                本轮完成
                <span v-if="round.elapsedSeconds" class="round-divider-time">· 耗时 {{ formatTime(round.elapsedSeconds) }}</span>
              </span>
              <button
                v-if="round.report"
                class="round-divider-copy-btn"
                title="复制报告"
                @click="copyRoundReport(round)"
              >
                <i class="fa-solid fa-copy"></i>
              </button>
            </div>
          </template>
        </div>

        <!-- ===== 任务等待区 ===== -->
        <WaitingArea
          :pending-follow-up="pendingFollowUp"
          :show-dropdown="showPendingDropdown"
          @toggle-dropdown="togglePendingDropdown"
          @cancel="cancelPendingFollowUp"
        />

        <!-- ===== 底部输入区 ===== -->
        <ChatInput
          v-model="chatInput"
          :can-queue="canQueue"
          :is-running="isRunning"
          @send="sendFollowUp"
          @stop="stopTask"
        />
      </div>

      <!-- ===== 右侧面板 ===== -->
      <SidePanel
        :todo-items="todoItems"
        :gen-files="genFiles"
        :task-config="taskConfig"
        :panel-expanded="panelExpanded"
        :side-panel-collapsed="sidePanelCollapsed"
        :show-preview="fileUtils.showPreview.value"
        :context-token-count="contextTokenCount"
        @toggle-panel="togglePanel"
        @toggle-side-panel="toggleSidePanel"
        @open-preview="(f) => openGenFilePreview(f)"
      />

      <!-- ===== 预览面板 ===== -->
      <PreviewPanel
        :show-preview="fileUtils.showPreview.value"
        :preview-file="fileUtils.previewFile.value"
        @close="fileUtils.closePreview()"
      />
    </div>
  </div>

  <!-- ===== 代码弹窗 ===== -->
  <CodePopup
    :visible="codeActions.codePopupVisible.value"
    :data="codeActions.codePopupData.value"
    :preview-mode="codeActions.codePopupPreviewMode.value"
    @close="codeActions.closeCodePopup()"
    @toggle-preview="codeActions.toggleCodePopupPreview()"
    @copy="(c) => codeActions.copyCode(c)"
    @download="(c, f) => codeActions.downloadCode(c, f)"
  />

  <!-- ===== 复制成功提示 ===== -->
  <Transition name="toast-fade">
    <div v-if="codeActions.codeCopyToast.value" class="copy-toast">
      <i class="fa-solid fa-check"></i>
      <span>已复制到剪贴板</span>
    </div>
  </Transition>

  <!-- ===== 用户输入/报告复制提示 ===== -->
  <Transition name="toast-fade">
    <div v-if="copyToast" class="copy-toast">
      <i class="fa-solid fa-check"></i>
      <span>已复制到剪贴板</span>
    </div>
  </Transition>

  <!-- ===== 并行任务上限提示 ===== -->
  <Transition name="toast-fade">
    <div v-if="followUpLimitToast" class="copy-toast" style="background: #fff3cd; color: #856404;">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <span>已达最大并行任务数（{{ MAX_PARALLEL_TASKS }}），请先停止其他任务后再发送</span>
    </div>
  </Transition>

  <!-- ===== TaskRunner 调试面板 ===== -->
  <TaskRunnerDebug
    v-if="task && store.experimentalSettings.debugEnabled"
    :work-dir="task?.dir"
    :skill-names="task?.skills"
    :suite-names="task?.suites"
    :mcp-server-ids="task?.mcpServerIds"
    :connector-ids="task?.connectorIds"
    :user-message="task?.input || ''"
    :runner="currentRunner ?? undefined"
  />
</template>

<style lang="scss" scoped>
@use '../assets/styles/task/task-view';
@use '../assets/styles/task/user-bubble';
@use '../assets/styles/task/report';
@use '../assets/styles/task/waiting';
@use '../assets/styles/task/input-area';
@use '../assets/styles/task/execution-block';
</style>
