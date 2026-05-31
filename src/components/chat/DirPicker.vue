<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { DEFAULT_WORKSPACE_DIR } from '../../utils/workspace'

const HISTORY_KEY = 'aipcowork_work_dir_history'
const MAX_HISTORY = 10

const emit = defineEmits<{
  'select-dir': [dir: string]
}>()

const props = defineProps<{
  workDir: string
}>()

const showDropdown = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

// 从 localStorage 加载真实历史目录，无示例数据
const historyDirs = ref<string[]>(loadHistory())

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : []
    }
  } catch { /* ignore */ }
  return []
}

function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(historyDirs.value))
}

async function selectWorkDir() {
  showDropdown.value = false
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const dir = await open({ directory: true, multiple: false, title: '选择工作目录' })
    if (dir && typeof dir === 'string') {
      addToHistory(dir)
      emit('select-dir', dir)
    }
  } catch {
    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
      if (dirHandle) {
        addToHistory(dirHandle.name)
        emit('select-dir', dirHandle.name)
      }
    } catch {
      // user cancelled
    }
  }
}

function pickHistoryDir(dir: string) {
  showDropdown.value = false
  // 选中历史目录也移到最前面
  addToHistory(dir)
  emit('select-dir', dir)
}

function pickDefaultWorkspace() {
  showDropdown.value = false
  emit('select-dir', DEFAULT_WORKSPACE_DIR)
}

function addToHistory(dir: string) {
  // 去重后放到最前面，超过上限截断
  const idx = historyDirs.value.indexOf(dir)
  if (idx !== -1) historyDirs.value.splice(idx, 1)
  historyDirs.value.unshift(dir)
  if (historyDirs.value.length > MAX_HISTORY) historyDirs.value.length = MAX_HISTORY
  saveHistory()
}

function toggleDropdown() {
  showDropdown.value = !showDropdown.value
}

function handleClickOutside(e: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    showDropdown.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))

const displayName = computed(() => {
  if (!props.workDir) return ''
  // 默认工作空间显示友好名称
  if (props.workDir === DEFAULT_WORKSPACE_DIR) return 'AipWorkspace'
  // 同时支持 / 和 \ 路径分隔符
  const parts = props.workDir.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || props.workDir
})
</script>

<template>
  <div class="dp-wrapper" ref="dropdownRef">
    <button class="dp-chip" @click.stop="toggleDropdown">
      <i class="fa-solid fa-folder-open dp-icon"></i>
      <span v-if="workDir" class="dp-path">{{ displayName }}</span>
      <span v-else class="dp-placeholder" :title="'默认: ' + DEFAULT_WORKSPACE_DIR">选择工作目录</span>
      <i class="fa-solid fa-chevron-down dp-chevron" :class="{ rotated: showDropdown }"></i>
    </button>

    <Transition name="drop">
      <div v-if="showDropdown" class="dp-menu" @click.stop>
        <div class="dp-menu-label">工作目录</div>
        <button class="dp-menu-item" @click="selectWorkDir">
          <i class="fa-solid fa-folder-plus dp-item-icon"></i>
          <span>选择系统文件夹</span>
          <i class="fa-solid fa-chevron-right dp-item-arrow"></i>
        </button>
        <button class="dp-menu-item dp-default-item" @click="pickDefaultWorkspace">
          <i class="fa-solid fa-house dp-item-icon dp-default-icon"></i>
          <span class="dp-default-label">默认工作空间</span>
          <span class="dp-default-path">{{ DEFAULT_WORKSPACE_DIR }}</span>
        </button>
        <template v-if="historyDirs.length > 0">
          <div class="dp-divider"></div>
          <div class="dp-menu-label">历史工作目录</div>
          <button
            v-for="dir in historyDirs"
            :key="dir"
            class="dp-menu-item dp-history-item"
            @click="pickHistoryDir(dir)"
          >
            <i class="fa-solid fa-clock-rotate-left dp-item-icon dp-history-icon"></i>
            <span class="dp-history-path" :title="dir">{{ dir }}</span>
          </button>
        </template>
        <template v-else>
          <div class="dp-divider"></div>
          <div class="dp-empty-hint">暂无历史工作目录，请先选择</div>
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.dp-wrapper { position: relative; }

.dp-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 10px; background: #F7F7F7;
  border: 1px solid #EAEAEA; border-radius: 8px;
  cursor: pointer; font-size: 12px; font-family: inherit;
  transition: background 0.15s, border-color 0.15s;
  user-select: none; max-width: 180px;
}
.dp-chip:hover { background: #EFEFEF; border-color: #D5D5D5; }
.dp-icon { font-size: 13px; color: #555; flex-shrink: 0; }
.dp-path {
  color: #1A1A1A; font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 90px;
}
.dp-placeholder { color: #999; }
.dp-chevron {
  font-size: 9px; color: #999; flex-shrink: 0;
  transition: transform 0.2s;
}
.dp-chevron.rotated { transform: rotate(180deg); }

.dp-menu {
  position: absolute; bottom: calc(100% + 6px); left: 0;
  min-width: 280px; max-width: 420px;
  background: #FFF; border: 1px solid #EAEAEA;
  border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  z-index: 100; padding: 6px 0; overflow: hidden;
}
.dp-menu-label {
  padding: 6px 14px; font-size: 11px; color: #999;
  font-weight: 500; letter-spacing: 0.3px;
}
.dp-menu-item {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 10px 14px;
  border: none; background: transparent;
  font-size: 14px; color: #1A1A1A; cursor: pointer;
  transition: background 0.12s;
  font-family: inherit; text-align: left;
}
.dp-menu-item:hover { background: #F5F5F5; }
.dp-item-icon { font-size: 15px; color: #555; flex-shrink: 0; width: 18px; text-align: center; }
.dp-item-arrow { font-size: 11px; color: #BBB; margin-left: auto; }
.dp-default-item {
  flex-wrap: wrap;
}
.dp-default-icon { color: #F59E0B; }
.dp-default-label { font-weight: 500; color: #1A1A1A; }
.dp-default-path {
  width: 100%;
  padding-left: 28px;
  font-size: 11px;
  color: #999;
  font-family: 'SF Mono', Consolas, monospace;
}
.dp-history-icon { font-size: 13px; color: #999; }
.dp-history-path { color: #555; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.dp-divider { height: 1px; background: #EEE; margin: 4px 0; }
.dp-empty-hint { padding: 8px 14px 10px; font-size: 12px; color: #BBB; }

.drop-enter-active { transition: opacity 0.15s, transform 0.15s; }
.drop-leave-active { transition: opacity 0.1s, transform 0.1s; }
.drop-enter-from { opacity: 0; transform: translateY(4px); }
.drop-leave-to   { opacity: 0; transform: translateY(4px); }
</style>
