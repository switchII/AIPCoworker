<script setup lang="ts">
/**
 * 通用交互式代码块壳组件
 *
 * 处理：防抖、缓存、加载/错误/成功状态、展开/折叠、
 * 源码查看、复制、全屏查看。
 *
 * 各渲染器（mermaid/html/svg）只需传入 CodeBlockConfig 即可复用本组件。
 */
import { ref, watch, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'

// ─── 配置接口 ──────────────────────────────────────────────

export interface CodeBlockConfig {
  /** 标签名（如 "mermaid", "html"） */
  label: string
  /** 回退源码高亮语言 */
  fallbackLanguage: string
  /**
   * 将 code 渲染到 container 中。
   * 返回字符串则缓存；返回 void 则跳过缓存。
   */
  render: (code: string, container: HTMLDivElement) => Promise<string | void>
  /** 可选清理函数（组件卸载时调用） */
  cleanup?: (container: HTMLDivElement) => void
  /** 折叠最大高度（px），默认 400 */
  maxHeight?: number
  /** 渲染前防抖毫秒，默认 300 */
  debounceMs?: number
  /** 渲染失败后延迟显示错误的毫秒，默认 1000 */
  errorSettleMs?: number
  /** 可选：流式预览回调（每次 code 变化时同步调用） */
  preview?: {
    render: (code: string, container: HTMLDivElement) => void | boolean
  }
  /** 可选：全屏查看 HTML 构建器 */
  buildFullscreenHtml?: (code: string) => string
  /** 可选：截图捕获（返回 SVG/PNG data URL 或 null） */
  captureImage?: (code: string, container: HTMLDivElement) => Promise<string | null>
}

// ─── Props ─────────────────────────────────────────────────

const props = defineProps<{
  code: string
  config: CodeBlockConfig
}>()

// ─── 状态 ─────────────────────────────────────────────────

type RenderStatus = 'loading' | 'previewing' | 'success' | 'error'

const status = ref<RenderStatus>('loading')
const errorMessage = ref('')
const expanded = ref(false)
const showSource = ref(false)
const copied = ref(false)
const overflows = ref(false)
const fullscreen = ref(false)

const containerRef = ref<HTMLDivElement | null>(null)
const sourcePreRef = ref<HTMLPreElement | null>(null)
const sourceExpanded = ref(false)
const sourceOverflows = ref(false)

// ─── 缓存（按 label 分组，跨实例共享） ──────────────────

const cacheMap = new Map<string, Map<string, string>>()
const CACHE_MAX = 50

function getCache(label: string): Map<string, string> {
  let c = cacheMap.get(label)
  if (!c) {
    c = new Map()
    cacheMap.set(label, c)
  }
  return c
}

// ─── 计算属性 ──────────────────────────────────────────────

const maxHeight = computed(() => props.config.maxHeight ?? 400)
const debounceMs = computed(() => props.config.debounceMs ?? 300)
const errorSettleMs = computed(() => props.config.errorSettleMs ?? 1000)
const isCollapsed = computed(() => overflows.value && !expanded.value && status.value === 'success' && !showSource.value)
const isSourceCollapsed = computed(() => sourceOverflows.value && !sourceExpanded.value && showSource.value)

// ─── 防抖/定时器引用 ──────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | undefined
let settleTimer: ReturnType<typeof setTimeout> | undefined

// ─── 溢出检测 ──────────────────────────────────────────────

let resizeObserver: ResizeObserver | null = null

function checkOverflow() {
  if (!containerRef.value) return
  if (status.value !== 'success' && status.value !== 'previewing') return
  const child = containerRef.value.firstElementChild as HTMLElement | null
  const contentH = child ? child.offsetHeight : containerRef.value.scrollHeight
  overflows.value = contentH > maxHeight.value
}

function setupOverflowObserver() {
  teardownOverflowObserver()
  if (!containerRef.value) return
  resizeObserver = new ResizeObserver(checkOverflow)
  resizeObserver.observe(containerRef.value)
}

function teardownOverflowObserver() {
  resizeObserver?.disconnect()
  resizeObserver = null
}

// ─── 源码溢出检测 ─────────────────────────────────────────

function checkSourceOverflow() {
  const pre = sourcePreRef.value
  if (!pre) return
  sourceOverflows.value = pre.scrollHeight > pre.clientHeight + 10
}

function scrollToSourceBottom() {
  const pre = sourcePreRef.value
  if (pre) pre.scrollTop = pre.scrollHeight
}

// ─── 核心渲染逻辑 ─────────────────────────────────────────

function triggerRender() {
  const code = props.code
  const cfg = props.config
  const cache = getCache(cfg.label)

  if (!code.trim()) {
    status.value = 'loading'
    return
  }

  // 缓存命中
  if (cache.has(code)) {
    status.value = 'success'
    nextTick(() => {
      if (containerRef.value) {
        containerRef.value.innerHTML = cache.get(code)!
        setupOverflowObserver()
      }
    })
    return
  }

  // 清理上一次定时器
  if (debounceTimer) clearTimeout(debounceTimer)
  if (settleTimer) clearTimeout(settleTimer)

  // 立即预览（如果配置了 preview）
  if (cfg.preview && containerRef.value) {
    const shown = cfg.preview.render(code, containerRef.value)
    if (shown !== false) {
      status.value = 'previewing'
    }
  }

  // 防抖后执行完整渲染
  debounceTimer = setTimeout(async () => {
    if (!containerRef.value || props.code !== code) return

    try {
      // 仅在没有 preview 时清空容器（preview 渲染器自行管理容器内容）
      if (!cfg.preview) {
        containerRef.value.innerHTML = ''
      }
      const html = await cfg.render(code, containerRef.value)
      if (props.code !== code) return

      // 缓存结果
      const toCache = html ?? containerRef.value.innerHTML
      if (toCache) {
        if (cache.size >= CACHE_MAX) {
          const firstKey = cache.keys().next().value
          if (firstKey !== undefined) cache.delete(firstKey)
        }
        cache.set(code, toCache)
      }
      status.value = 'success'
      nextTick(setupOverflowObserver)
    } catch (err) {
      if (props.code !== code) return
      settleTimer = setTimeout(() => {
        if (props.code === code) {
          status.value = 'error'
          errorMessage.value = err instanceof Error ? err.message : String(err)
        }
      }, errorSettleMs.value)
    }
  }, debounceMs.value)
}

// ─── 生命周期 ──────────────────────────────────────────────

onMounted(() => {
  // 初始化状态
  const cache = getCache(props.config.label)
  if (cache.has(props.code)) {
    status.value = 'success'
  }
  triggerRender()
})

watch(() => props.code, () => {
  triggerRender()
  // 流式场景：源码模式下代码更新时滚动到底部
  if (showSource.value) nextTick(scrollToSourceBottom)
})

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (settleTimer) clearTimeout(settleTimer)
  teardownOverflowObserver()
  if (containerRef.value) {
    props.config.cleanup?.(containerRef.value)
  }
})

// ─── 操作 ─────────────────────────────────────────────────

async function handleCopy() {
  try {
    await navigator.clipboard.writeText(props.code)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch { /* 忽略 */ }
}

async function handleDownload() {
  try {
    const ext = props.config.fallbackLanguage === 'mermaid' ? 'mmd' : 'html'
    const fileName = `${props.config.label}-${Date.now().toString(36)}.${ext}`
    const blob = new Blob([props.code], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  } catch { /* 忽略 */ }
}

function toggleFullscreen() {
  fullscreen.value = !fullscreen.value
}

// 源码模式切换时检测溢出 + 滚动到底部
watch(showSource, (val) => {
  if (val) {
    nextTick(() => {
      checkSourceOverflow()
      scrollToSourceBottom()
    })
  } else {
    // 切回渲染视图时重置源码折叠状态
    sourceExpanded.value = false
  }
})

// ─── 全屏查看 HTML ────────────────────────────────────────

const fullscreenHtml = computed(() => {
  if (!props.config.buildFullscreenHtml) return ''
  return props.config.buildFullscreenHtml(props.code)
})
</script>

<template>
  <div v-if="code.trim()" class="interactive-code-block">
    <!-- 错误状态（非源码模式） -->
    <div v-if="status === 'error' && !showSource" class="icb-error">
      <div class="icb-error-banner">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>渲染失败：{{ errorMessage || '未知错误' }}</span>
      </div>
      <pre class="icb-source-fallback"><code>{{ code }}</code></pre>
    </div>

    <!-- 主容器 -->
    <div v-show="status !== 'error' || showSource" class="icb-wrapper">
      <div class="icb-content">
        <!-- 源码查看模式 -->
        <div v-if="showSource" class="icb-source-view">
          <pre
            ref="sourcePreRef"
            class="icb-source-code"
            :class="{ 'icb-source-collapsed': isSourceCollapsed }"
          ><code>{{ code }}</code></pre>
          <!-- 源码折叠渐变 -->
          <div v-if="isSourceCollapsed" class="icb-source-expand-gradient">
            <button class="icb-expand-btn" @click="sourceExpanded = true">
              <i class="fa-solid fa-chevron-down"></i>
              <span>展开全部</span>
            </button>
          </div>
          <button
            v-if="status === 'success'"
            class="icb-back-to-visual"
            @click="showSource = false"
          >
            <i class="fa-solid fa-eye"></i>
            <span>查看渲染</span>
          </button>
        </div>

        <!-- 加载骨架 -->
        <div v-if="(status === 'loading' || status === 'previewing') && !showSource" class="icb-loading">
          <div class="icb-loading-shimmer"></div>
          <span class="icb-loading-text">渲染中...</span>
        </div>

        <!-- 渲染容器 -->
        <div
          v-show="!showSource"
          ref="containerRef"
          class="icb-render-container"
          :class="{ 'icb-collapsed': isCollapsed }"
          :style="isCollapsed ? { maxHeight: maxHeight + 'px' } : undefined"
        ></div>

        <!-- 悬停工具栏 -->
        <div v-if="status !== 'loading'" class="icb-hover-toolbar">
          <button class="icb-tool-btn" :title="copied ? '已复制' : '复制源码'" @click.stop="handleCopy">
            <i :class="copied ? 'fa-solid fa-check icb-success-icon' : 'fa-solid fa-copy'"></i>
          </button>
          <button class="icb-tool-btn" title="下载" @click.stop="handleDownload">
            <i class="fa-solid fa-download"></i>
          </button>
          <button
            v-if="config.buildFullscreenHtml"
            class="icb-tool-btn"
            title="全屏查看"
            @click.stop="toggleFullscreen"
          >
            <i class="fa-solid fa-expand"></i>
          </button>
          <button class="icb-tool-btn" title="查看源码" @click.stop="showSource = !showSource">
            <i class="fa-solid fa-code"></i>
          </button>
        </div>

        <!-- 折叠渐变 -->
        <div v-if="isCollapsed" class="icb-expand-gradient">
          <button class="icb-expand-btn" @click="expanded = true">
            <i class="fa-solid fa-chevron-down"></i>
            <span>展开全部</span>
          </button>
        </div>
      </div>

      <!-- 底部折叠按钮 -->
      <div v-if="overflows && expanded && !showSource" class="icb-collapse-bar">
        <button class="icb-collapse-btn" @click="expanded = false">
          <i class="fa-solid fa-chevron-up"></i>
          <span>收起</span>
        </button>
      </div>

      <!-- 源码底部折叠按钮 -->
      <div v-if="sourceOverflows && sourceExpanded && showSource" class="icb-collapse-bar">
        <button class="icb-collapse-btn" @click="sourceExpanded = false">
          <i class="fa-solid fa-chevron-up"></i>
          <span>收起</span>
        </button>
      </div>

      <!-- 标签 -->
      <div class="icb-label-bar">
        <span class="icb-lang-label">{{ config.label }}</span>
      </div>
    </div>

    <!-- 全屏弹窗 -->
    <Teleport to="body">
      <Transition name="icb-dialog-fade">
        <div v-if="fullscreen" class="icb-fullscreen-overlay" @click="fullscreen = false">
          <div class="icb-fullscreen-panel" @click.stop>
            <!-- 头部栏 -->
            <div class="icb-fullscreen-header">
              <span class="icb-fullscreen-title">{{ config.label }} 预览</span>
              <button class="icb-fullscreen-close" @click="fullscreen = false">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
            <!-- 内容区 -->
            <div class="icb-fullscreen-body">
              <iframe
                :srcdoc="fullscreenHtml"
                sandbox="allow-scripts"
                class="icb-fullscreen-iframe"
              ></iframe>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
// ─── 变量 ─────────────────────────────────────────────────
$bg-muted: #f6f8fa;
$bg-pressed: #eaeef2;
$border-color: #d0d7de;
$text-primary: #1f2328;
$text-muted: #656d76;
$text-tertiary: #8b949e;
$error-bg: #fef2f2;
$error-border: #fecaca;
$error-text: #dc2626;
$success-color: #16a34a;
$font-mono: 'SF Mono', 'Menlo', 'Consolas', monospace;

// ─── 根容器 ───────────────────────────────────────────────
.interactive-code-block {
  margin: 12px 0;
  position: relative;
  font-size: 14px;

  // 悬停时显示工具栏
  &:hover .icb-hover-toolbar {
    opacity: 1;
    pointer-events: auto;
  }
}

// ─── 错误状态 ─────────────────────────────────────────────
.icb-error {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid $error-border;
}

.icb-error-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: $error-bg;
  color: $error-text;
  font-size: 12px;
}

.icb-source-fallback {
  margin: 0;
  padding: 12px 16px;
  background: $bg-muted;
  font-family: $font-mono;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
  color: $text-primary;
}

// ─── 主容器 ───────────────────────────────────────────────
.icb-wrapper {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid $border-color;
  background: #fff;
}

.icb-content {
  position: relative;
  background: #fff;
}

// ─── 渲染容器 ─────────────────────────────────────────────
.icb-render-container {
  padding: 16px;
  overflow-x: auto;
  display: flex;
  justify-content: center;

  :deep(> svg) {
    max-width: 100%;
    height: auto;
  }

  &.icb-collapsed {
    overflow: hidden;
  }
}

// ─── 加载状态 ─────────────────────────────────────────────
.icb-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: $bg-muted;
  z-index: 5;
  min-height: 100px;
}

.icb-loading-shimmer {
  width: 100%;
  height: 100%;
  position: absolute;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
  background-size: 200% 100%;
  animation: icb-shimmer 2s infinite linear;
}

@keyframes icb-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.icb-loading-text {
  position: relative;
  z-index: 1;
  font-size: 13px;
  color: $text-muted;
}

// ─── 源码视图 ─────────────────────────────────────────────
.icb-source-view {
  position: relative;
}

.icb-source-code {
  margin: 0;
  padding: 12px 16px;
  background: $bg-muted;
  font-family: $font-mono;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
  overflow-y: auto;
  max-height: 70vh;
  color: $text-primary;

  &.icb-source-collapsed {
    max-height: 400px;
    overflow: hidden;
  }

  code {
    font-family: inherit;
    background: transparent;
  }
}

// 源码折叠渐变
.icb-source-expand-gradient {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60px;
  background: linear-gradient(to top, $bg-muted, transparent);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 8px;
}

.icb-back-to-visual {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid $border-color;
  border-radius: 6px;
  background: rgba(255,255,255,0.9);
  color: $text-muted;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: $bg-muted;
    color: $text-primary;
  }
}

// ─── 悬停工具栏 ──────────────────────────────────────────
.icb-hover-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: rgba(255,255,255,0.92);
  border-radius: 8px;
  border: 1px solid $border-color;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}

.icb-tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  color: $text-muted;
  font-size: 13px;
  transition: all 0.12s;

  &:hover {
    background: rgba(0,0,0,0.05);
    color: $text-primary;
  }

  .icb-success-icon {
    color: $success-color;
  }
}

// ─── 展开/折叠 ───────────────────────────────────────────
.icb-expand-gradient {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60px;
  background: linear-gradient(to top, #fff, transparent);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 8px;
}

.icb-expand-btn,
.icb-collapse-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: 12px;
  background: rgba(0,0,0,0.04);
  color: $text-muted;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: rgba(0,0,0,0.08);
  }
}

.icb-collapse-bar {
  display: flex;
  justify-content: center;
  padding: 6px 0;
  border-top: 1px solid $bg-pressed;
}

// ─── 底部标签栏 ──────────────────────────────────────────
.icb-label-bar {
  display: flex;
  align-items: center;
  padding: 4px 12px;
  border-top: 1px solid $bg-pressed;
  background: $bg-muted;
}

.icb-lang-label {
  font-size: 11px;
  color: $text-tertiary;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

// ─── 全屏弹窗 ─────────────────────────────────────────────
.icb-fullscreen-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.icb-fullscreen-panel {
  width: 100%;
  max-width: 1100px;
  height: 85vh;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 80px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

// 头部栏
.icb-fullscreen-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e4e7ed;
  flex-shrink: 0;
}

.icb-fullscreen-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  text-transform: capitalize;
}

.icb-fullscreen-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  color: #909399;
  font-size: 16px;
  transition: all 0.15s;

  &:hover {
    background: #f2f3f5;
    color: #303133;
  }
}

// 内容区
.icb-fullscreen-body {
  flex: 1;
  min-height: 0;
}

.icb-fullscreen-iframe {
  width: 100%;
  height: 100%;
  border: none;
}

// 弹窗过渡动画
.icb-dialog-fade-enter-active {
  transition: opacity 0.25s ease;
  .icb-fullscreen-panel { transition: transform 0.25s ease, opacity 0.25s ease; }
}
.icb-dialog-fade-leave-active {
  transition: opacity 0.2s ease;
  .icb-fullscreen-panel { transition: transform 0.2s ease, opacity 0.2s ease; }
}
.icb-dialog-fade-enter-from,
.icb-dialog-fade-leave-to {
  opacity: 0;
  .icb-fullscreen-panel { transform: scale(0.95); opacity: 0; }
}
</style>
