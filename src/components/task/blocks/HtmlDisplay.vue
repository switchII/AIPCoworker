<script setup lang="ts">
/**
 * HTML 代码块渲染器
 *
 * 使用沙箱化 iframe 渲染 ```html 代码块。
 * 复用 useHtmlSandbox 组合式函数的安全沙箱机制。
 */
import { markRaw, onBeforeUnmount } from 'vue'
import InteractiveCodeBlock from './InteractiveCodeBlock.vue'
import type { CodeBlockConfig } from './InteractiveCodeBlock.vue'
import {
  getOrCreateIframe,
  sendToIframe,
  cleanupIframe,
  hasVisibleContent,
  sanitizeForStreaming,
  extractScriptUrls,
} from '../composables/useHtmlSandbox'

defineProps<{
  code: string
}>()

// ─── 模块级节流状态 ──────────────────────────────────────

let lastPreviewTime = 0
let pendingPreview: ReturnType<typeof setTimeout> | undefined
const PREVIEW_INTERVAL = 150

// ─── 预览函数（流式更新） ─────────────────────────────────

function previewHtmlWidget(code: string, container: HTMLDivElement): boolean {
  if (!hasVisibleContent(code)) return false

  const iframe = getOrCreateIframe(container, code, { initialHeight: 60 })
  const now = Date.now()

  const doSend = () => {
    lastPreviewTime = Date.now()
    const scripts = extractScriptUrls(code)
    sendToIframe(iframe, 'widget:update', sanitizeForStreaming(code),
      scripts.length > 0 ? { scripts } : undefined)
  }

  if (now - lastPreviewTime >= PREVIEW_INTERVAL) {
    if (pendingPreview) { clearTimeout(pendingPreview); pendingPreview = undefined }
    doSend()
  } else if (!pendingPreview) {
    pendingPreview = setTimeout(() => {
      pendingPreview = undefined
      doSend()
    }, PREVIEW_INTERVAL - (now - lastPreviewTime))
  }

  return true
}

// ─── 最终渲染 ─────────────────────────────────────────────

async function renderHtmlWidget(code: string, container: HTMLDivElement): Promise<string> {
  const iframe = getOrCreateIframe(container, code, { initialHeight: 60 })
  sendToIframe(iframe, 'widget:finalize', code)
  // 返回空字符串跳过缓存（iframe 状态无法从 HTML 字符串恢复）
  return ''
}

// ─── 清理 ─────────────────────────────────────────────────

function cleanupHtmlWidget(container: HTMLDivElement) {
  cleanupIframe(container)
}

// ─── 全屏 ─────────────────────────────────────────────────

function buildFullHtml(widgetCode: string): string {
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, -apple-system, sans-serif; font-size: 14px;
       line-height: 1.6; color: #1f2937; background: #fff; padding: 16px; overflow: auto; }
</style>
</head><body>${widgetCode}</body></html>`
}

// ─── 组件卸载清理 ─────────────────────────────────────────

onBeforeUnmount(() => {
  if (pendingPreview) {
    clearTimeout(pendingPreview)
    pendingPreview = undefined
  }
})

// ─── 配置 ─────────────────────────────────────────────────

const config: CodeBlockConfig = markRaw({
  label: 'html',
  fallbackLanguage: 'html',
  render: renderHtmlWidget,
  cleanup: cleanupHtmlWidget,
  buildFullscreenHtml: buildFullHtml,
  debounceMs: 200,
  errorSettleMs: 1000,
  maxHeight: 600,
  preview: {
    render: previewHtmlWidget,
  },
})
</script>

<template>
  <InteractiveCodeBlock :code="code" :config="config" />
</template>
