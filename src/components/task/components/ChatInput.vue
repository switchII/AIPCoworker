<script setup lang="ts">
const chatInput = defineModel<string>('modelValue', { default: '' })

defineProps<{
  canQueue: boolean
  isRunning: boolean
}>()

const emit = defineEmits<{
  (e: 'send'): void
  (e: 'stop'): void
}>()

function handleKeydown(e: KeyboardEvent) {
  // Skip if IME is composing (e.g. Chinese/Japanese input method on Mac)
  if (e.isComposing) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    emit('send')
  }
}
</script>

<template>
  <div class="input-area">
    <div class="input-card">
      <textarea
        v-model="chatInput"
        class="input-textarea"
        placeholder="描述任务，/快捷调用，@添加上下文，标准模式经济高效"
        rows="2"
        @keydown="handleKeydown"
      ></textarea>
      <div class="input-bottom">
        <div class="input-mode">
          <span>标准</span>
          <i class="fa-solid fa-chevron-down"></i>
        </div>
        <div class="input-actions">
          <button
            v-if="isRunning"
            class="input-stop-btn"
            title="停止任务"
            @click="emit('stop')"
          >
            <i class="fa-solid fa-stop"></i>
          </button>
          <button v-if="!isRunning" class="input-send-btn" :class="{ active: chatInput.trim() }" @click="emit('send')">
            <i class="fa-solid fa-truck-fast"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/task/input-area';
</style>
