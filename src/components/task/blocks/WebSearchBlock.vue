<script setup lang="ts">
import type { ExecutionBlock } from '../../../types/task'
import { useBlockHelpers } from '../composables/useBlockHelpers'
import { useCodeActions } from '../composables/useCodeActions'

defineProps<{ block: ExecutionBlock }>()

const emit = defineEmits<{
  (e: 'toggle-block'): void
  (e: 'toggle-search-result-content', result: any): void
  (e: 'copy-code', code: string | undefined): void
  (e: 'download-code', code: string | undefined, fileName: string): void
  (e: 'open-code-popup', code: string | undefined, language: string, fileName: string): void
  (e: 'open-code-popup-preview', code: string | undefined, language: string, fileName: string): void
}>()

const { getStatusIconClass } = useBlockHelpers()
const { isHtmlContent } = useCodeActions()
</script>

<template>
  <div class="thinking-module search-module" :class="['status-' + block.status]">
    <div class="thinking-header clickable" @click="emit('toggle-block')">
      <i class="fa-solid fa-globe thinking-icon search-icon"></i>
      <span class="thinking-label">网页搜索</span>
      <span class="search-query">"{{ block.query }}"</span>
      <i :class="getStatusIconClass(block.status)" class="status-icon" :data-status="block.status"></i>
      <i class="fa-solid fa-chevron-down expand-arrow" :class="{ open: block.expanded }"></i>
    </div>
    <div v-if="block.expanded" class="search-results">
      <div v-for="result in (block.results || [])" :key="result.url" class="search-result-wrapper">
        <div class="search-result-item clickable" @click="emit('toggle-search-result-content', result)">
          <span class="result-icon">{{ result.icon || '🌐' }}</span>
          <div class="result-content">
            <span class="result-title">{{ result.title }}</span>
            <span class="result-url">{{ result.url }}</span>
          </div>
          <i :class="getStatusIconClass(result.status)" class="step-status" :data-status="result.status"></i>
          <i class="fa-solid fa-chevron-down step-expand-arrow" :class="{ open: result.contentExpanded }"></i>
        </div>
        <div v-if="result.contentExpanded" class="step-result-block">
          <div class="step-result-header">
            <span class="step-result-label">页面内容</span>
            <span class="result-url-mini">{{ result.url }}</span>
            <div class="step-result-actions">
              <button class="step-action-btn" title="复制" @click.stop="emit('copy-code', result.content)"><i class="fa-solid fa-copy"></i></button>
              <button class="step-action-btn" title="下载" @click.stop="emit('download-code', result.content, (result.title || 'result') + '.txt')"><i class="fa-solid fa-download"></i></button>
              <button class="step-action-btn" title="弹窗查看" @click.stop="emit('open-code-popup', result.content, 'text', result.title || '')"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></button>
              <button v-if="isHtmlContent(result.content)" class="step-action-btn preview-btn" title="预览" @click.stop="emit('open-code-popup-preview', result.content, 'html', result.title || '')"><i class="fa-solid fa-eye"></i></button>
            </div>
          </div>
          <pre class="step-result-content"><code>{{ result.content }}</code></pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/task/execution-block';
</style>
