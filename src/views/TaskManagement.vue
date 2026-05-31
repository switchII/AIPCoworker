<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAgentStore } from '../stores/agentStore'
import type { TaskRecord, TaskStatus } from '../types/task'

const router = useRouter()
const store = useAgentStore()

// ─── State ─────────────────────────────────────────────────────
const searchQuery = ref('')
const statusFilter = ref<TaskStatus | 'all'>('all')
const currentPage = ref(1)
const pageSize = 15
const loading = ref(false)

// Delete confirm dialog
const showDeleteDialog = ref(false)
const deleteTargetId = ref<string | null>(null)
const deleteTargetTitle = ref('')

// ─── Computed ──────────────────────────────────────────────────
const filteredTasks = computed(() => {
  let result = store.tasks as TaskRecord[]

  // Status filter
  if (statusFilter.value !== 'all') {
    result = result.filter(t => t.status === statusFilter.value)
  }

  // Search
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    result = result.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.input || '').toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q)
    )
  }

  // Sort by startTime descending (newest first)
  result = [...result].sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
  return result
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredTasks.value.length / pageSize)))

const paginatedTasks = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredTasks.value.slice(start, start + pageSize)
})

const statusCounts = computed(() => {
  const tasks = store.tasks as TaskRecord[]
  return {
    all: tasks.length,
    running: tasks.filter(t => t.status === 'running').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    failed: tasks.filter(t => t.status === 'failed').length,
    pending: tasks.filter(t => t.status === 'pending').length,
  }
})

// Reset to page 1 when filter/search changes
watch([searchQuery, statusFilter], () => {
  currentPage.value = 1
})

// ─── Actions ───────────────────────────────────────────────────
function goToTask(task: TaskRecord) {
  router.push('/task-view?taskId=' + task.id)
}

function confirmDelete(task: TaskRecord) {
  deleteTargetId.value = task.id
  deleteTargetTitle.value = task.title
  showDeleteDialog.value = true
}

async function doDelete() {
  if (!deleteTargetId.value) return
  await store.deleteTask(deleteTargetId.value)
  showDeleteDialog.value = false
  deleteTargetId.value = null
  // Adjust page if current is now empty
  if (paginatedTasks.value.length === 0 && currentPage.value > 1) {
    currentPage.value--
  }
}

function formatElapsed(seconds: number): string {
  if (!seconds || seconds < 1) return '-'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s}s`
}

function formatTime(timestamp: number): string {
  if (!timestamp) return '-'
  const d = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getStatusLabel(status: TaskStatus): string {
  const map: Record<TaskStatus, string> = {
    pending: '待执行',
    running: '运行中',
    completed: '已完成',
    failed: '已失败',
  }
  return map[status] || status
}

function getPageNumbers(): (number | '...')[] {
  const total = totalPages.value
  const cur = currentPage.value
  const pages: (number | '...')[] = []

  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i)
  } else {
    pages.push(1)
    if (cur > 3) pages.push('...')
    const start = Math.max(2, cur - 1)
    const end = Math.min(total - 1, cur + 1)
    for (let i = start; i <= end; i++) pages.push(i)
    if (cur < total - 2) pages.push('...')
    pages.push(total)
  }
  return pages
}

async function refreshTasks() {
  loading.value = true
  await store.loadTasks(1000)
  loading.value = false
}

onMounted(() => {
  if (store.tasks.length === 0) {
    refreshTasks()
  }
})
</script>

<template>
  <div class="page-container">
    <!-- Header -->
    <div class="page-header">
      <div class="header-left">
        <h1>任务管理</h1>
        <p class="subtitle">查看、搜索和管理所有历史任务记录</p>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="toolbar">
      <div class="search-box">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="搜索任务名称、内容或 ID…"
        />
      </div>

      <button
        v-for="opt in [
          { key: 'all', label: '全部' },
          { key: 'running', label: '运行中' },
          { key: 'completed', label: '已完成' },
          { key: 'failed', label: '已失败' },
          { key: 'pending', label: '待执行' },
        ]"
        :key="opt.key"
        class="filter-btn"
        :class="{ active: statusFilter === opt.key }"
        @click="statusFilter = (opt.key as TaskStatus | 'all')"
      >
        {{ opt.label }}
        <span v-if="statusCounts[opt.key as keyof typeof statusCounts] > 0" style="opacity:0.6;margin-left:2px">
          ({{ statusCounts[opt.key as keyof typeof statusCounts] }})
        </span>
      </button>

      <span class="result-count">共 {{ filteredTasks.length }} 条</span>
    </div>

    <!-- Empty state -->
    <div v-if="filteredTasks.length === 0" class="empty-state">
      <i class="fa-solid fa-inbox empty-icon"></i>
      <p class="empty-title">{{ searchQuery || statusFilter !== 'all' ? '未找到匹配的任务' : '暂无任务记录' }}</p>
      <p class="empty-desc">{{ searchQuery || statusFilter !== 'all' ? '尝试修改搜索条件或筛选状态' : '创建第一个任务后将在此显示历史记录' }}</p>
    </div>

    <!-- Task table -->
    <div v-else class="task-table">
      <div class="table-header">
        <span>状态</span>
        <span>任务名称</span>
        <span>任务描述</span>
        <span>执行模式</span>
        <span>技能</span>
        <span>耗时</span>
        <span>开始时间</span>
        <span style="text-align:right">操作</span>
      </div>

      <div class="table-body">
        <div
          v-for="task in paginatedTasks"
          :key="task.id"
          class="table-row clickable"
          @click="goToTask(task)"
        >
          <!-- Status -->
          <span class="col-status">
            <span class="status-badge" :class="task.status">
              <span class="status-dot" :class="task.status"></span>
              {{ getStatusLabel(task.status) }}
            </span>
          </span>

          <!-- Title -->
          <span class="col-title" :title="task.title">{{ task.title }}</span>

          <!-- Input -->
          <span class="col-input" :title="task.input">{{ task.input || '-' }}</span>

          <!-- Mode -->
          <span class="col-mode">
            <span class="mode-tag" :class="task.executionMode || 'react'">
              {{ task.executionMode === 'plan_execute' ? 'Plan' : 'ReAct' }}
            </span>
          </span>

          <!-- Skills -->
          <span class="col-skills">
            <template v-if="task.skills && task.skills.length > 0">
              <span class="skill-chip" v-for="s in task.skills.slice(0, 2)" :key="s" :title="s">{{ s }}</span>
              <span v-if="task.skills.length > 2" class="skill-more">+{{ task.skills.length - 2 }}</span>
            </template>
            <span v-else style="color:#BBB;font-size:11px">-</span>
          </span>

          <!-- Elapsed -->
          <span class="col-elapsed">{{ formatElapsed(task.elapsedSeconds) }}</span>

          <!-- Start time -->
          <span class="col-time">{{ formatTime(task.startTime) }}</span>

          <!-- Actions -->
          <span class="col-actions" @click.stop>
            <button class="action-btn" title="查看任务" @click="goToTask(task)">
              <i class="fa-solid fa-arrow-up-right-from-square"></i>
            </button>
            <button class="action-btn danger" title="删除任务" @click="confirmDelete(task)">
              <i class="fa-solid fa-trash"></i>
            </button>
          </span>
        </div>
      </div>

      <!-- Pagination -->
      <div class="pagination" v-if="totalPages > 1">
        <span class="page-info">
          第 {{ (currentPage - 1) * pageSize + 1 }}–{{ Math.min(currentPage * pageSize, filteredTasks.length) }} 条，共 {{ filteredTasks.length }} 条
        </span>
        <div class="page-controls">
          <button
            class="page-btn"
            :disabled="currentPage === 1"
            @click="currentPage = 1"
            title="首页"
          >
            <i class="fa-solid fa-angles-left"></i>
          </button>
          <button
            class="page-btn"
            :disabled="currentPage === 1"
            @click="currentPage--"
            title="上一页"
          >
            <i class="fa-solid fa-angle-left"></i>
          </button>

          <template v-for="(p, idx) in getPageNumbers()" :key="idx">
            <span v-if="p === '...'" class="page-ellipsis">…</span>
            <button
              v-else
              class="page-btn"
              :class="{ active: currentPage === p }"
              @click="currentPage = p"
            >
              {{ p }}
            </button>
          </template>

          <button
            class="page-btn"
            :disabled="currentPage === totalPages"
            @click="currentPage++"
            title="下一页"
          >
            <i class="fa-solid fa-angle-right"></i>
          </button>
          <button
            class="page-btn"
            :disabled="currentPage === totalPages"
            @click="currentPage = totalPages"
            title="末页"
          >
            <i class="fa-solid fa-angles-right"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- Delete confirm dialog -->
    <Transition name="pop">
      <div v-if="showDeleteDialog" class="dialog-mask" @click.self="showDeleteDialog = false">
        <div class="confirm-dialog">
          <div class="confirm-icon">
            <i class="fa-solid fa-trash"></i>
          </div>
          <p class="confirm-title">确认删除任务？</p>
          <p class="confirm-desc">
            将永久删除任务「<strong>{{ deleteTargetTitle }}</strong>」及其所有执行记录，此操作不可撤销。
          </p>
          <div class="confirm-actions">
            <button class="btn-cancel" @click="showDeleteDialog = false">取消</button>
            <button class="btn-danger" @click="doDelete">确认删除</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/task-management/task-management';
</style>
