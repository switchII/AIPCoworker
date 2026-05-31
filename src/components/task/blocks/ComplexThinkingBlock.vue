<script setup lang="ts">
import type { ExecutionBlock } from '../../../types/task'
import { useBlockHelpers } from '../composables/useBlockHelpers'
import { useCodeActions } from '../composables/useCodeActions'
import MarkdownRenderer from '../../../components/MarkdownRenderer.vue'

defineProps<{ block: ExecutionBlock }>()

const emit = defineEmits<{
  (e: 'toggle-block'): void
  (e: 'toggle-step-result', step: any): void
  (e: 'toggle-search-result-content', result: any): void
  (e: 'copy-code', code: string | undefined): void
  (e: 'download-code', code: string | undefined, fileName: string): void
  (e: 'open-code-popup', code: string | undefined, language: string, fileName: string): void
  (e: 'open-code-popup-preview', code: string | undefined, language: string, fileName: string): void
}>()

const { getStatusIconClass, getComplexStepIcon, getComplexStepLabel } = useBlockHelpers()
const { getFileNameFromStep, isHtmlContent } = useCodeActions()
</script>

<template>
  <div class="thinking-module complex-module" :class="['status-' + block.status]">
    <div class="thinking-header clickable" @click="emit('toggle-block')">
      <i :class="block.status === 'running' ? 'fa-solid fa-rotate thinking-icon spinning' : block.status === 'failed' ? 'fa-solid fa-xmark thinking-icon failed' : 'fa-solid fa-feather thinking-icon complex-icon'"></i>
      <span class="thinking-label">复合思考</span>
      <span v-if="block.duration" class="thinking-duration" :class="{ failed: block.status === 'failed' }">{{ block.duration }}s</span>
      <i class="fa-solid fa-chevron-down expand-arrow" :class="{ open: block.expanded }"></i>
    </div>
    <div v-if="block.expanded" class="thinking-body">
      <MarkdownRenderer class="thinking-text" :content="block.text || ''" theme="light" />
      <div class="complex-steps">
        <div
          v-for="(step, idx) in block.steps"
          :key="step.id"
          class="complex-step-item"
          :class="['status-' + step.status]"
        >
          <span class="complex-step-index">{{ idx + 1 }}</span>
          <div class="complex-step-main">
            <div class="complex-step-head" @click="emit('toggle-step-result', step)" style="cursor:pointer;">
              <i :class="getComplexStepIcon(step.type)" class="complex-step-type-icon" :data-status="step.status"></i>
              <span class="complex-step-type">{{ getComplexStepLabel(step.type) }}</span>
              <span v-if="step.target" class="complex-step-target">{{ step.target }}</span>
              <i :class="getStatusIconClass(step.status)" class="status-icon" :data-status="step.status"></i>
              <i class="fa-solid fa-chevron-down step-expand-arrow" :class="{ open: step.resultExpanded }"></i>
            </div>
            <span v-if="step.detail" class="complex-step-detail">{{ step.detail }}</span>
            <!-- 展开的结果区域 -->
            <div v-if="step.resultExpanded" class="step-result-block" style="margin-top:8px;">
              <!-- 网页搜索步骤的特殊展示 -->
              <template v-if="step.type === 'web_search' && step.searchResults && step.searchResults.length > 0">
                <div class="step-result-header">
                  <span class="step-result-label">搜索结果 ({{ step.searchResults.length }})</span>
                </div>
                <div class="search-results-list" style="border-left: 3px solid #6366F1;">
                  <div
                    v-for="sr in step.searchResults"
                    :key="sr.url"
                    class="step-search-item"
                    :class="{ expanded: sr.contentExpanded }"
                  >
                    <div class="step-search-summary" @click.stop="emit('toggle-search-result-content', sr)">
                      <span class="search-result-index">{{ sr.icon }}</span>
                      <div class="search-result-info">
                        <span class="result-title">{{ sr.title }}</span>
                        <span class="result-url">{{ sr.url }}</span>
                        <span class="search-result-brief">{{ sr.summary }}</span>
                      </div>
                      <i class="fa-solid fa-chevron-down search-expand-arrow" :class="{ open: sr.contentExpanded }"></i>
                    </div>
                    <div v-if="sr.contentExpanded" class="search-result-content">
                        <MarkdownRenderer class="step-result-content" :content="sr.content || ''" theme="dark" />
                    </div>
                  </div>
                </div>
              </template>
              <!-- 通用结果展示 -->
              <template v-else>
                <div class="step-result-header">
                  <span class="step-result-label">{{ step.status === 'failed' ? '错误信息' : '输出结果' }}</span>
                  <div class="step-result-actions">
                    <button class="step-action-btn" title="复制" @click.stop="emit('copy-code', step.result)"><i class="fa-solid fa-copy"></i></button>
                    <button class="step-action-btn" title="下载" @click.stop="emit('download-code', step.result, getFileNameFromStep(step))"><i class="fa-solid fa-download"></i></button>
                    <button class="step-action-btn" title="弹窗查看" @click.stop="emit('open-code-popup', step.result, 'text', step.target || step.label)"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></button>
                    <button v-if="isHtmlContent(step.result)" class="step-action-btn preview-btn" title="预览" @click.stop="emit('open-code-popup-preview', step.result, 'html', step.target || step.label)"><i class="fa-solid fa-eye"></i></button>
                  </div>
                </div>
                <MarkdownRenderer class="step-result-content" :class="{ 'is-error': step.status === 'failed' }" :content="step.result || ''" theme="dark" />
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/task/execution-block';
</style>
