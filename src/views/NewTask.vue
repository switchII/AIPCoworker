<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAgentStore } from '../stores/agentStore'
import { resolveWorkDir } from '../utils/workspace'
import ModelPicker from '../components/chat/ModelPicker.vue'
import DirPicker from '../components/chat/DirPicker.vue'
import SkillSuitePicker from '../components/chat/SkillSuitePicker.vue'
import McpServerPicker from '../components/chat/McpServerPicker.vue'
import WorkspacePermissionModal from '../components/task/components/WorkspacePermissionModal.vue'
import FeedbackPopover from '../components/task/components/FeedbackPopover.vue'
import CreditsPopover from '../components/task/components/CreditsPopover.vue'
import { creditsApi, feedbackApi } from '../api'
import type { CreditsRow } from '../api/credits'
import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'

const router = useRouter()
const store = useAgentStore()

// ---- 工作目录 ----
const LAST_WORKDIR_KEY = 'aipcowork_last_workdir'

/** 从 localStorage 恢复上次使用的工作目录 */
function loadLastWorkDir(): string {
  try {
    return localStorage.getItem(LAST_WORKDIR_KEY) || ''
  } catch { return '' }
}

/** 将当前工作目录持久化到 localStorage */
function saveLastWorkDir(dir: string) {
  try {
    if (dir) localStorage.setItem(LAST_WORKDIR_KEY, dir)
  } catch { /* ignore */ }
}

const workDir = ref(loadLastWorkDir())
const taskInput = ref('')

// ---- 工作区授权（持久化 + 过期判断） ----
const AUTH_KEY = 'aipcowork_work_dir_auth'
const HISTORY_KEY = 'aipcowork_work_dir_history'

interface DirAuthEntry {
  dir: string
  /** 授权到期时间戳（0 = 永久，-1 = 仅本次） */
  expiresAt: number
}

const dirAuths = ref<DirAuthEntry[]>(loadAuths())

function loadAuths(): DirAuthEntry[] {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    }
  } catch { /* ignore */ }
  return []
}

function saveAuths() {
  localStorage.setItem(AUTH_KEY, JSON.stringify(dirAuths.value))
}

/** 清理已过期的授权条目 */
function cleanExpiredAuths() {
  const now = Date.now()
  dirAuths.value = dirAuths.value.filter(e => e.expiresAt === 0 || e.expiresAt > now)
  saveAuths()
}

/** 检查目录是否有有效授权 */
function hasValidAuth(dir: string): boolean {
  cleanExpiredAuths()
  return dirAuths.value.some(e => e.dir === dir)
}

/** 检查目录是否在历史目录列表中 */
function isInHistoryDirs(dir: string): boolean {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) && parsed.includes(dir)
    }
  } catch { /* ignore */ }
  return false
}

/** 根据授权时效计算 expiresAt */
function calcExpiresAt(duration: 'once' | 'session' | '24h' | 'always'): number {
  switch (duration) {
    case 'once': return -1   // 仅本次，立即过期
    case 'session': return Date.now() + 8 * 60 * 60 * 1000  // 会话按 8h
    case '24h': return Date.now() + 24 * 60 * 60 * 1000
    case 'always': return 0  // 永久
  }
}

/** 添加或更新授权记录 */
function upsertAuth(dir: string, duration: 'once' | 'session' | '24h' | 'always') {
  const expiresAt = calcExpiresAt(duration)
  const idx = dirAuths.value.findIndex(e => e.dir === dir)
  if (idx !== -1) {
    dirAuths.value[idx].expiresAt = expiresAt
  } else {
    dirAuths.value.push({ dir, expiresAt })
  }
  saveAuths()
}

// ---- 技能/套件选择 ----
const skillPickerRef = ref<InstanceType<typeof SkillSuitePicker> | null>(null)
const selectedSkillNames = ref<string[]>([])
const selectedSuiteNames = ref<string[]>([])
const selectedConnectorIds = ref<string[]>([])

// ---- MCP 服务器选择 ----
const mcpPickerRef = ref<InstanceType<typeof McpServerPicker> | null>(null)
const selectedMCPServerIds = ref<string[]>([])

function handleDirSelect(dir: string) {
  requestPermission(dir)
}

const showPermission = ref(false)
const pendingDir = ref('')
const authDuration = ref<'once' | 'session' | '24h' | 'always'>('session')

function requestPermission(dir: string) {
  // 1. 历史目录 → 已授权过，直接通过
  if (isInHistoryDirs(dir)) {
    workDir.value = dir
    saveLastWorkDir(dir)
    return
  }
  // 2. 有有效授权（未过期）→ 直接通过
  if (hasValidAuth(dir)) {
    workDir.value = dir
    saveLastWorkDir(dir)
    return
  }
  // 3. 全新目录 或 授权已过期 → 弹窗请求授权
  pendingDir.value = dir
  authDuration.value = 'session'
  showPermission.value = true
}

function confirmPermission() {
  upsertAuth(pendingDir.value, authDuration.value)
  workDir.value = pendingDir.value
  saveLastWorkDir(pendingDir.value)
  showPermission.value = false
  pendingDir.value = ''
}

function denyPermission() {
  showPermission.value = false
  pendingDir.value = ''
}

/** 最大并行任务数（与 TaskView 保持一致） */
const MAX_PARALLEL_TASKS = 3

/** 提交任务时的加载状态（防止重复提交 + 显示 loading 反馈） */
const submitting = ref(false)

/** 提交任务 → 进入任务执行界面 */
async function submitTask() {
  if (!taskInput.value.trim() || submitting.value) return

  // 检查当前正在运行的任务数量
  const runningCount = store.tasks.filter(t => t.status === 'running').length
  if (runningCount >= MAX_PARALLEL_TASKS) {
    ElMessage.warning(`最多同时运行 ${MAX_PARALLEL_TASKS} 个任务，当前已有 ${runningCount} 个任务正在执行，请先等待或停止后再提交`)
    return
  }

  submitting.value = true
  try {
    const skillNames = skillPickerRef.value
      ? skillPickerRef.value.selectedSkillItems.map(s => s.id)
      : []
    const suiteNames = skillPickerRef.value
      ? skillPickerRef.value.selectedSuiteItems.map(s => s.name)
      : []
    const mcpServerIds = selectedMCPServerIds.value
    const connectorIds = selectedConnectorIds.value
    // 如果未选择工作目录，使用默认工作空间 ~/AipWorkspace
    const resolvedDir = await resolveWorkDir(workDir.value)
    const task = store.createTask(
      taskInput.value.trim(),
      resolvedDir,
      skillNames,
      suiteNames,
      mcpServerIds,
      connectorIds,
    )
    await router.push({ path: '/task-view', query: { taskId: task.id } })
  } catch (err) {
    console.error('[NewTask] 提交任务失败:', err)
    submitting.value = false
  }
}

/** 跳转到设置页的记忆模块（设定身份） */
function goToMemorySettings() {
  router.push({ path: '/settings', query: { tab: 'memory' } })
}

function handleKeydown(e: KeyboardEvent) {
  // Skip if IME is composing (e.g. Chinese/Japanese input method on Mac)
  if (e.isComposing) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submitTask()
  }
}

// 常用办公提示词
const quickPrompts = [
  '整理本周工作日报',
  '分析销售数据并生成图表',
  '起草会议纪要',
  '撰写产品需求文档',
  '优化邮件措辞',
  '制定项目排期计划'
]

function fillPrompt(text: string) {
  taskInput.value = text
}

// ===== 问题反馈 & 积分浮层 =====
const showFeedback = ref(false)
const showCredits = ref(false)

// 积分数据（从 API 加载）
const creditsRows = ref<CreditsRow[]>([])
const creditsLoading = ref(false)

/** 加载积分数据 */
async function loadCredits() {
  if (creditsLoading.value) return
  creditsLoading.value = true
  try {
    creditsRows.value = await creditsApi.getCredits()
  } catch (err) {
    console.error('[NewTask] 获取积分失败:', err)
  } finally {
    creditsLoading.value = false
  }
}

function toggleFeedback() {
  showCredits.value = false
  showFeedback.value = !showFeedback.value
}
function toggleCredits() {
  showFeedback.value = false
  showCredits.value = !showCredits.value
  // 打开积分浮层时加载数据
  if (showCredits.value) {
    loadCredits()
  }
}
function closeFeedback() { showFeedback.value = false }
function closeCredits()  { showCredits.value = false }

const feedbackSubmitting = ref(false)

async function onFeedbackSubmit(data: { text: string; email: string; images: string[] }) {
  if (feedbackSubmitting.value) return
  feedbackSubmitting.value = true
  try {
    const result = await feedbackApi.submit(data)
    console.log('[NewTask] 反馈提交成功:', result)
    ElMessage.success(result.message || '感谢您的反馈！我们会尽快处理。')
  } catch (err) {
    console.error('[NewTask] 反馈提交失败:', err)
    const msg = err instanceof Error ? err.message : '提交失败，请稍后重试'
    ElMessage.error(msg)
  } finally {
    feedbackSubmitting.value = false
  }
}

const topBarActionsRef = ref<HTMLElement | null>(null)

function handleClickOutside(e: MouseEvent) {
  if (topBarActionsRef.value && !topBarActionsRef.value.contains(e.target as Node)) {
    showFeedback.value = false
    showCredits.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <div class="page">
    <!-- ===== 顶部操作栏 ===== -->
    <header class="top-bar">
      <div class="version-picker">
          <!--
            <span>AIPCowork 1.6 Lite</span>
            <svg class="ico-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          -->
      </div>
      <div class="top-bar-actions" ref="topBarActionsRef">
        <button class="top-action-btn" @click.stop="toggleFeedback">
          <i class="fa-regular fa-comment-dots"></i>
          <span>问题反馈</span>
        </button>
        <button class="top-action-btn" @click.stop="toggleCredits">
          <i class="fa-regular fa-circle-check"></i>
          <span>查看积分</span>
        </button>

        <!-- ===== 问题反馈浮层 ===== -->
        <FeedbackPopover
          :show="showFeedback"
          @close="closeFeedback"
          @submit="onFeedbackSubmit"
        />

        <!-- ===== 积分使用浮层 ===== -->
        <CreditsPopover
          :show="showCredits"
          :rows="creditsRows"
          @close="closeCredits"
        />
      </div>
    </header>

    <!-- ===== 中部核心区 ===== -->
    <div class="center-area">

      <!-- 主标题 -->
      <h1 class="main-title">我能为你做什么？</h1>
      <p class="main-subtitle">本地规划，自主运行，安全可控的AI工作搭子 :-)</p>

      <!-- ===== 核心输入卡片 ===== -->
      <div class="input-container">
        <!-- ◆ 已选技能 / 套件 / 连接器 Chip 展示区（放在 input-card 上方，避免 input-card 高度变化） -->
        <div v-if="(skillPickerRef?.selectedSkillItems.length || 0) > 0 || (skillPickerRef?.selectedSuiteItems.length || 0) > 0 || (skillPickerRef?.selectedConnectorItems.length || 0) > 0" class="selected-chips">
          <span
            v-for="s in skillPickerRef?.selectedSkillItems || []"
            :key="'sk-' + s.id"
            class="chip chip-skill"
          >
            <i :class="s.icon"></i>
            <span>{{ s.name }}</span>
            <button class="chip-remove" @click="skillPickerRef?.toggleSkill(s.id)" title="移除">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </span>
          <span
            v-for="s in skillPickerRef?.selectedSuiteItems || []"
            :key="'su-' + s.id"
            class="chip chip-suite"
          >
            <i :class="s.icon"></i>
            <span>{{ s.name }}</span>
            <button class="chip-remove" @click="skillPickerRef?.toggleSuite(s.id)" title="移除">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </span>
          <span
            v-for="c in skillPickerRef?.selectedConnectorItems || []"
            :key="'cn-' + c.id"
            class="chip chip-connector"
          >
            <i :class="c.type === 'ssh' ? 'fa-solid fa-terminal' : 'fa-solid fa-database'"></i>
            <span>{{ c.name }}</span>
            <button class="chip-remove" @click="skillPickerRef?.toggleConnector(c.id)" title="移除">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </span>
        </div>

        <div class="input-card">
          <!-- ◆ 输入区域 -->
          <textarea
            v-model="taskInput"
            class="main-input"
            placeholder="分配一个任务或提问任何问题"
            rows="4"
            @keydown="handleKeydown"
          ></textarea>

          <!-- ◆ 底部工具栏 -->
          <div class="input-footer">
            <!-- 左侧：模型选择器 + 工作目录选择器 + 工具图标 -->
            <div class="footer-left" ref="dropdownRef">
              <ModelPicker />

              <DirPicker :work-dir="workDir" @select-dir="handleDirSelect" />

              <SkillSuitePicker
                ref="skillPickerRef"
                @update:skill-names="selectedSkillNames = $event"
                @update:suite-names="selectedSuiteNames = $event"
                @update:connector-ids="selectedConnectorIds = $event"
              />
              
              <McpServerPicker
                ref="mcpPickerRef"
                @update:mcp-server-ids="selectedMCPServerIds = $event"
              />
              
              <button class="tool-btn" title="历史对话">
                <i class="fa-solid fa-clock-rotate-left"></i>
              </button>

            </div>
            <!-- 右侧工具 -->
            <div class="footer-right">

              <button class="send-btn" :class="{ active: taskInput.trim(), submitting }" :disabled="submitting" title="发送" @click="submitTask">
                <i v-if="submitting" class="fa-solid fa-spinner fa-spin"></i>
                <i v-else class="fa-solid fa-truck-fast"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 常用办公提示词 -->
      <div class="quick-actions">
        <button
          v-for="prompt in quickPrompts"
          :key="prompt"
          class="quick-btn"
          @click="fillPrompt(prompt)"
        >
          {{ prompt }}
        </button>
      </div>
    </div>

    <!-- ===== 底部个性化卡片 ===== -->
    <div class="personalize-card" @click="goToMemorySettings">
      <div class="card-left">
        <span class="card-title">个性化您的AIPCowork</span>
        <span class="card-desc">设定身份与记忆，让AIPCowork更了解你。</span>
      </div>
      <div class="card-right">
        <i class="fa-solid fa-chevron-right card-arrow"></i>
      </div>
    </div>

  </div>

  <!-- ===== 工作区访问权限弹窗 ===== -->
  <WorkspacePermissionModal
    :show="showPermission"
    :pending-dir="pendingDir"
    :auth-duration="authDuration"
    @confirm="confirmPermission"
    @deny="denyPermission"
    @update:auth-duration="authDuration = $event"
  />
</template>

<style lang="scss" scoped>
@use '@/assets/styles/new-task/new-task';
@use '@/assets/styles/new-task/input-card';
@use '@/assets/styles/new-task/quick-actions';
@use '@/assets/styles/new-task/personalize-card';
@use '@/assets/styles/new-task/popovers';
</style>
