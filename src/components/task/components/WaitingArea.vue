<script setup lang="ts">
defineProps<{
  pendingFollowUp: string
  showDropdown: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle-dropdown'): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <Transition name="waiting-bubble">
    <div v-if="pendingFollowUp !== ''" class="waiting-area">
      <div class="waiting-bubble">
        <div class="waiting-icon">
          <i class="fa-regular fa-comment-dots"></i>
        </div>
        <div class="waiting-content">
          <span class="waiting-label">等待发送...</span>
          <span class="waiting-text">{{ pendingFollowUp }}</span>
        </div>
        <button class="waiting-arrow" @click.stop="emit('toggle-dropdown')" title="更多操作">
          <i class="fa-solid fa-chevron-down" :class="{ rotated: showDropdown }"></i>
        </button>
      </div>

      <Transition name="drop">
        <div v-if="showDropdown" class="waiting-dropdown">
          <button class="waiting-dropdown-item" @click="emit('cancel')">
            <i class="fa-solid fa-xmark"></i>
            <span>取消等待，恢复到输入框</span>
          </button>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/task/waiting';
</style>
