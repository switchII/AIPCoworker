<script setup lang="ts">
import type { ExecutionBlock } from '../../../types/task'
import { useBlockHelpers } from '../composables/useBlockHelpers'
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

const isGenerating = computed(() => props.block.subagentStatus === 'generating' || (props.block.status === 'running' && props.block.subagentStatus === undefined && !props.block.code))
const generationDurationText = computed(() => {
  const d = props.block.generationDuration
  if (!d) return ''
  return d < 60 ? `${d}秒` : `${Math.floor(d / 60)}分${d % 60}秒`
})

// 流式代码容器引用，用于自动滚动到底部
const streamingCodeRef = ref<HTMLElement | null>(null)

// ===== 代码块折叠/展开 =====
const CODE_MAX_HEIGHT = 400 // 折叠时的最大高度（px）
const codePreRef = ref<HTMLElement | null>(null)
const codeExpanded = ref(false)
const codeOverflows = ref(false)
const isCodeCollapsed = computed(() => codeOverflows.value && !codeExpanded.value)

function checkCodeOverflow() {
  const pre = codePreRef.value
  if (!pre) return
  codeOverflows.value = pre.scrollHeight > CODE_MAX_HEIGHT + 10
}

let codeResizeObserver: ResizeObserver | null = null

function setupCodeOverflowObserver() {
  teardownCodeOverflowObserver()
  if (!codePreRef.value) return
  codeResizeObserver = new ResizeObserver(checkCodeOverflow)
  codeResizeObserver.observe(codePreRef.value)
}

function teardownCodeOverflowObserver() {
  codeResizeObserver?.disconnect()
  codeResizeObserver = null
}

// 展开后监听 code 变化（生成完成后首次展示时检测溢出）
watch(() => props.block.expanded, (val) => {
  if (val) nextTick(setupCodeOverflowObserver)
  else teardownCodeOverflowObserver()
})

onMounted(() => {
  if (props.block.expanded) nextTick(setupCodeOverflowObserver)
})

onBeforeUnmount(() => {
  teardownCodeOverflowObserver()
})

// 监听 extraText 变化，自动滚动到底部显示最新输出
watch(() => props.block.extraText, () => {
  if (!streamingCodeRef.value) return
  nextTick(() => {
    if (streamingCodeRef.value) {
      streamingCodeRef.value.scrollTop = streamingCodeRef.value.scrollHeight
    }
  })
})
</script>

<template>
  <div class="thinking-module code-module" :class="['status-' + block.status, { 'is-generating': isGenerating }]">
    <div class="thinking-header clickable" @click="emit('toggle-block')">
      <i class="fa-solid fa-code thinking-icon code-icon"></i>
      <span class="thinking-label">
        <template v-if="isGenerating">子代理生成中...</template>
        <template v-else>代码编辑</template>
      </span>
      <span v-if="block.fileName" class="file-badge">{{ block.fileName }}</span>
      <span v-if="block.language && !isGenerating" class="lang-badge">{{ block.language }}</span>
      <span v-if="generationDurationText && !isGenerating" class="generation-duration-badge">
        <i class="fa-regular fa-clock"></i> {{ generationDurationText }}
      </span>
      <i :class="getStatusIconClass(block.status)" class="status-icon" :data-status="block.status"></i>
      <i class="fa-solid fa-chevron-down expand-arrow" :class="{ open: block.expanded }"></i>
    </div>

    <!-- 生成进度条 -->
    <div v-if="isGenerating" class="subagent-progress-bar">
      <div class="subagent-progress-fill"></div>
    </div>

    <!-- 生成状态提示（流式显示生成中的代码） -->
    <div v-if="isGenerating" class="subagent-streaming-wrapper">
      <div class="subagent-status-message">
        <i class="fa-solid fa-feather"></i>
        <span>子代理正在生成{{ block.language || '代码' }}文件，请稍候...</span>
        <span v-if="block.fileName" class="gen-filename">{{ block.fileName }}</span>
      </div>
      <pre v-if="block.extraText" ref="streamingCodeRef" class="subagent-streaming-code"><code>{{ block.extraText }}</code></pre>
    </div>

    <div v-if="block.expanded && !isGenerating" class="code-container">
      <div class="code-header">
        <span class="code-lang">{{ block.language || 'text' }}</span>
        <div class="code-actions">
          <button class="code-action-btn" title="复制" @click.stop="emit('copy-code', block.code)">
            <i class="fa-solid fa-copy"></i><span>复制</span>
          </button>
          <button class="code-action-btn" title="下载" @click.stop="emit('download-code', block.code, block.fileName || 'code.txt')">
            <i class="fa-solid fa-download"></i><span>下载</span>
          </button>
          <button class="code-action-btn" title="弹窗查看" @click.stop="emit('open-code-popup', block.code, block.language || 'text', block.fileName || 'code.txt')">
            <i class="fa-solid fa-up-right-and-down-left-from-center"></i><span>弹窗查看</span>
          </button>
          <button
            v-if="block.language === 'html' || (block.fileName && block.fileName.endsWith('.html'))"
            class="code-action-btn preview-btn"
            title="预览"
            @click.stop="emit('open-code-popup-preview', block.code, 'html', block.fileName || 'code.html')"
          >
            <i class="fa-solid fa-eye"></i><span>预览</span>
          </button>
        </div>
      </div>
      <div class="code-block-wrapper">
        <pre
          ref="codePreRef"
          class="code-block"
          :class="{ 'code-block-collapsed': isCodeCollapsed }"
          :style="isCodeCollapsed ? { maxHeight: CODE_MAX_HEIGHT + 'px' } : undefined"
        ><code>{{ block.code }}</code></pre>
        <!-- 折叠渐变遮罩 -->
        <div v-if="isCodeCollapsed" class="code-expand-gradient">
          <button class="code-expand-btn" @click.stop="codeExpanded = true">
            <i class="fa-solid fa-chevron-down"></i>
            <span>展开全部</span>
          </button>
        </div>
      </div>
      <!-- 底部收起按钮 -->
      <div v-if="codeOverflows && codeExpanded" class="code-collapse-bar">
        <button class="code-collapse-btn" @click.stop="codeExpanded = false">
          <i class="fa-solid fa-chevron-up"></i>
          <span>收起</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/task/execution-block';
</style>
