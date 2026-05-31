<script setup lang="ts">
import type { ExecutionBlock } from '../../../types/task'
import { useBlockHelpers } from '../composables/useBlockHelpers'
import { useCodeActions } from '../composables/useCodeActions'
import MarkdownRenderer from '../../../components/MarkdownRenderer.vue'

defineProps<{ block: ExecutionBlock }>()

const emit = defineEmits<{
  (e: 'toggle-block'): void
  (e: 'toggle-step-result', step: any): void
  (e: 'copy-code', code: string | undefined): void
  (e: 'download-code', code: string | undefined, fileName: string): void
  (e: 'open-code-popup', code: string | undefined, language: string, fileName: string): void
  (e: 'open-code-popup-preview', code: string | undefined, language: string, fileName: string): void
}>()

const { getStepIcon } = useBlockHelpers()
const { getFileNameFromStep, isHtmlContent } = useCodeActions()
</script>

<template>
  <div class="thinking-module" :class="['status-' + block.status]">
    <div class="thinking-header clickable" @click="emit('toggle-block')">
      <i :class="block.status === 'running' ? 'fa-solid fa-rotate thinking-icon spinning' : block.status === 'failed' ? 'fa-brands fa-edge thinking-icon failed' : 'fa-brands fa-edge thinking-icon done'"></i>
      <span class="thinking-label">深度思考</span>
      <span v-if="block.duration" class="thinking-duration" :class="{ failed: block.status === 'failed' }">{{ block.duration }}s</span>
      <i class="fa-solid fa-chevron-down expand-arrow" :class="{ open: block.expanded }"></i>
    </div>
    <div v-if="block.expanded" class="thinking-body">
      <MarkdownRenderer v-if="block.text" class="thinking-text" :content="block.text" theme="light" />
      <ol v-if="block.list && block.list.length > 0" class="thinking-list">
        <li v-for="item in block.list" :key="item.name">
          <code class="inline-code">{{ item.name }}</code> - {{ item.desc }}
          <ul v-if="item.children && item.children.length > 0" class="thinking-sublist">
            <li v-for="child in item.children" :key="child">{{ child }}</li>
          </ul>
        </li>
      </ol>
      <MarkdownRenderer v-if="block.extraText" class="thinking-extra" :content="block.extraText" theme="light" />
      <div class="steps-list">
        <div v-for="step in block.steps" :key="step.id" class="step-wrapper">
          <div class="step-item clickable" @click="emit('toggle-step-result', step)">
            <i :class="getStepIcon(step)" class="step-status" :data-status="step.status"></i>
            <code class="step-code" :title="step.label">
              {{ step.label }}
            </code>
            <i class="fa-solid fa-chevron-down step-expand-arrow" :class="{ open: step.resultExpanded }"></i>
          </div>
          <div v-if="step.resultExpanded" class="step-result-block">
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
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/task/execution-block';
</style>
