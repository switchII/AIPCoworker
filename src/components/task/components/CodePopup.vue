<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useHtmlSandbox } from '../composables/useHtmlSandbox'

const props = defineProps<{
  visible: boolean
  data: { code: string; language: string; fileName: string; isHtml: boolean }
  previewMode: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'toggle-preview'): void
  (e: 'copy', code: string): void
  (e: 'download', code: string, fileName: string): void
}>()

const { finalizeHtml, cleanup } = useHtmlSandbox()

// HTML preview container ref
const htmlPreviewRef = ref<HTMLElement | null>(null)

// Render HTML when preview mode is active or data changes
watch(
  () => [props.visible, props.previewMode, props.data.code, props.data.isHtml] as const,
  ([visible, previewMode, code, isHtml]) => {
    if (visible && previewMode && isHtml && code) {
      nextTick(() => {
        if (htmlPreviewRef.value) {
          try {
            finalizeHtml(code, htmlPreviewRef.value, {
              initialHeight: 500,
            })
          } catch (e) {
            console.error('[CodePopup] HTML render failed:', e)
          }
        }
      })
    }
  },
  { immediate: true }
)

// Cleanup when closing preview or unmounting
watch(() => props.visible, (newVal) => {
  if (!newVal && htmlPreviewRef.value) {
    cleanup(htmlPreviewRef.value)
  }
})

onBeforeUnmount(() => {
  if (htmlPreviewRef.value) {
    cleanup(htmlPreviewRef.value)
  }
})
</script>

<template>
  <Transition name="code-modal">
    <div v-if="visible" class="code-modal-overlay" @click.self="emit('close')">
      <div class="code-modal">
        <div class="code-modal-header">
          <div class="code-modal-title-area">
            <i class="fa-solid fa-code code-modal-icon"></i>
            <span class="code-modal-filename">{{ data.fileName }}</span>
            <span class="code-modal-lang">{{ data.language }}</span>
          </div>
          <div class="code-modal-header-actions">
            <button
              v-if="data.isHtml"
              class="code-modal-btn"
              :class="{ active: previewMode }"
              @click="emit('toggle-preview')"
            >
              <i class="fa-solid fa-eye"></i>
              <span>{{ previewMode ? '源码' : '预览' }}</span>
            </button>
            <button class="code-modal-btn" @click="emit('copy', data.code)">
              <i class="fa-solid fa-copy"></i><span>复制</span>
            </button>
            <button class="code-modal-btn" @click="emit('download', data.code, data.fileName)">
              <i class="fa-solid fa-download"></i><span>下载</span>
            </button>
            <button class="code-modal-close" @click="emit('close')">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
        <div class="code-modal-body">
          <!-- 预览模式（仅HTML）- sandboxed iframe -->
          <div
            v-if="previewMode && data.isHtml"
            ref="htmlPreviewRef"
            class="code-modal-preview-sandbox"
          ></div>
          <!-- 源码模式 -->
          <pre v-else class="code-modal-code"><code>{{ data.code }}</code></pre>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/task/execution-block';
</style>
