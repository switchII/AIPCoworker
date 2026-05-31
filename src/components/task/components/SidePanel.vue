<script setup lang="ts">
import { useFileUtils } from '../composables/useFileUtils'
import type { PlanItemStatus } from '../../../types/task'

/** Task configuration info (workDir, skills, suites, MCP servers, connectors) */
export interface TaskConfigInfo {
  workDir: string
  skills: string[]
  suites: string[]
  mcpServers: string[]
  connectors: string[]
}

/** Todo item for display */
export interface TodoItem {
  text: string
  done: boolean
  status?: PlanItemStatus
}

defineProps<{
  todoItems: TodoItem[]
  genFiles: { name: string; type: string; content: string; filePath?: string }[]
  taskConfig: TaskConfigInfo
  panelExpanded: Record<string, boolean>
  sidePanelCollapsed: boolean
  showPreview: boolean
  contextTokenCount: number
}>()

const emit = defineEmits<{
  (e: 'toggle-panel', panel: string): void
  (e: 'toggle-side-panel'): void
  (e: 'open-preview', file: { name: string; type: string; content: string; filePath?: string }): void
}>()

const { getGenFileIcon, getGenFileColor } = useFileUtils()

async function openWorkDir(dir: string) {
  if (!dir) {
    console.warn('[SidePanel] openWorkDir: workDir is empty')
    return
  }
  console.log('[SidePanel] openWorkDir: opening', dir)
  try {
    const { openPath } = await import('@tauri-apps/plugin-opener')
    await openPath(dir)
    console.log('[SidePanel] openWorkDir: success')
  } catch (err) {
    console.error('[SidePanel] openWorkDir failed:', err)
    // 回退：尝试使用 shell 命令打开目录
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      // Windows: explorer, macOS: open, Linux: xdg-open
      await invoke('shell_open', { path: dir })
      console.log('[SidePanel] openWorkDir: fallback success')
    } catch (fallbackErr) {
      console.error('[SidePanel] openWorkDir fallback also failed:', fallbackErr)
    }
  }
}

function shortDir(dir: string): string {
  if (!dir) return '(未设置)'
  return dir.replace(/^.*[/\\]/, '') || dir
}
</script>

<template>
  <!-- 右侧展开按钮（收起时显示） -->
  <div
    v-if="sidePanelCollapsed && !showPreview"
    class="side-panel-expand-btn"
    title="展开任务面板"
    @click="emit('toggle-side-panel')"
  >
    <i class="fa-solid fa-angles-left"></i>
  </div>

  <!-- 右侧任务监控区 -->
  <div class="side-panel" v-show="!showPreview && !sidePanelCollapsed">
    <div class="side-panel-header">
      <span class="side-panel-title">任务面板</span>
      <button class="side-panel-close" title="收起" @click="emit('toggle-side-panel')">
        <i class="fa-solid fa-angles-right"></i>
      </button>
    </div>
    <!-- 待办面板 -->
    <div class="panel-section">
      <div class="panel-header" @click="emit('toggle-panel', 'todo')">
        <span class="panel-title">待办</span>
        <span v-if="todoItems.length > 0" class="todo-count">
          {{ todoItems.filter(i => i.done).length }}/{{ todoItems.length }}
        </span>
        <i class="fa-solid fa-chevron-down panel-arrow" :class="{ collapsed: !panelExpanded.todo }"></i>
      </div>
      <div v-if="panelExpanded.todo" class="panel-content">
        <template v-if="todoItems.length > 0">
          <div v-for="(item, idx) in todoItems" :key="idx" class="todo-item" :class="'todo-' + (item.status || 'pending')">
            <!-- 状态图标 -->
            <i v-if="item.status === 'completed' || item.done" class="fa-solid fa-check-double todo-icon todo-done"></i>
            <i v-else-if="item.status === 'in_progress'" class="fa-solid fa-spinner fa-pulse todo-icon todo-progress"></i>
            <i v-else-if="item.status === 'failed'" class="fa-solid fa-xmark todo-icon todo-failed"></i>
            <i v-else class="fa-regular fa-circle todo-icon todo-pending"></i>
            <span class="todo-text" :class="{ 'todo-text-done': item.done || item.status === 'completed' }">{{ item.text }}</span>
          </div>
        </template>
        <div v-else class="todo-empty">
          <i class="fa-regular fa-clipboard todo-empty-icon"></i>
          <span>暂无待办事项</span>
        </div>
      </div>
    </div>

    <!-- 产物面板 -->
    <div class="panel-section">
      <div class="panel-header" @click="emit('toggle-panel', 'artifacts')">
        <span class="panel-title">产物</span>
        <i class="fa-solid fa-chevron-down panel-arrow" :class="{ collapsed: !panelExpanded.artifacts }"></i>
      </div>
      <div v-if="panelExpanded.artifacts" class="panel-content">
        <template v-if="genFiles.length > 0">
          <div
            v-for="file in genFiles"
            :key="file.name"
            class="artifact-item"
            @click="emit('open-preview', file)"
          >
            <i :class="getGenFileIcon(file.type)" :style="{ color: getGenFileColor(file.type) }"></i>
            <span class="artifact-name">{{ file.name }}</span>
          </div>
        </template>
        <div v-else class="artifact-empty">
          <i class="fa-solid fa-inbox artifact-empty-icon"></i>
          <span>暂无生成的文件</span>
        </div>
      </div>
    </div>

    <!-- 技能与MCP面板 -->
    <div class="panel-section">
      <div class="panel-header" @click="emit('toggle-panel', 'skills')">
        <span class="panel-title">技能与MCP</span>
        <i class="fa-solid fa-chevron-down panel-arrow" :class="{ collapsed: !panelExpanded.skills }"></i>
      </div>
      <div v-if="panelExpanded.skills" class="panel-content">
        <div class="config-info-row">
          <span class="config-info-label">工作目录:</span>
          <span class="config-info-value" :title="taskConfig.workDir">{{ shortDir(taskConfig.workDir) }}</span>
          <button
            v-if="taskConfig.workDir"
            class="config-open-dir-btn"
            title="在文件管理器中打开"
            @click.stop="openWorkDir(taskConfig.workDir)"
          >
            <i class="fa-solid fa-folder-open"></i>
          </button>
        </div>
        <div class="config-info-row">
          <span class="config-info-label">Skills:</span>
          <span class="config-info-value">
            <template v-if="taskConfig.skills.length > 0">
              <span v-for="(s, i) in taskConfig.skills" :key="s" class="config-tag">{{ s }}<template v-if="i < taskConfig.skills.length - 1">, </template></span>
            </template>
            <span v-else class="config-empty">(无)</span>
          </span>
        </div>
        <div class="config-info-row">
          <span class="config-info-label">套件:</span>
          <span class="config-info-value">
            <template v-if="taskConfig.suites.length > 0">
              <span v-for="(s, i) in taskConfig.suites" :key="s" class="config-tag">{{ s }}<template v-if="i < taskConfig.suites.length - 1">, </template></span>
            </template>
            <span v-else class="config-empty">(无)</span>
          </span>
        </div>
        <div class="config-info-row">
          <span class="config-info-label">MCP 服务器:</span>
          <span class="config-info-value">
            <template v-if="taskConfig.mcpServers.length > 0">
              <span v-for="(s, i) in taskConfig.mcpServers" :key="s" class="config-tag">{{ s }}<template v-if="i < taskConfig.mcpServers.length - 1">, </template></span>
            </template>
            <span v-else class="config-empty">(无)</span>
          </span>
        </div>
        <div class="config-info-row">
          <span class="config-info-label">连接器:</span>
          <span class="config-info-value">
            <template v-if="taskConfig.connectors.length > 0">
              <span v-for="(s, i) in taskConfig.connectors" :key="s" class="config-tag">{{ s }}<template v-if="i < taskConfig.connectors.length - 1">, </template></span>
            </template>
            <span v-else class="config-empty">(无)</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 上下文窗口面板 -->
    <div class="panel-section">
      <div class="panel-header" @click="emit('toggle-panel', 'context')">
        <span class="panel-title">上下文窗口</span>
        <i class="fa-solid fa-chevron-down panel-arrow" :class="{ collapsed: !panelExpanded.context }"></i>
      </div>
      <div v-if="panelExpanded.context" class="panel-content">
        <div class="context-token-count">
          <i class="fa-solid fa-cube context-token-icon"></i>
          <span class="context-token-label">当前上下文:</span>
          <span class="context-token-value">{{ contextTokenCount.toLocaleString() }} tokens</span>
        </div>
        <div class="context-bar-wrapper">
          <div class="context-bar">
            <div class="context-bar-fill" :style="{ width: Math.min(contextTokenCount / 128000 * 100, 100) + '%' }"></div>
          </div>
          <div class="context-labels">
            <span>0</span>
            <span>128K</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/task/side-panel';
</style>
