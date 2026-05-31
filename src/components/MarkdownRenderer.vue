<script setup lang="ts">
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'
import { ref, watch, computed, onMounted, onBeforeUnmount, nextTick, createApp, defineComponent, h, markRaw, type App, type Ref } from 'vue'
import 'github-markdown-css/github-markdown.css'
import { getCodeRenderer, hasCodeRenderer } from './task/blocks/codeRendererRegistry'

// ─── 注册内置渲染器 ──────────────────────────────────────
import { registerCodeRenderer } from './task/blocks/codeRendererRegistry'
import MermaidDisplay from './task/blocks/MermaidDisplay.vue'
import HtmlDisplay from './task/blocks/HtmlDisplay.vue'
import SvgDisplay from './task/blocks/SvgDisplay.vue'

registerCodeRenderer('mermaid', MermaidDisplay as any)
registerCodeRenderer('html', HtmlDisplay as any)
registerCodeRenderer('svg', SvgDisplay as any)

// ─── Props ────────────────────────────────────────────────

const props = withDefaults(defineProps<{
  content: string
  theme?: 'light' | 'dark'
}>(), {
  theme: 'light'
})

// ─── marked 配置 ──────────────────────────────────────────

marked.setOptions({
  gfm: true,
  breaks: true,
})

// 使用自定义渲染器实现代码语法高亮
marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }): string {
      let highlighted: string
      if (lang && hljs.getLanguage(lang)) {
        try { highlighted = hljs.highlight(text, { language: lang }).value }
        catch { highlighted = hljs.highlightAuto(text).value }
      } else {
        try { highlighted = hljs.highlightAuto(text).value }
        catch { highlighted = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
      }
      const langClass = lang ? ` language-${lang}` : ''
      return `<pre><code class="hljs${langClass}">${highlighted}</code></pre>\n`
    },
  },
})

// ─── 内容分块解析（文本 vs 代码块） ─────────────────────

interface TextChunk {
  type: 'text'
  html: string  // marked 渲染后的 HTML
}

interface CodeChunk {
  type: 'code'
  lang: string
  code: string
}

type ContentChunk = TextChunk | CodeChunk

/** 将 Markdown 内容拆分为文本块和特殊代码块（流式安全） */
function parseChunks(content: string): ContentChunk[] {
  if (!content) return []
  const chunks: ContentChunk[] = []
  // 匹配 ```lang\n...``` 或 ```lang\n...(未闭合)
  const fenceRe = /^```(\S+)\s*$/gm
  let lastIndex = 0
  let m: RegExpExecArray | null

  while ((m = fenceRe.exec(content)) !== null) {
    const lang = m[1].toLowerCase()

    // 非注册语言 → 跳过，让 marked 正常处理
    if (!hasCodeRenderer(lang)) continue

    // 围栏前的文本 → 文本块
    if (m.index > lastIndex) {
      const text = content.slice(lastIndex, m.index)
      if (text.trim()) {
        chunks.push({ type: 'text', html: marked.parse(text) as string })
      }
    }

    // 代码块开始位置
    const codeStart = m.index + m[0].length + 1 // +1 跳过 \n

    // 寻找匹配的闭合围栏
    const closeRe = /^```\s*$/gm
    closeRe.lastIndex = codeStart
    const closeMatch = closeRe.exec(content)

    let code: string
    if (closeMatch) {
      // 已闭合
      code = content.slice(codeStart, closeMatch.index).replace(/\n$/, '')
      lastIndex = closeMatch.index + closeMatch[0].length
    } else {
      // 未闭合（流式场景）→ 取剩余所有内容
      code = content.slice(codeStart).replace(/\n$/, '')
      lastIndex = content.length
    }

    chunks.push({ type: 'code', lang, code })
  }

  // 剩余文本
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex)
    if (text.trim()) {
      chunks.push({ type: 'text', html: marked.parse(text) as string })
    }
  }

  return chunks
}

/** 计算属性：内容分块（流式场景自动处理未闭合围栏） */
const chunks = computed<ContentChunk[]>(() => parseChunks(props.content))

// ─── 代码块 Vue 组件挂载管理 ─────────────────────────────

/**
 * 轻量包装组件：将 codeRef（响应式）作为 prop 传给实际渲染器。
 * 避免直接修改 Vue prop（props 是只读的）。
 */
const CodeBlockWrapper = defineComponent({
  name: 'CodeBlockWrapper',
  props: {
    target: { type: Object, required: true },
    codeRef: { type: Object, required: true }
  },
  setup(wrapperProps) {
    return () => h((wrapperProps as any).target, { code: (wrapperProps as any).codeRef.value })
  }
})

/** 已挂载的代码块应用（按 "idx:lang" 键追踪，流式场景避免重建） */
interface MountedBlock {
  app: App
  codeRef: Ref<string>   // 响应式 ref —— 更新 .value 即可驱动子组件重渲染
  code: string
  el: HTMLElement        // 挂载元素引用（用于自动滚动）
}
const mountedBlocks = new Map<string, MountedBlock>()

const containerRef = ref<HTMLElement | null>(null)

/** 挂载或更新代码块 Vue 组件（增量更新，流式场景直接更新 prop 避免 iframe 闪烁） */
function syncCodeBlockApps() {
  const root = containerRef.value
  if (!root) return

  const activeKeys = new Set<string>()
  const langCounters = new Map<string, number>()

  // 获取代码块 chunk 列表（用于快速按索引查找代码）
  const codeChunks = chunks.value.filter(c => c.type === 'code') as CodeChunk[]

  // 遍历组件内所有代码块占位符
  const containers = root.querySelectorAll<HTMLElement>('[data-code-mount]')
  containers.forEach((el) => {
    const lang = el.getAttribute('data-lang') || ''
    const idx = langCounters.get(lang) || 0
    langCounters.set(lang, idx + 1)
    const key = `${idx}:${lang}`
    activeKeys.add(key)

    const entry = getCodeRenderer(lang)
    if (!entry) return

    const codeChunk = codeChunks[idx]
    if (!codeChunk || !codeChunk.code) return
    const code = codeChunk.code

    const existing = mountedBlocks.get(key)
    if (existing) {
      if (existing.code === code) return // 同代码 → 无操作
      // 代码变化 → 更新响应式 ref（流式场景保持同一组件实例，iframe 不闪烁）
      existing.codeRef.value = code
      existing.code = code
      // 流式场景：自动滚动代码块到底部，显示最新代码
      nextTick(() => {
        const mountEl = existing.el
        if (mountEl && mountEl.scrollHeight > mountEl.clientHeight) {
          mountEl.scrollTop = mountEl.scrollHeight
        }
      })
      return
    }

    // 新位置 → 挂载（用 ref 包装 code，由 Wrapper 传递给渲染器）
    const codeRef = ref(code)
    const app = createApp(CodeBlockWrapper, {
      target: markRaw(entry.component),
      codeRef
    })
    app.mount(el)
    mountedBlocks.set(key, { app, codeRef, code, el })
  })

  // 卸载不再存在的旧实例
  for (const [key, block] of mountedBlocks) {
    if (!activeKeys.has(key)) {
      try { block.app.unmount() } catch { /* 忽略 */ }
      mountedBlocks.delete(key)
    }
  }
}

// 监听内容变化 → 增量更新代码块
watch(chunks, () => {
  nextTick(syncCodeBlockApps)
})

onMounted(() => {
  nextTick(syncCodeBlockApps)
})

onBeforeUnmount(() => {
  for (const [, block] of mountedBlocks) {
    try { block.app.unmount() } catch { /* 忽略 */ }
  }
  mountedBlocks.clear()
})
</script>

<template>
  <div ref="containerRef" class="markdown-body" :class="[`theme-${theme}`]">
    <template v-for="(chunk, idx) in chunks" :key="idx">
      <!-- 文本块：v-html 渲染 -->
      <div v-if="chunk.type === 'text'" v-html="chunk.html" />
      <!-- 代码块：Vue 组件挂载点（跨更新保持稳定，避免 iframe 闪烁） -->
      <div
        v-else-if="chunk.type === 'code'"
        :data-code-mount="true"
        :data-lang="chunk.lang"
        class="code-block-mount"
      />
    </template>
  </div>
</template>

<style scoped>
.markdown-body {
  font-size: 14px;
  line-height: 1.6;
  word-wrap: break-word;
  :deep(p) {
    margin-bottom: 3px;
  }
}

.theme-light {
  color-scheme: light;
  --color-fg-default: #1f2328;
  --color-canvas-default: #ffffff;
}

.theme-dark {
  color-scheme: dark;
  --color-fg-default: #e6edf3;
  --color-canvas-default: #0d1117;
  background-color: var(--color-canvas-default);
  color: var(--color-fg-default);
}

/* 代码块挂载点 —— 已注册渲染器（mermaid/html/svg）的容器 */
:deep(.code-block-mount) {
  margin: 16px 0;
  max-width: 100%;
}

</style>
