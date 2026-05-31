<script setup lang="ts">
import type { ExecutionBlock } from '../../../types/task'
import { useBlockHelpers } from '../composables/useBlockHelpers'
import { useFileUtils } from '../composables/useFileUtils'

defineProps<{ block: ExecutionBlock }>()

const emit = defineEmits<{
  (e: 'toggle-block'): void
  (e: 'open-preview', file: { name: string; type: string; content: string; filePath?: string }): void
  (e: 'download-file', file: { name: string; type: string; content: string; filePath?: string }): void
  (e: 'copy-file', file: { name: string; type: string; content: string; filePath?: string }): void
  (e: 'copy-file-path', file: { name: string; type: string; content: string; filePath?: string }): void
  (e: 'open-in-browser', file: { name: string; type: string; content: string; filePath?: string }): void
}>()

const { getStatusIconClass } = useBlockHelpers()
const { getFileTypeLabel, getGenFileIcon, getGenFileColor } = useFileUtils()

function getFileSize(content: string): string {
  if (!content) return '0 B'
  const bytes = new Blob([content]).size
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div class="thinking-module gen-module" :class="['status-' + block.status]">
    <div class="thinking-header clickable" @click="emit('toggle-block')">
      <i class="fa-solid fa-file-export thinking-icon gen-icon"></i>
      <span class="thinking-label">{{ block.text || '生成文件' }}</span>
      <span v-if="block.genFiles?.length" class="gen-count">{{ block.genFiles.length }} 个文件</span>
      <i :class="getStatusIconClass(block.status)" class="status-icon" :data-status="block.status"></i>
      <i class="fa-solid fa-chevron-down expand-arrow" :class="{ open: block.expanded }"></i>
    </div>
    <div v-if="block.expanded && block.genFiles?.length" class="gen-files-grid">
      <div
        v-for="file in block.genFiles"
        :key="file.name"
        class="gen-file-card"
        @click.stop="emit('open-preview', file)"
      >
        <div class="gen-file-icon">
          <i :class="getGenFileIcon(file.type)" :style="{ color: getGenFileColor(file.type) }"></i>
        </div>
        <div class="gen-file-info">
          <span class="gen-file-name">{{ file.name }}</span>
          <span class="gen-file-meta">
            <span class="gen-file-type">{{ getFileTypeLabel(file.type) }}</span>
            <span class="gen-file-size">{{ getFileSize(file.content) }}</span>
            <span v-if="file.filePath" class="gen-file-path" :title="file.filePath">{{ file.filePath }}</span>
          </span>
        </div>
        <div class="gen-file-actions" @click.stop>
          <button v-if="file.type === 'html' && file.filePath" class="gen-action-btn" title="在浏览器中打开" @click="emit('open-in-browser', file)">
            <i class="fa-solid fa-arrow-up-right-from-square"></i>
          </button>
          <button v-if="file.filePath" class="gen-action-btn" title="复制文件路径" @click="emit('copy-file-path', file)">
            <i class="fa-solid fa-location-dot"></i>
          </button>
          <button class="gen-action-btn" title="下载" @click="emit('download-file', file)">
            <i class="fa-solid fa-download"></i>
          </button>
          <button class="gen-action-btn" title="复制内容" @click="emit('copy-file', file)">
            <i class="fa-solid fa-copy"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/task/execution-block';
</style>
