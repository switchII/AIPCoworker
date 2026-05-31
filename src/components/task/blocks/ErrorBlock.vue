<script setup lang="ts">
import type { ExecutionBlock } from '../../../types/task'

defineProps<{
  block: ExecutionBlock
}>()
</script>

<template>
  <div class="error-block">
    <div class="error-header">
      <i class="fa-solid fa-circle-exclamation error-icon"></i>
      <span class="error-title">{{ block.text || '任务执行异常' }}</span>
    </div>
    <div v-if="block.errorMessage" class="error-body">
      <pre class="error-message">{{ block.errorMessage }}</pre>
    </div>
    <div v-if="block.extraText" class="error-detail">
      <pre class="error-detail-text">{{ block.extraText }}</pre>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.error-block {
  margin: 12px 0;
  border: 1px solid rgba(220, 53, 69, 0.3);
  border-radius: 8px;
  background: rgba(220, 53, 69, 0.06);
  overflow: hidden;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(220, 53, 69, 0.1);
  border-bottom: 1px solid rgba(220, 53, 69, 0.15);
}

.error-icon {
  color: #dc3545;
  font-size: 16px;
}

.error-title {
  font-size: 13px;
  font-weight: 600;
  color: #dc3545;
}

.error-body {
  padding: 10px 14px;
}

.error-message {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #c0392b;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.error-detail {
  padding: 8px 14px;
  border-top: 1px solid rgba(220, 53, 69, 0.1);
  background: rgba(0, 0, 0, 0.02);
}

.error-detail-text {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: #888;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'SF Mono', 'Fira Code', monospace;
}
</style>
