<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAgentStore } from '../stores/agentStore'
import helpApi from '@/api/help'
import type { HelpInfo } from '@/api/help'

const router = useRouter()
const route = useRoute()
const store = useAgentStore()

// ── 导航加载状态：点击侧边栏任务后立即显示反馈，消除空白等待焦虑 ──
const navigatingTaskId = ref<string | null>(null)
const routeLoading = ref(false)

// 路由完成后清除加载状态
router.afterEach(() => {
  navigatingTaskId.value = null
  routeLoading.value = false
})

function navigateToTask(taskId: string) {
  // 已在当前任务页则跳过重复导航
  if (route.path === '/task-view' && route.query.taskId === taskId) return
  navigatingTaskId.value = taskId
  routeLoading.value = true
  router.push('/task-view?taskId=' + taskId)
}

function navigate(path: string) {
  routeLoading.value = true
  router.push(path)
}

const navItems = [
  { path: '/new-task', label: '新建任务', icon: 'fa-solid fa-pen-to-square' },
  { path: '/skills', label: '技能', icon: 'fa-solid fa-wand-magic-sparkles' },
  { path: '/expert-suites', label: '专家套件', icon: 'fa-solid fa-cubes' },
  { path: '/connectors', label: '连接器', icon: 'fa-solid fa-plug' },
  { path: '/scheduled-tasks', label: '定时任务', icon: 'fa-solid fa-clock', badge: '新' },
  { path: '/im-channels', label: 'IM频道', icon: 'fa-solid fa-comments' }
]

// 从 store 获取任务列表
const taskList = computed(() => store.tasks)

// 用户信息
const showUserMenu = ref(false)
const userMenuRef = ref<HTMLElement | null>(null)
const sidebarCollapsed = ref(false)

// 帮助文档 popover
const showHelpPopover = ref(false)
const helpPopoverRef = ref<HTMLElement | null>(null)
const helpData = ref<HelpInfo>({
  title: 'AIPCowork',
  desc: '智能工作助手',
  features: [],
  links: [],
  version: '',
})

// 功能开发中 toast
const showDevToast = ref(false)
let devToastTimer: ReturnType<typeof setTimeout> | null = null

function showDevelopingToast() {
  showUserMenu.value = false
  showDevToast.value = true
  if (devToastTimer) clearTimeout(devToastTimer)
  devToastTimer = setTimeout(() => {
    showDevToast.value = false
  }, 2000)
}

function toggleHelpPopover() {
  showUserMenu.value = false
  showHelpPopover.value = !showHelpPopover.value
}

function handleClickOutside(e: MouseEvent) {
  if (helpPopoverRef.value && !helpPopoverRef.value.contains(e.target as Node)) {
    showHelpPopover.value = false
  }
}

async function loadHelpInfo() {
  try {
    helpData.value = await helpApi.getInfo()
  } catch (err) {
    console.error('[Layout] 获取帮助信息失败:', err)
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  loadHelpInfo()
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  if (devToastTimer) clearTimeout(devToastTimer)
})

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

function goToTaskHistory() {
  navigate('/task-management')
}

function formatTime(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function isTaskActive(taskId: string) {
  return route.query.taskId === taskId
}

function isTaskNavigating(taskId: string) {
  return navigatingTaskId.value === taskId
}

function toggleUserMenu() {
  showUserMenu.value = !showUserMenu.value
}

function goToSettings(section?: string) {
  showUserMenu.value = false
  navigate(section ? `/settings?tab=${section}` : '/settings')
}

function handleLogout() {
  showUserMenu.value = false
  localStorage.removeItem('aipcowork_auth')
  router.replace('/login')
}
</script>

<template>
  <div class="layout">
    <!-- ============ 左侧侧边栏 ============ -->
    <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
      <!-- 品牌区 -->
      <div class="brand-area">
        <div class="brand-logo">
          <img src="/logo.png" alt="AIPCowork" class="logo-img" />
          <span class="brand-name">AIPCowork</span>
        </div>
        <div class="brand-actions">
          <i class="fa-solid fa-clock-rotate-left ico-fa" title="任务历史" @click="goToTaskHistory"></i>
          <i class="fa-solid fa-bars-staggered ico-fa" title="收起侧边栏" @click="toggleSidebar"></i>
        </div>
      </div>

      <!-- 一级导航 -->
      <nav class="nav-primary">
        <div
          v-for="item in navItems"
          :key="item.path"
          class="nav-item"
          :class="{ active: route.path === item.path }"
          @click="navigate(item.path)"
        >
          <i :class="item.icon + ' nav-icon'"></i>
          <span class="nav-label">{{ item.label }}</span>
          <span v-if="item.badge" class="new-badge">{{ item.badge }}</span>
        </div>
      </nav>

      <!-- 分隔线 -->
      <div class="divider"></div>

      <!-- 任务区域 -->
      <div class="task-area">
        <div class="section-header">
          <span class="section-title">任务</span>
          <i class="fa-solid fa-plus ico-fa-sm" @click="navigate('/new-task')"></i>
        </div>
        <div class="task-section">

        <div
          v-for="task in taskList"
          :key="task.id"
          class="task-item standalone"
          :class="{ active: isTaskActive(task.id), navigating: isTaskNavigating(task.id) }"
          @click="navigateToTask(task.id)"
        >
          <!-- 导航中：显示加载旋转 -->
          <i v-if="isTaskNavigating(task.id)" class="fa-solid fa-spinner fa-spin task-status-navigating"></i>
          <i v-else-if="task.status === 'completed'" class="fa-solid fa-check-double task-status-completed"></i>
          <div v-else-if="task.status === 'running'" class="task-status-running"></div>
          <i v-else-if="task.status === 'failed'" class="fa-solid fa-xmark task-status-failed"></i>
          <i v-else class="fa-regular fa-circle task-status-pending"></i>
          <span class="task-name">{{ task.title }}</span>
          <span class="task-time">{{ formatTime(task.elapsedSeconds) }}</span>
        </div>

        <div v-if="taskList.length === 0" class="task-empty">
          暂无任务，点击 + 新建
        </div>
        </div>
      </div>

      <!-- 底部用户信息 -->
      <div class="sidebar-footer">
        <div class="user-card" @click="toggleUserMenu" ref="userMenuRef">
          <div class="user-avatar">
            <span>E</span>
          </div>
          <div class="user-info">
            <span class="user-name">Easton</span>
            <span class="user-desc">Pro plus 方案</span>
          </div>
          <i class="fa-solid fa-ellipsis user-more"></i>
        </div>

        <!-- 用户菜单 -->
        <Transition name="pop">
          <div v-if="showUserMenu" class="user-menu">
            <div class="menu-item" @click="goToSettings('preferences')">
              <i class="fa-solid fa-gear"></i><span>设置</span>
            </div>
            <div class="menu-item" @click="goToSettings('preferences')">
              <i class="fa-solid fa-sliders"></i><span>偏好设置</span>
            </div>
            <div class="menu-item" @click="showDevelopingToast()">
              <i class="fa-solid fa-arrow-up-right-from-square"></i><span>升级计划</span>
            </div>
            <div class="menu-divider"></div>
            <div class="menu-item" @click.stop="toggleHelpPopover()">
              <i class="fa-solid fa-book"></i><span>帮助文档</span>
            </div>
            <div class="menu-item" @click="showDevelopingToast()">
              <i class="fa-solid fa-circle-info"></i><span>关于我们</span>
            </div>
            <div class="menu-divider"></div>
            <div class="menu-item danger" @click="handleLogout">
              <i class="fa-solid fa-arrow-right-from-bracket"></i><span>退出登录</span>
            </div>
          </div>
        </Transition>

        <!-- 帮助文档 Popover -->
        <Transition name="help-pop">
          <div v-if="showHelpPopover" class="help-popover" ref="helpPopoverRef" @click.stop>
            <div class="help-header">
              <img src="/logo.png" alt="" class="help-logo" />
              <div>
                <h3 class="help-title">{{ helpData.title }}</h3>
                <span class="help-version">{{ helpData.version }}</span>
              </div>
            </div>
            <p class="help-desc">{{ helpData.desc }}</p>
            <div class="help-features">
              <div v-for="f in helpData.features" :key="f.label" class="help-feature-item">
                <i :class="f.icon" class="help-feature-icon"></i>
                <div>
                  <span class="help-feature-label">{{ f.label }}</span>
                  <span class="help-feature-desc">{{ f.desc }}</span>
                </div>
              </div>
            </div>
            <div class="help-divider"></div>
            <div class="help-links">
              <a v-for="link in helpData.links" :key="link.url" :href="link.url" target="_blank" class="help-link-item">
                <i :class="link.icon"></i>
                <span>{{ link.label }}</span>
                <i class="fa-solid fa-arrow-up-right-from-square help-link-arrow"></i>
              </a>
            </div>
          </div>
        </Transition>

        <!-- 功能开发中 Toast -->
        <Transition name="toast-pop">
          <div v-if="showDevToast" class="dev-toast">
            <i class="fa-solid fa-hammer"></i>
            <span>功能开发中...</span>
          </div>
        </Transition>
      </div>
    </aside>

    <!-- ============ 右侧主内容区 ============ -->
    <main class="main-content">
      <div
        v-if="sidebarCollapsed"
        class="sidebar-toggle-float"
        title="展开侧边栏"
        @click="toggleSidebar"
      >
        <i class="fa-solid fa-bars"></i>
      </div>
      <!-- 路由级加载遮罩：lazy chunk 下载 / 组件挂载期间提供即时反馈 -->
      <Transition name="route-loading">
        <div v-if="routeLoading" class="route-loading-overlay">
          <div class="route-loading-spinner">
            <i class="fa-solid fa-spinner fa-spin"></i>
          </div>
        </div>
      </Transition>
      <router-view />
    </main>
  </div>
</template>

<style scoped>
@import '@/assets/styles/layout/layout.scss';
</style>
