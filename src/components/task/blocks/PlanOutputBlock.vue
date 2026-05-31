<script setup lang="ts">
import type { ExecutionBlock } from '../../../types/task'
import MarkdownRenderer from '../../../components/MarkdownRenderer.vue'

defineProps<{ block: ExecutionBlock }>()

const emit = defineEmits<{
  (e: 'toggle-block'): void
  (e: 'toggle-output'): void
  (e: 'copy-code', code: string | undefined): void
}>()
</script>

<template>
  <div class="thinking-module plan-output-module" :class="['status-' + block.status]">
    <!-- 头部：可点击展开/折叠 -->
    <div class="thinking-header clickable" @click="emit('toggle-block')">
      <i
        :class="block.status === 'running'
          ? 'fa-solid fa-pen-ruler thinking-icon plan-icon spinning'
          : block.status === 'failed'
            ? 'fa-solid fa-pen-ruler thinking-icon failed'
            : 'fa-solid fa-pen-ruler thinking-icon plan-icon done'"
      ></i>
      <span class="thinking-label">{{ block.text || '执行计划' }}</span>
      <span v-if="block.duration" class="thinking-duration" :class="{ failed: block.status === 'failed' }">
        {{ block.duration }}s
      </span>
      <i class="fa-solid fa-chevron-down expand-arrow" :class="{ open: block.expanded }"></i>
    </div>

    <!-- 展开时显示内容 -->
    <div v-if="block.expanded" class="thinking-body">
      <!-- 思考过程（像深度思考一样直接展示） -->
      <MarkdownRenderer v-if="block.planThinking" class="thinking-text" :content="block.planThinking" theme="light" />

      <!-- 输出内容（step-wrapper 风格，点击展开/折叠） -->
      <div v-if="block.extraText" class="step-wrapper">
        <div class="step-item clickable" @click.stop="emit('toggle-output')">
          <i class="fa-brands fa-optin-monster step-status" data-status="success"></i>
          <code class="step-code" title="输出内容">输出内容</code>
          <i class="fa-solid fa-chevron-down step-expand-arrow" :class="{ open: block.resultExpanded }"></i>
        </div>
        <div v-if="block.resultExpanded" class="step-result-block">
          <div class="step-result-header">
            <span class="step-result-label">JSON 输出</span>
            <div class="step-result-actions">
              <button
                class="step-action-btn"
                title="复制"
                @click.stop="emit('copy-code', block.extraText)"
              >
                <i class="fa-solid fa-copy"></i>
              </button>
            </div>
          </div>
          <pre class="step-result-content"><code>{{ block.extraText }}</code></pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/task/execution-block';
@use '@/assets/styles/task/plan-output';
</style>
