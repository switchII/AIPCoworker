<script setup lang="ts">
/**
 * SVG 代码块渲染器
 *
 * 将 ```svg 代码块包装为 HTML 后委托给 HtmlDisplay 的渲染逻辑。
 * SVG 不需要脚本执行，使用相同的 iframe 沙箱机制。
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

// ─── SVG → HTML 包装 ─────────────────────────────────────

/** 将纯 SVG 代码包装为完整 HTML 文档 */
function wrapSvgAsHtml(svgCode: string): string {
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { display:flex; justify-content:center; align-items:center;
       min-height:100vh; background:#fff; padding:16px; }
svg { max-width:100%; height:auto; }
</style>
</head><body>${svgCode}</body></html>`
}

// ─── 模块级节流状态 ──────────────────────────────────────

let lastPreviewTime = 0
let pendingPreview: ReturnType<typeof setTimeout> | undefined
const PREVIEW_INTERVAL = 150

// ─── 预览函数 ─────────────────────────────────────────────

function previewSvg(code: string, container: HTMLDivElement): boolean {
  const html = wrapSvgAsHtml(code)
  if (!hasVisibleContent(html)) return false

  const iframe = getOrCreateIframe(container, html, { initialHeight: 60 })
  const now = Date.now()

  const doSend = () => {
    lastPreviewTime = Date.now()
    const scripts = extractScriptUrls(html)
    sendToIframe(iframe, 'widget:update', sanitizeForStreaming(html),
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

async function renderSvg(code: string, container: HTMLDivElement): Promise<string> {
  const html = wrapSvgAsHtml(code)
  const iframe = getOrCreateIframe(container, html, { initialHeight: 60 })
  sendToIframe(iframe, 'widget:finalize', html)
  return ''
}

// ─── 清理 ─────────────────────────────────────────────────

function cleanupSvg(container: HTMLDivElement) {
  cleanupIframe(container)
}

// ─── 全屏 ─────────────────────────────────────────────────

function buildFullscreenHtml(code: string): string {
  return wrapSvgAsHtml(code)
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
  label: 'svg',
  fallbackLanguage: 'xml',
  render: renderSvg,
  cleanup: cleanupSvg,
  buildFullscreenHtml,
  debounceMs: 200,
  errorSettleMs: 1000,
  maxHeight: 500,
  preview: {
    render: previewSvg,
  },
})
</script>

<template>
  <InteractiveCodeBlock :code="code" :config="config" />
</template>
