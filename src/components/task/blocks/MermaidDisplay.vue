<script setup lang="ts">
/**
 * Mermaid 图表渲染器
 *
 * 使用 mermaid 库将 ```mermaid 代码块渲染为 SVG。
 * 支持缓存、错误处理和全屏查看。
 */
import { markRaw } from 'vue'
import InteractiveCodeBlock from './InteractiveCodeBlock.vue'
import type { CodeBlockConfig } from './InteractiveCodeBlock.vue'

defineProps<{
  code: string
}>()

// ─── Mermaid 懒加载 ───────────────────────────────────────

let mermaidInitPromise: Promise<typeof import('mermaid')['default']> | null = null

function getMermaid() {
  if (!mermaidInitPromise) {
    mermaidInitPromise = import('mermaid').then((mod) => {
      const mermaid = mod.default
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          primaryColor: '#e8f4fd',
          primaryTextColor: '#1f2937',
          primaryBorderColor: '#6366f1',
          lineColor: '#6b7280',
          secondaryColor: '#f3f4f6',
          tertiaryColor: '#f9fafb',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        },
        securityLevel: 'strict',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      })
      return mermaid
    })
  }
  return mermaidInitPromise
}

// ─── SVG 缓存 ─────────────────────────────────────────────

const svgCache = new Map<string, string>()
const SVG_CACHE_MAX = 30

// ─── 渲染函数 ─────────────────────────────────────────────

/** 清理 mermaid.render() 遗留的临时 DOM 元素 */
function cleanupMermaidArtifacts(id: string) {
  for (const sel of [`#${id}`, `#d${id}`, '[data-id="${id}"]']) {
    try { document.querySelector(sel)?.remove() } catch { /* skip */ }
  }
  document.querySelectorAll('#d-mermaid, .error-icon, [id^="dmermaid-"]').forEach((el) => {
    if (el.parentElement === document.body) el.remove()
  })
}

async function renderMermaid(code: string, container: HTMLDivElement): Promise<string> {
  const id = `mmd-${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`
  try {
    const mermaid = await getMermaid()
    const { svg } = await mermaid.render(id, code)
    cleanupMermaidArtifacts(id)
    container.innerHTML = svg

    // 缓存 SVG
    if (svgCache.size >= SVG_CACHE_MAX) {
      const firstKey = svgCache.keys().next().value
      if (firstKey !== undefined) svgCache.delete(firstKey)
    }
    svgCache.set(code, svg)
    return svg
  } catch (err) {
    cleanupMermaidArtifacts(id)
    console.error('[MermaidDisplay] render failed:', err instanceof Error ? err.message : err)
    throw err
  }
}

function buildFullscreenHtml(code: string): string {
  const svg = svgCache.get(code) || ''
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<style>
  body { display:flex; justify-content:center; align-items:flex-start;
         padding:40px; background:#fff; margin:0; overflow:auto; }
  svg { max-width:100%; height:auto; }
</style>
</head><body>${svg}</body></html>`
}

// ─── 配置 ─────────────────────────────────────────────────

const config: CodeBlockConfig = markRaw({
  label: 'mermaid',
  fallbackLanguage: 'mermaid',
  render: renderMermaid,
  buildFullscreenHtml,
  debounceMs: 300,
  errorSettleMs: 1000,
  maxHeight: 400,
})
</script>

<template>
  <InteractiveCodeBlock :code="code" :config="config" />
</template>
