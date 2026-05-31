<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

defineProps<{
  taskTitle: string
  isRunning: boolean
  elapsedSeconds: number
  helpData: {
    title: string
    desc: string
    features: { icon: string; label: string; desc: string }[]
    links: { label: string; url: string; icon: string }[]
    version: string
  }
}>()

const emit = defineEmits<{
  (e: 'go-back'): void
}>()

const showHelp = ref(false)
const helpRef = ref<HTMLElement | null>(null)

function formatTime(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function toggleHelp() {
  showHelp.value = !showHelp.value
}

function handleHelpClickOutside(e: MouseEvent) {
  if (helpRef.value && !helpRef.value.contains(e.target as Node)) {
    showHelp.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleHelpClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleHelpClickOutside)
})
</script>

<template>
  <header class="top-bar">
    <div class="top-left">
      <button class="back-btn" @click="emit('go-back')">
        <i class="fa-solid fa-arrow-left"></i>
      </button>
      <span class="task-title">{{ taskTitle }}</span>
      <span class="task-timer" :class="{ running: isRunning }">
        <i class="fa-solid fa-clock"></i>
        {{ formatTime(elapsedSeconds) }}
      </span>
    </div>
    <div class="top-right" ref="helpRef">
      <button class="top-icon-btn" title="帮助" @click.stop="toggleHelp">
        <i class="fa-solid fa-circle-question"></i>
      </button>

      <Transition name="help-pop">
        <div v-if="showHelp" class="help-popover" @click.stop>
          <div class="help-header">
            <img src="/logo.png" alt="" class="help-logo" />
            <div>
              <h3 class="help-title">{{ helpData.title }}</h3>
              <span class="help-version">{{ helpData.version }}</span>
            </div>
          </div>
          <p class="help-desc">{{ helpData.desc }}</p>
          <div class="help-features">
            <div v-for="f in helpData.features" :key="f.label" class="help-feature-item">
              <i :class="f.icon" class="help-feature-icon"></i>
              <div>
                <span class="help-feature-label">{{ f.label }}</span>
                <span class="help-feature-desc">{{ f.desc }}</span>
              </div>
            </div>
          </div>
          <div class="help-divider"></div>
          <div class="help-links">
            <a v-for="link in helpData.links" :key="link.url" :href="link.url" target="_blank" class="help-link-item">
              <i :class="link.icon"></i>
              <span>{{ link.label }}</span>
              <i class="fa-solid fa-arrow-up-right-from-square help-link-arrow"></i>
            </a>
          </div>
        </div>
      </Transition>
    </div>
  </header>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/task/task-view';
@use '@/assets/styles/task/help';
</style>
