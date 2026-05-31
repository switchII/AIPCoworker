<script setup lang="ts">
import type { ExecutionBlock } from '../../../types/task'
import { useBlockHelpers } from '../composables/useBlockHelpers'
import { useHtmlSandbox } from '../composables/useHtmlSandbox'
import { computed, watch, ref, nextTick, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps<{ block: ExecutionBlock }>()

const emit = defineEmits<{
  (e: 'toggle-block'): void
  (e: 'copy-code', code: string | undefined): void
  (e: 'download-code', code: string | undefined, fileName: string): void
  (e: 'open-code-popup', code: string | undefined, language: string, fileName: string): void
  (e: 'open-code-popup-preview', code: string | undefined, language: string, fileName: string): void
}>()

const { getStatusIconClass } = useBlockHelpers()
const { previewHtml, finalizeHtml, cleanup } = useHtmlSandbox()

const isGenerating = computed(() => props.block.subagentStatus === 'generating' || props.block.status === 'running')
const generationDurationText = computed(() => {
  const d = props.block.generationDuration
  if (!d) return ''
  return d < 60 ? `${d}秒` : `${Math.floor(d / 60)}分${d % 60}秒`
})

/** 截断标题文本，超过长度用省略号显示，完整内容在 tooltip 中可见 */
const displayTitle = computed(() => {
  const text = props.block.text || ''
  if (text.length <= 30) return text
  return text.slice(0, 30) + '…'
})

// iframe 容器引用
const streamingPreviewRef = ref<HTMLElement | null>(null)
const finalPreviewRef = ref<HTMLElement | null>(null)

// 流式代码容器，用于自动滚动
const streamingCodeRef = ref<HTMLElement | null>(null)

// 渲染错误状态
const renderError = ref(false)

// 流式预览是否激活（有可见内容）
const hasStreamingPreview = ref(false)

// 监听流式 extraText 变化 —— 实时更新预览
watch(() => props.block.extraText, (newText) => {
  if (!newText || !isGenerating.value) return

  // 自动滚动源码面板到底部
  if (streamingCodeRef.value) {
    nextTick(() => {
      if (streamingCodeRef.value) {
        streamingCodeRef.value.scrollTop = streamingCodeRef.value.scrollHeight
      }
    })
  }

  // 更新实时预览
  if (streamingPreviewRef.value) {
    try {
      const result = previewHtml(newText, streamingPreviewRef.value, {
        initialHeight: 100,
      })
      hasStreamingPreview.value = result
    } catch {
      // 优雅降级 —— 继续仅显示源码
      hasStreamingPreview.value = false
    }
  }
})

// 监听生成完成 —— 执行最终渲染
watch(() => props.block.htmlContent, (htmlContent) => {
  if (!htmlContent || isGenerating.value) return

  nextTick(() => {
    if (finalPreviewRef.value) {
      try {
        finalizeHtml(htmlContent, finalPreviewRef.value, {
          initialHeight: 200,
        })
        renderError.value = false
      } catch {
        renderError.value = true
      }
    }
  })
})

// 组件挂载时若已有内容则直接执行最终渲染
onMounted(() => {
  if (props.block.htmlContent && !isGenerating.value && finalPreviewRef.value) {
    try {
      finalizeHtml(props.block.htmlContent, finalPreviewRef.value, {
        initialHeight: 200,
      })
    } catch {
      renderError.value = true
    }
  }
})

// 组件卸载时清理资源
onBeforeUnmount(() => {
  if (streamingPreviewRef.value) {
    cleanup(streamingPreviewRef.value)
  }
  if (finalPreviewRef.value) {
    cleanup(finalPreviewRef.value)
  }
})
</script>

<template>
  <div class="thinking-module html-render-module" :class="['status-' + block.status, { 'is-generating': isGenerating }]">
    <div class="thinking-header clickable" @click="emit('toggle-block')">
      <i class="fa-solid fa-code thinking-icon html-render-icon"></i>
      <span class="thinking-label">
        <template v-if="isGenerating">子代理生成中...</template>
        <template v-else>网页渲染</template>
      </span>
      <span v-if="block.text" class="html-render-title-badge" :title="block.text">{{ displayTitle }}</span>
      <span v-if="generationDurationText && !isGenerating" class="generation-duration-badge">
        <i class="fa-regular fa-clock"></i> {{ generationDurationText }}
      </span>
      <i :class="getStatusIconClass(block.status)" class="status-icon" :data-status="block.status"></i>
      <i class="fa-solid fa-chevron-down expand-arrow" :class="{ open: block.expanded }"></i>
    </div>

    <!-- 生成中状态：实时流式预览 + 可折叠源码 -->
    <div v-if="isGenerating && block.expanded" class="html-render-streaming">
      <div class="subagent-status-message">
        <i class="fa-solid fa-feather"></i>
        <span>子代理正在生成网页，请稍候...</span>
      </div>

      <!-- 实时流式预览 iframe -->
      <div
        v-if="hasStreamingPreview"
        ref="streamingPreviewRef"
        class="html-render-streaming-preview"
      ></div>

      <!-- 源码显示 -->
      <pre v-if="block.extraText" ref="streamingCodeRef" class="subagent-streaming-code"><code>{{ block.extraText }}</code></pre>
    </div>

    <!-- 最终渲染视图 -->
    <div v-if="block.expanded && !isGenerating" class="html-render-body">
      <div class="html-render-toolbar">
        <p class="html-render-desc">{{ block.extraText || '' }}</p>
        <div class="html-render-actions">
          <button class="code-action-btn" title="复制源码" @click.stop="emit('copy-code', block.htmlContent)">
            <i class="fa-solid fa-copy"></i><span>复制</span>
          </button>
          <button class="code-action-btn" title="下载" @click.stop="emit('download-code', block.htmlContent, (block.text || 'render') + '.html')">
            <i class="fa-solid fa-download"></i><span>下载</span>
          </button>
          <button class="code-action-btn" title="弹窗查看" @click.stop="emit('open-code-popup', block.htmlContent, 'html', (block.text || 'render') + '.html')">
            <i class="fa-solid fa-up-right-and-down-left-from-center"></i><span>弹窗查看</span>
          </button>
          <button class="code-action-btn preview-btn" title="查看预览" @click.stop="emit('open-code-popup-preview', block.htmlContent, 'html', (block.text || 'render') + '.html')">
            <i class="fa-solid fa-eye"></i><span>预览</span>
          </button>
        </div>
      </div>

      <!-- 渲染失败降级提示 -->
      <div v-if="renderError" class="html-render-error">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>渲染失败，请查看源码</span>
      </div>

      <!-- 沙箱化 iframe 预览 -->
      <div
        v-if="block.htmlContent && !renderError"
        ref="finalPreviewRef"
        class="html-render-frame-wrapper"
      ></div>

      <!-- 降级：渲染失败时显示源码 -->
      <pre v-if="renderError && block.htmlContent" class="html-render-fallback-code"><code>{{ block.htmlContent }}</code></pre>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/task/execution-block';
</style>
