<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount, onMounted } from 'vue'
import { useFileUtils, isImageType, isDocxType, isPptxType, isExcelType, isPdfType } from '../composables/useFileUtils'
import type { PreviewFileInfo } from '../composables/useFileUtils'
import MarkdownRenderer from '../../MarkdownRenderer.vue'
import { useHtmlSandbox } from '../composables/useHtmlSandbox'
import { marked } from 'marked'
import { invoke } from '@tauri-apps/api/core'
import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

// vue-office 组件（真实 Office 格式渲染）
import VueOfficeDocx from '@vue-office/docx'
import VueOfficeExcel from '@vue-office/excel'
import VueOfficePdf from '@vue-office/pdf'
import '@vue-office/docx/lib/index.css'
import '@vue-office/excel/lib/index.css'
// pptx-browser：零依赖 Canvas 渲染，无 Vue DOM 冲突
import { PptxRenderer } from 'pptx-browser'

const props = defineProps<{
  showPreview: boolean
  previewFile: PreviewFileInfo | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { getFileTypeLabel, openInBrowser } = useFileUtils()
const { finalizeHtml, cleanup } = useHtmlSandbox()

// 导出状态
const exporting = ref(false)

// HTML preview container ref
const htmlPreviewRef = ref<HTMLElement | null>(null)

// Render HTML when preview file changes
watch(() => props.previewFile, (newFile) => {
  if (newFile?.type === 'html' && newFile.content) {
    nextTick(() => {
      if (htmlPreviewRef.value) {
        try {
          finalizeHtml(newFile.content, htmlPreviewRef.value, {
            initialHeight: 400,
          })
        } catch (e) {
          console.error('[PreviewPanel] HTML render failed:', e)
        }
      }
    })
  }
}, { immediate: true })

// Cleanup on unmount (HTML sandbox cleanup + keyboard listener handled below)

// 判断是否为 markdown 文件
const isMarkdown = computed(() => {
  const type = props.previewFile?.type || ''
  return type === 'md' || type === 'markdown'
})

// 判断是否为 HTML 文件
const isHtml = computed(() => props.previewFile?.type === 'html')

// 判断是否为图片文件
const isImage = computed(() => isImageType(props.previewFile?.type || ''))

// 文档类型判断
const isDocx = computed(() => isDocxType(props.previewFile?.type || ''))
const isPptx = computed(() => isPptxType(props.previewFile?.type || ''))
const isExcel = computed(() => {
  const t = (props.previewFile?.type || '').toLowerCase()
  return t === 'xlsx' || t === 'xls'
})
const isPdf = computed(() => isPdfType(props.previewFile?.type || ''))

// ─── 代码文件检测与 Markdown 包装 ───────────────────────────
/** 支持语法高亮的代码文件类型 → markdown 语言标识映射 */
const CODE_LANG_MAP: Record<string, string> = {
  py: 'python', js: 'javascript', ts: 'typescript',
  json: 'json', css: 'css', xml: 'xml',
  sql: 'sql', yaml: 'yaml', yml: 'yaml',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  java: 'java', kt: 'kotlin', go: 'go',
  rs: 'rust', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
  rb: 'ruby', php: 'php', swift: 'swift',
  html: 'html', htm: 'html',
  dockerfile: 'dockerfile', makefile: 'makefile',
  toml: 'toml', ini: 'ini', cfg: 'ini',
  csv: 'csv', graphql: 'graphql',
  txt: 'text', log: 'text',
}

const isCodeFile = computed(() => {
  const type = (props.previewFile?.type || '').toLowerCase()
  return !!CODE_LANG_MAP[type] && !isImage.value && !isHtml.value && !isMarkdown.value
    && !isDocx.value && !isExcel.value && !isPptx.value && !isPdf.value
})

/** 将代码文件内容包装为 markdown 代码块，获得语法高亮 */
const codeAsMarkdown = computed(() => {
  if (!isCodeFile.value || !props.previewFile?.content) return ''
  const lang = CODE_LANG_MAP[(props.previewFile.type || '').toLowerCase()] || ''
  return '```' + lang + '\n' + props.previewFile.content + '\n```'
})

// ─── 文档预览状态 ────────────────────────────────────────────
const docLoading = ref(false)
const docError = ref<string | null>(null)

// 文档渲染模式：text-html / text-markdown / text-plain / binary / fallback
type DocRenderMode = 'text-html' | 'text-markdown' | 'text-plain' | 'binary' | 'fallback'
const docRenderMode = ref<DocRenderMode>('fallback')

// vue-office 二进制数据源（ArrayBuffer 传递给组件的 :src）
const docxBinarySrc = ref<ArrayBuffer | null>(null)
const excelBinarySrc = ref<ArrayBuffer | null>(null)
const pdfBinarySrc = ref<ArrayBuffer | null>(null)
const pptxBinarySrc = ref<ArrayBuffer | null>(null)

// PPTX 状态（pptx-browser canvas 渲染）
const pptxCanvasRef = ref<HTMLCanvasElement | null>(null)
const pptxSlideCount = ref(0)
const pptxCurrentSlide = ref(0)
let pptxRenderer: PptxRenderer | null = null
let pptxResizeObserver: ResizeObserver | null = null

/** 获取当前容器宽度（用于 canvas 渲染尺寸） */
function getPptxRenderWidth(): number {
  const parent = pptxCanvasRef.value?.parentElement
  if (!parent) return 960
  // getBoundingClientRect 更可靠，包含 sub-pixel 精度
  const w = Math.floor(parent.getBoundingClientRect().width)
  return w > 100 ? w : 960
}

/** 渲染当前幻灯片到 canvas */
async function renderCurrentSlide() {
  if (!pptxRenderer || !pptxCanvasRef.value) return
  const cssWidth = getPptxRenderWidth()
  const dpr = window.devicePixelRatio || 1
  // pptx-browser 不支持 DPR，所以我们渲染后用 CSS 缩放来保持清晰度
  console.log('[PreviewPanel] PPTX render: cssWidth =', cssWidth, 'dpr =', dpr)
  try {
    await pptxRenderer.renderSlide(pptxCurrentSlide.value, pptxCanvasRef.value, cssWidth)
    // pptx-browser 设置 canvas.width/height = cssWidth/scaledHeight
    // 在 Retina 屏幕上，用 CSS 保持显示尺寸，同时 canvas 属性保持像素分辨率
    const canvas = pptxCanvasRef.value
    if (canvas.width > 0 && canvas.height > 0) {
      // CSS 显示尺寸 = canvas attribute 尺寸（无缩放）
      // 这样 Retina 下会模糊，但不会变形
      canvas.style.width = canvas.width + 'px'
      canvas.style.height = canvas.height + 'px'
      console.log('[PreviewPanel] PPTX rendered:', canvas.width, 'x', canvas.height)
    }
  } catch (err) {
    console.error('[PreviewPanel] PPTX renderSlide failed:', err)
  }
}

/** pptx-browser 渲染入口 */
async function renderPptxBrowser(data: ArrayBuffer) {
  // 清理旧实例
  if (pptxRenderer) {
    try { pptxRenderer.destroy() } catch { /* ignore */ }
    pptxRenderer = null
  }
  if (pptxResizeObserver) {
    pptxResizeObserver.disconnect()
    pptxResizeObserver = null
  }

  // 先加载 PPTX 数据（不需要 canvas）
  try {
    pptxRenderer = new PptxRenderer()
    await pptxRenderer.load(data)
    pptxSlideCount.value = pptxRenderer.slideCount ?? 0
    pptxCurrentSlide.value = 0
  } catch (err) {
    console.error('[PreviewPanel] pptx-browser load 失败:', err)
    docError.value = 'PPTX 加载失败'
    docLoading.value = false
    return
  }

  // 关闭 loading，让 canvas 容器渲染到 DOM
  docLoading.value = false
  await nextTick()
  // 等待布局完全稳定（flex 计算完毕）
  await new Promise(resolve => setTimeout(resolve, 100))

  if (!pptxCanvasRef.value) {
    console.warn('[PreviewPanel] PPTX canvas 未挂载')
    return
  }

  // 渲染幻灯片
  await renderCurrentSlide()

  // 监听容器宽度变化，防抖重新渲染
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  pptxResizeObserver = new ResizeObserver(() => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => { renderCurrentSlide() }, 250)
  })
  const parent = pptxCanvasRef.value.parentElement
  if (parent) pptxResizeObserver.observe(parent)
}

/** 幻灯片导航 */
function pptxPrev() {
  if (pptxCurrentSlide.value > 0) {
    pptxCurrentSlide.value--
    renderCurrentSlide()
  }
}
function pptxNext() {
  if (pptxCurrentSlide.value < pptxSlideCount.value - 1) {
    pptxCurrentSlide.value++
    renderCurrentSlide()
  }
}

/** 判断内容是否为可读文本（非二进制占位符） */
function hasTextContent(file: PreviewFileInfo): boolean {
  return !!file.content && file.content.length > 10 && !file.content.startsWith('[文件]') && !file.content.startsWith('[图片预览]')
}

/** 检测文本内容是 HTML 还是 Markdown */
function detectTextFormat(content: string): 'html' | 'markdown' | 'plain' {
  const trimmed = content.trim()
  if (/^<[a-zA-Z][\s\S]*>/m.test(trimmed) && (/<html|<body|<head|<div|<table|<h[1-6]|<p[\s>]/i.test(trimmed))) {
    return 'html'
  }
  if (/^#{1,6}\s/m.test(trimmed) || /^\*\*|^__|^\-\s|^\>\s/m.test(trimmed) || /```/.test(trimmed)) {
    return 'markdown'
  }
  return 'plain'
}

/** base64 转 Uint8Array */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

/** base64 转 ArrayBuffer */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  return base64ToUint8Array(base64).buffer as ArrayBuffer
}

/** 读取文件 base64 数据（通过 Tauri 命令） */
async function readFileBase64(file: PreviewFileInfo): Promise<string | null> {
  if (file.filePath) {
    try {
      return await invoke<string>('read_image_base64', { path: file.filePath })
    } catch (e) {
      console.error('[PreviewPanel] 读取文件失败:', e)
      return null
    }
  }
  return null
}

/** 尝试读取文件为二进制 ArrayBuffer */
async function readFileAsArrayBuffer(file: PreviewFileInfo): Promise<ArrayBuffer | null> {
  try {
    const base64 = await readFileBase64(file)
    if (!base64) return null
    return base64ToArrayBuffer(base64)
  } catch { return null }
}

/** 尝试加载二进制 DOCX（vue-office/docx 渲染） */
async function loadDocxBinary(file: PreviewFileInfo): Promise<boolean> {
  const buf = await readFileAsArrayBuffer(file)
  if (!buf) return false
  docxBinarySrc.value = buf
  return true
}

/** 尝试加载二进制 Excel（vue-office/excel 渲染） */
async function loadExcelBinary(file: PreviewFileInfo): Promise<boolean> {
  const buf = await readFileAsArrayBuffer(file)
  if (!buf) return false
  excelBinarySrc.value = buf
  return true
}

/** 尝试加载二进制 PPTX（vue-office/pptx 渲染） */
async function loadPptxBinary(file: PreviewFileInfo): Promise<boolean> {
  const buf = await readFileAsArrayBuffer(file)
  if (!buf) return false
  pptxBinarySrc.value = buf
  return true
}

/** 尝试加载二进制 PDF（vue-office/pdf 渲染） */
async function loadPdfBinary(file: PreviewFileInfo): Promise<boolean> {
  const buf = await readFileAsArrayBuffer(file)
  if (!buf) return false
  pdfBinarySrc.value = buf
  return true
}

/** vue-office 组件渲染完成回调 */
function onOfficeRendered() {
  docLoading.value = false
}

/** vue-office 组件渲染失败回调 */
function onOfficeError(err: any) {
  console.error('[PreviewPanel] vue-office render error:', err)
  docError.value = '文档渲染失败'
  docLoading.value = false
}

/** 用系统应用打开文件 */
async function openDocInSystemApp() {
  if (!props.previewFile?.filePath) return
  try {
    const { openPath } = await import('@tauri-apps/plugin-opener')
    await openPath(props.previewFile.filePath)
  } catch (e) {
    ElMessage.error('无法打开系统应用')
  }
}

/** 核心：文档预览加载逻辑（text-first 策略） */
watch(() => props.previewFile, async (newFile) => {
  if (!newFile) return
  const t = newFile.type.toLowerCase()
  const isDoc = isDocxType(t) || isExcelType(t) || isPptxType(t) || isPdfType(t)
  if (!isDoc) return

  docLoading.value = true
  docError.value = null
  docRenderMode.value = 'fallback'
  docxBinarySrc.value = null
  excelBinarySrc.value = null
  pdfBinarySrc.value = null
  pptxBinarySrc.value = null

  // 策略 1：文本内容优先（agent 生成的文档）
  if (hasTextContent(newFile)) {
    const format = detectTextFormat(newFile.content)
    docRenderMode.value = format === 'html' ? 'text-html' : format === 'markdown' ? 'text-markdown' : 'text-plain'
    docLoading.value = false
    return
  }

  // 策略 2：二进制文件解析（run_command 生成的真实文件）
  let binaryOk = false
  if (newFile.filePath) {
    if (isDocxType(t)) binaryOk = await loadDocxBinary(newFile)
    else if (isExcelType(t) && (t === 'xlsx' || t === 'xls')) binaryOk = await loadExcelBinary(newFile)
    else if (isPptxType(t)) binaryOk = await loadPptxBinary(newFile)
    else if (isPdfType(t)) binaryOk = await loadPdfBinary(newFile)
  }
  if (binaryOk) {
    docRenderMode.value = 'binary'
  } else {
    docRenderMode.value = 'fallback'
  }
  docLoading.value = false

  // PPTX 需要在 canvas 挂载后调用 pptx-browser 渲染（docLoading=false 后 canvas 才可见）
  if (binaryOk && isPptxType(t) && pptxBinarySrc.value) {
    await renderPptxBrowser(pptxBinarySrc.value)
    return // renderPptxBrowser 内部已设置 docLoading = false
  }
}, { immediate: true })

// ─── 图片预览状态 ─────────────────────────────────────────
const imageUrl = ref<string | null>(null)
const imageLoading = ref(false)
const imageError = ref<string | null>(null)
const galleryIndex = ref(0)
const lightboxOpen = ref(false)

const galleryImages = computed(() => props.previewFile?.gallery || [])
const galleryCount = computed(() => galleryImages.value.length)
const hasGallery = computed(() => galleryCount.value > 1)
const currentGalleryImage = computed(() => galleryImages.value[galleryIndex.value] || null)

function getMimeTypeForImage(type: string): string {
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
  }
  return map[type] || 'image/png'
}

function isBinaryPlaceholder(content: string): boolean {
  return content.startsWith('[文件]') || content.startsWith('[图片预览]')
}

/** 加载图片数据 URL */
async function loadImage(file: PreviewFileInfo | null) {
  if (!file || !isImageType(file.type)) {
    imageUrl.value = null
    return
  }
  imageLoading.value = true
  imageError.value = null
  try {
    const current = currentGalleryImage.value
    const targetPath = current?.filePath || file.filePath
    const targetType = current?.type || file.type

    if (targetPath && isBinaryPlaceholder(file.content)) {
      // 二进制图片：通过 Tauri 读取 base64
      const base64 = await invoke<string>('read_image_base64', { path: targetPath })
      const mime = getMimeTypeForImage(targetType)
      imageUrl.value = `data:${mime};base64,${base64}`
    } else if (file.type === 'svg' && file.content && !isBinaryPlaceholder(file.content)) {
      // SVG 文本内容
      const encoded = encodeURIComponent(file.content)
      imageUrl.value = `data:image/svg+xml;charset=utf-8,${encoded}`
    } else if (file.content && !isBinaryPlaceholder(file.content)) {
      // 可能是 base64 或 URL
      if (file.content.startsWith('data:') || file.content.startsWith('http')) {
        imageUrl.value = file.content
      } else {
        // 尝试作为 base64
        const mime = getMimeTypeForImage(file.type)
        imageUrl.value = `data:${mime};base64,${file.content}`
      }
    } else {
      imageError.value = '无法加载图片'
    }
  } catch (e) {
    console.error('[PreviewPanel] Image load failed:', e)
    imageError.value = `加载失败: ${e}`
  } finally {
    imageLoading.value = false
  }
}

function galleryPrev() {
  if (galleryIndex.value > 0) {
    galleryIndex.value--
    loadImage(props.previewFile)
  }
}

function galleryNext() {
  if (galleryIndex.value < galleryCount.value - 1) {
    galleryIndex.value++
    loadImage(props.previewFile)
  }
}

function openLightbox() {
  lightboxOpen.value = true
}

function closeLightbox() {
  lightboxOpen.value = false
}

function lightboxPrev() {
  if (galleryIndex.value > 0) {
    galleryIndex.value--
    loadImage(props.previewFile)
  }
}

function lightboxNext() {
  if (galleryIndex.value < galleryCount.value - 1) {
    galleryIndex.value++
    loadImage(props.previewFile)
  }
}

// Watch for preview file changes → load image
watch(() => props.previewFile, (newFile) => {
  if (newFile && isImageType(newFile.type)) {
    galleryIndex.value = 0
    loadImage(newFile)
  } else {
    imageUrl.value = null
  }
}, { immediate: true })

// ESC 关闭 lightbox
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && lightboxOpen.value) closeLightbox()
  if (lightboxOpen.value) {
    if (e.key === 'ArrowLeft') lightboxPrev()
    if (e.key === 'ArrowRight') lightboxNext()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  if (htmlPreviewRef.value) {
    cleanup(htmlPreviewRef.value)
  }
  if (pptxResizeObserver) {
    pptxResizeObserver.disconnect()
    pptxResizeObserver = null
  }
  if (pptxRenderer) {
    try { pptxRenderer.destroy() } catch { /* ignore */ }
    pptxRenderer = null
  }
})

/** 在默认浏览器中打开 HTML 文件 */
function handleOpenInBrowser() {
  if (!props.previewFile?.content) return
  openInBrowser({
    content: props.previewFile.content,
    name: props.previewFile.name
  })
}

/** 文件类型 → MIME 映射 */
function getMimeType(type: string): string {
  const map: Record<string, string> = {
    html: 'text/html',
    md: 'text/markdown',
    markdown: 'text/markdown',
    js: 'text/javascript',
    ts: 'text/typescript',
    py: 'text/x-python',
    json: 'application/json',
    css: 'text/css',
    xml: 'text/xml',
    svg: 'image/svg+xml',
    csv: 'text/csv',
    sql: 'text/x-sql',
    yaml: 'text/yaml',
    yml: 'text/yaml',
    txt: 'text/plain',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
  }
  return map[type] || 'text/plain'
}

/** 下载原文件 */
function downloadOriginal() {
  if (!props.previewFile?.content) return
  const { name, type, content } = props.previewFile
  const mime = getMimeType(type)
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  ElMessage.success(`已下载: ${name}`)
}

/** 将 markdown 渲染到临时容器中并导出为 PDF */
async function exportPdf() {
  if (!props.previewFile?.content) return
  exporting.value = true
  try {
    // 1. 将 markdown 转为 HTML
    const htmlContent = marked.parse(props.previewFile.content, { async: false }) as string

    // 2. 创建临时渲染容器
    const container = document.createElement('div')
    container.style.cssText = `
      position: fixed; left: -9999px; top: 0;
      width: 800px; padding: 40px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 14px; line-height: 1.6; color: #24292e;
      background: white;
    `
    container.innerHTML = htmlContent

    // 注入基本样式
    const style = document.createElement('style')
    style.textContent = `
      h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; }
      h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
      h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
      code { background: #f6f8fa; padding: 0.2em 0.4em; border-radius: 3px; font-size: 85%; }
      pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow: auto; }
      pre code { background: transparent; padding: 0; }
      blockquote { border-left: 4px solid #dfe2e5; padding: 0 1em; color: #6a737d; margin: 0; }
      table { border-collapse: collapse; width: 100%; margin: 16px 0; }
      th, td { border: 1px solid #dfe2e5; padding: 6px 13px; }
      th { background: #f6f8fa; font-weight: 600; }
      img { max-width: 100%; }
    `
    container.prepend(style)
    document.body.appendChild(container)

    // 3. 使用 html2canvas 截图
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    })

    // 4. 生成 PDF
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 10

    // 计算图片在页面上的尺寸
    const imgWidth = pageWidth - margin * 2
    const imgHeight = (canvas.height * imgWidth) / canvas.width

    let heightLeft = imgHeight
    let position = margin
    const imgData = canvas.toDataURL('image/png')

    // 添加第一页
    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
    heightLeft -= (pageHeight - margin * 2)

    // 如果内容超过一页，添加更多页面
    while (heightLeft > 0) {
      position = heightLeft - imgHeight + margin
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
      heightLeft -= (pageHeight - margin * 2)
    }

    // 5. 保存 PDF
    const baseName = props.previewFile.name.replace(/\.(md|markdown)$/i, '')
    pdf.save(`${baseName}.pdf`)

    // 清理临时容器
    document.body.removeChild(container)
    ElMessage.success(`已导出: ${baseName}.pdf`)
  } catch (e) {
    console.error('[PreviewPanel] PDF 导出失败:', e)
    ElMessage.error('PDF 导出失败')
  } finally {
    exporting.value = false
  }
}

/** 导出为 DOCX（Word 兼容的 HTML 格式） */
async function exportDocx() {
  if (!props.previewFile?.content) return
  exporting.value = true
  try {
    const htmlContent = marked.parse(props.previewFile.content, { async: false }) as string
    // Word 兼容的 HTML 格式
    const docContent = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${props.previewFile?.name || 'Export'}</title>
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
</w:WordDocument>
</xml>
<![endif]-->
<style>
body { font-family: 'Microsoft YaHei', 'SimSun', Arial, sans-serif; font-size: 12pt; line-height: 1.5; }
h1 { font-size: 22pt; font-weight: bold; }
h2 { font-size: 18pt; font-weight: bold; }
h3 { font-size: 14pt; font-weight: bold; }
p { margin: 10pt 0; }
code { background: #f0f0f0; padding: 2pt 4pt; font-family: Consolas, monospace; font-size: 10pt; }
pre { background: #f6f8fa; padding: 10pt; border: 1px solid #ddd; font-family: Consolas, monospace; font-size: 10pt; }
pre code { background: transparent; padding: 0; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #000; padding: 5pt; }
th { background: #f0f0f0; }
blockquote { border-left: 3pt solid #ccc; padding-left: 10pt; margin-left: 0; color: #666; }
</style>
</head>
<body>
${htmlContent}
</body>
</html>`

    // 使用 agent_write_file 保存到当前工作目录
    const baseName = props.previewFile.name.replace(/\.(md|markdown)$/i, '')
    const filePath = `${baseName}.doc`

    await invoke('agent_write_file', { path: filePath, content: docContent })
    ElMessage.success(`已导出: ${filePath}`)
  } catch (e) {
    console.error('[PreviewPanel] DOCX 导出失败:', e)
    ElMessage.error('DOCX 导出失败')
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div v-if="showPreview" class="preview-panel">
    <div class="preview-header">
      <div class="preview-title-area">
        <span class="preview-file-name">{{ hasGallery ? currentGalleryImage?.name || previewFile?.name : previewFile?.name }}</span>
        <span class="preview-file-type">{{ getFileTypeLabel((hasGallery ? currentGalleryImage?.type : previewFile?.type) || '') }}</span>
      </div>
      <div class="preview-header-actions">
        <!-- 在浏览器中打开（仅 HTML） -->
        <button v-if="isHtml" class="preview-action-btn" title="在默认浏览器中打开" @click="handleOpenInBrowser">
          <i class="fa-solid fa-arrow-up-right-from-square"></i>
          <span>浏览器打开</span>
        </button>
        <!-- 用系统应用打开（文档类型） -->
        <button v-if="(isDocx || isExcel || isPptx || isPdf) && previewFile?.filePath" class="preview-action-btn" title="用系统应用打开" @click="openDocInSystemApp">
          <i class="fa-solid fa-arrow-up-right-from-square"></i>
          <span>系统打开</span>
        </button>
        <!-- 下载原文件按钮（所有类型都显示） -->
        <button class="preview-action-btn" title="下载原文件" @click="downloadOriginal">
          <i class="fa-solid fa-download"></i>
          <span>下载</span>
        </button>
        <!-- Markdown 导出按钮 -->
        <template v-if="isMarkdown">
          <button class="preview-action-btn" title="导出为 PDF" :disabled="exporting" @click="exportPdf">
            <i class="fa-solid fa-file-pdf"></i>
            <span>PDF</span>
          </button>
          <button class="preview-action-btn" title="导出为 Word 文档" :disabled="exporting" @click="exportDocx">
            <i class="fa-solid fa-file-word"></i>
            <span>DOCX</span>
          </button>
        </template>
        <button class="preview-close-btn" @click="emit('close')">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>
    <div class="preview-body">
      <!-- HTML preview with sandboxed iframe -->
      <div
        v-if="previewFile?.type === 'html'"
        ref="htmlPreviewRef"
        class="preview-html-sandbox"
      ></div>
      <!-- 图片预览 -->
      <div v-else-if="isImage" class="preview-image">
        <div v-if="imageLoading" class="image-loading">
          <i class="fa-solid fa-spinner fa-spin"></i>
          <span>加载中...</span>
        </div>
        <div v-else-if="imageError" class="image-error">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>{{ imageError }}</span>
        </div>
        <template v-else-if="imageUrl">
          <!-- 画廊导航（多张图片时显示） -->
          <div v-if="hasGallery" class="gallery-nav-top">
            <button class="gallery-nav-btn" :disabled="galleryIndex === 0" @click="galleryPrev">
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <span class="gallery-counter">{{ galleryIndex + 1 }} / {{ galleryCount }}</span>
            <button class="gallery-nav-btn" :disabled="galleryIndex === galleryCount - 1" @click="galleryNext">
              <i class="fa-solid fa-chevron-right"></i>
            </button>
          </div>
          <!-- 图片容器 -->
          <div class="image-container" @click="openLightbox">
            <img :src="imageUrl" :alt="previewFile?.name" class="preview-img" />
            <div class="image-zoom-hint">
              <i class="fa-solid fa-magnifying-glass-plus"></i>
              <span>点击放大</span>
            </div>
          </div>
        </template>
      </div>
      <!-- 文档文件预览（DOCX/XLSX/PPTX/PDF） -->
      <div v-else-if="isDocx || isExcel || isPptx || isPdf" class="preview-document">
        <!-- 加载中 -->
        <div v-if="docLoading" class="doc-loading">
          <i class="fa-solid fa-spinner fa-spin"></i>
          <span>正在解析文件...</span>
        </div>
        <!-- 文本内容模式：HTML（用 Office 页面样式包装） -->
        <div v-else-if="docRenderMode === 'text-html'" class="office-page">
          <div class="office-page-inner docx-content" v-html="previewFile?.content"></div>
        </div>
        <!-- 文本内容模式：Markdown（用 Office 页面样式包装） -->
        <div v-else-if="docRenderMode === 'text-markdown'" class="office-page">
          <div class="office-page-inner preview-markdown">
            <MarkdownRenderer :content="previewFile?.content || ''" />
          </div>
        </div>
        <!-- 文本内容模式：纯文本（用 Office 页面样式包装） -->
        <div v-else-if="docRenderMode === 'text-plain'" class="office-page">
          <div class="office-page-inner preview-doc-content"><pre>{{ previewFile?.content }}</pre></div>
        </div>
        <!-- 二进制模式：DOCX（vue-office 真实 Word 渲染） -->
        <div v-else-if="docRenderMode === 'binary' && isDocx && docxBinarySrc" class="office-binary-wrap">
          <VueOfficeDocx :src="docxBinarySrc" @rendered="onOfficeRendered" @error="onOfficeError" />
        </div>
        <!-- 二进制模式：Excel（vue-office 真实 Excel 渲染） -->
        <div v-else-if="docRenderMode === 'binary' && isExcel && excelBinarySrc" class="office-binary-wrap office-binary-excel">
          <VueOfficeExcel :src="excelBinarySrc" @rendered="onOfficeRendered" @error="onOfficeError" />
        </div>
        <!-- 二进制模式：PPTX（pptx-browser canvas 渲染） -->
        <div v-else-if="docRenderMode === 'binary' && isPptx && pptxBinarySrc" class="office-binary-wrap office-binary-pptx">
          <!-- 幻灯片导航栏 -->
          <div v-if="pptxSlideCount > 1" class="pptx-nav">
            <button class="pptx-nav-btn" :disabled="pptxCurrentSlide === 0" @click="pptxPrev">
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <span class="pptx-nav-counter">{{ pptxCurrentSlide + 1 }} / {{ pptxSlideCount }}</span>
            <button class="pptx-nav-btn" :disabled="pptxCurrentSlide >= pptxSlideCount - 1" @click="pptxNext">
              <i class="fa-solid fa-chevron-right"></i>
            </button>
          </div>
          <!-- Canvas 渲染区域 -->
          <div class="pptx-canvas-wrap">
            <canvas ref="pptxCanvasRef" class="pptx-canvas"></canvas>
          </div>
          <!-- 渲染失败提示 -->
          <div v-if="docError" class="doc-fallback">
            <div class="doc-fallback-icon"><i class="fa-solid fa-file-powerpoint"></i></div>
            <p class="doc-fallback-text">PPTX 渲染失败</p>
            <button v-if="previewFile?.filePath" class="doc-fallback-btn" @click="openDocInSystemApp">
              <i class="fa-solid fa-arrow-up-right-from-square"></i>
              <span>用系统应用打开</span>
            </button>
          </div>
        </div>
        <!-- 二进制模式：PDF（vue-office 真实 PDF 渲染） -->
        <div v-else-if="docRenderMode === 'binary' && isPdf && pdfBinarySrc" class="office-binary-wrap office-binary-pdf">
          <VueOfficePdf :src="pdfBinarySrc" @rendered="onOfficeRendered" @error="onOfficeError" />
        </div>
        <!-- Fallback：无法预览，提供系统打开 -->
        <div v-else class="doc-fallback">
          <div class="doc-fallback-icon">
            <i :class="previewFile?.type === 'pdf' ? 'fa-solid fa-file-pdf' : previewFile?.type === 'xlsx' || previewFile?.type === 'xls' ? 'fa-solid fa-file-excel' : previewFile?.type === 'pptx' || previewFile?.type === 'ppt' ? 'fa-solid fa-file-powerpoint' : 'fa-solid fa-file-word'"></i>
          </div>
          <p class="doc-fallback-text">此文件无法在应用内预览</p>
          <button v-if="previewFile?.filePath" class="doc-fallback-btn" @click="openDocInSystemApp">
            <i class="fa-solid fa-arrow-up-right-from-square"></i>
            <span>用系统应用打开</span>
          </button>
        </div>
      </div>
      <!-- Markdown预览 -->
      <div v-else-if="previewFile?.type === 'md' || previewFile?.type === 'markdown'" class="preview-markdown">
        <MarkdownRenderer :content="previewFile.content" />
      </div>
      <!-- 代码文件预览（使用 MarkdownRenderer 获得语法高亮） -->
      <div v-else-if="isCodeFile" class="preview-code">
        <MarkdownRenderer :content="codeAsMarkdown" theme="dark" />
      </div>
      <!-- 其他文件纯文本预览 -->
      <div v-else class="preview-doc">
        <div class="preview-doc-content">
          <pre>{{ previewFile?.content }}</pre>
        </div>
      </div>
    </div>

    <!-- ===== 图片灯箱（Lightbox） ===== -->
    <Transition name="lightbox-fade">
      <div v-if="lightboxOpen && imageUrl" class="image-lightbox" @click.self="closeLightbox">
        <button class="lightbox-close" @click="closeLightbox" title="关闭 (ESC)">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <!-- 画廊导航 -->
        <template v-if="hasGallery">
          <button
            class="lightbox-nav lightbox-nav-prev"
            :disabled="galleryIndex === 0"
            @click.stop="lightboxPrev"
          >
            <i class="fa-solid fa-chevron-left"></i>
          </button>
          <button
            class="lightbox-nav lightbox-nav-next"
            :disabled="galleryIndex === galleryCount - 1"
            @click.stop="lightboxNext"
          >
            <i class="fa-solid fa-chevron-right"></i>
          </button>
          <div class="lightbox-counter">{{ galleryIndex + 1 }} / {{ galleryCount }}</div>
        </template>
        <div class="lightbox-image-wrap" @click.stop>
          <img :src="imageUrl" :alt="currentGalleryImage?.name || previewFile?.name" class="lightbox-img" />
        </div>
        <div class="lightbox-filename">{{ hasGallery ? currentGalleryImage?.name : previewFile?.name }}</div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/task/preview-panel';
</style>
