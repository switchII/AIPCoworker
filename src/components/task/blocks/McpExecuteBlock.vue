<script setup lang="ts">
import type { ExecutionBlock } from '../../../types/task'
import { useBlockHelpers } from '../composables/useBlockHelpers'

defineProps<{ block: ExecutionBlock }>()

const emit = defineEmits<{
  (e: 'toggle-block'): void
  (e: 'toggle-mcp-result'): void
  (e: 'copy-code', code: string | undefined): void
  (e: 'download-code', code: string | undefined, fileName: string): void
  (e: 'open-code-popup', code: string | undefined, language: string, fileName: string): void
}>()

const { getStatusIconClass, isMcpLargeResult } = useBlockHelpers()
</script>

<template>
  <div class="thinking-module mcp-module" :class="['status-' + block.status]">
    <div class="thinking-header clickable" @click="emit('toggle-block')">
      <i class="fa-solid fa-plug thinking-icon mcp-icon"></i>
      <span class="thinking-label">执行方法 (MCP)</span>
      <i :class="getStatusIconClass(block.status)" class="status-icon" :data-status="block.status"></i>
      <i class="fa-solid fa-chevron-down expand-arrow" :class="{ open: block.expanded }"></i>
    </div>
    <div v-if="block.expanded" class="mcp-content">
      <div v-if="block.method" class="mcp-method">
        <span class="mcp-label">方法:</span>
        <code>{{ block.method }}</code>
      </div>
      <div v-if="block.params" class="mcp-params">
        <span class="mcp-label">参数:</span>
        <code>{{ block.params }}</code>
      </div>
      <!-- 短结果：内联显示 -->
      <div v-if="!isMcpLargeResult(block.result)" class="mcp-result">
        <span class="mcp-label">{{ block.status === 'failed' ? '错误:' : '结果:' }}</span>
        <code :class="block.status === 'failed' ? 'mcp-result-error' : 'mcp-result-value'">{{ block.result }}</code>
      </div>
      <!-- 长结果：可展开代码块 -->
      <div v-else class="mcp-result-large">
        <div class="mcp-result-toggle clickable" @click="emit('toggle-mcp-result')">
          <span class="mcp-label">{{ block.status === 'failed' ? '错误:' : '结果:' }}</span>
          <span class="mcp-result-summary" :class="{ error: block.status === 'failed' }">{{ block.status === 'failed' ? (block.result ? block.result.split('\n')[0] : '') : '返回 ' + (block.result ? block.result.split('\n').length : 0) + ' 行内容' }}</span>
          <i class="fa-solid fa-chevron-down step-expand-arrow" :class="{ open: block.resultExpanded }"></i>
        </div>
        <div v-if="block.resultExpanded" class="step-result-block">
          <div class="step-result-header">
            <span class="step-result-label">{{ block.status === 'failed' ? '错误详情' : '输出结果' }}</span>
            <div class="step-result-actions">
              <button class="step-action-btn" title="复制" @click.stop="emit('copy-code', block.result)"><i class="fa-solid fa-copy"></i></button>
              <button v-if="block.status !== 'failed'" class="step-action-btn" title="下载" @click.stop="emit('download-code', block.result, (block.method || 'mcp') + '_result.txt')"><i class="fa-solid fa-download"></i></button>
              <button class="step-action-btn" title="弹窗查看" @click.stop="emit('open-code-popup', block.result, 'text', (block.method || 'mcp') + (block.status === 'failed' ? ' - Error' : ''))"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></button>
            </div>
          </div>
          <pre class="step-result-content" :class="{ 'is-error': block.status === 'failed' }"><code>{{ block.result }}</code></pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/task/execution-block';
</style>
