<script setup lang="ts">
import type { ExecutionBlock } from '../../../types/task'
import { useBlockHelpers } from '../composables/useBlockHelpers'

defineProps<{ block: ExecutionBlock }>()

const emit = defineEmits<{
  (e: 'toggle-block'): void
}>()

const { getStatusIconClass } = useBlockHelpers()
</script>

<template>
  <div class="thinking-module file-module" :class="['status-' + block.status]">
    <div class="thinking-header clickable" @click="emit('toggle-block')">
      <i class="fa-solid fa-folder-open thinking-icon file-icon"></i>
      <span class="thinking-label">查询文件</span>
      <i :class="getStatusIconClass(block.status)" class="status-icon" :data-status="block.status"></i>
      <i class="fa-solid fa-chevron-down expand-arrow" :class="{ open: block.expanded }"></i>
    </div>
    <div v-if="block.expanded" class="file-list-block">
      <div v-for="file in (block.results || [])" :key="file.title || file.url" class="file-list-item">
        <i class="fa-solid fa-file-code file-item-icon"></i>
        <span class="file-item-name">{{ file.title || file.url }}</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/task/execution-block';
</style>
