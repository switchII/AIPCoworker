import { ref } from 'vue'

/**
 * 代码弹窗 / 复制 / 下载工具函数。
 * 用于显示代码、步骤结果或 HTML 预览的 ExecutionBlock 类组件。
 */
export function useCodeActions() {
  const codePopupVisible = ref(false)
  const codePopupData = ref<{
    code: string
    language: string
    fileName: string
    isHtml: boolean
  }>({
    code: '',
    language: '',
    fileName: '',
    isHtml: false,
  })
  const codePopupPreviewMode = ref(false)

  /** 复制确认的 Toast 状态，所有消费者共享 */
  const codeCopyToast = ref(false)

  function showCopyToast() {
    codeCopyToast.value = true
    setTimeout(() => { codeCopyToast.value = false }, 2000)
  }

  function copyCode(code: string | undefined) {
    if (!code) return
    navigator.clipboard.writeText(code).then(showCopyToast)
  }

  function downloadCode(code: string | undefined, fileName: string) {
    if (!code) return
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName || 'code.txt'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function openCodePopup(code: string | undefined, language: string, fileName: string) {
    if (!code) return
    codePopupData.value = {
      code,
      language,
      fileName,
      isHtml: language === 'html' || fileName.endsWith('.html'),
    }
    codePopupPreviewMode.value = false
    codePopupVisible.value = true
  }

  /**
   * 打开代码弹窗并立即切换到预览模式。
   * 用于默认显示 iframe 视图的“预览”按钮。
   */
  function openCodePopupPreview(code: string | undefined, language: string, fileName: string) {
    openCodePopup(code, language, fileName)
    codePopupPreviewMode.value = true
  }

  function closeCodePopup() {
    codePopupVisible.value = false
    codePopupPreviewMode.value = false
  }

  function toggleCodePopupPreview() {
    codePopupPreviewMode.value = !codePopupPreviewMode.value
  }

  function isHtmlContent(code: string | undefined): boolean {
    if (!code) return false
    return /<html|<div|<style|<body|<!DOCTYPE/i.test(code)
  }

  function getFileNameFromStep(step: any): string {
    if (step?.target) return step.target
    if (step?.label) return step.label.replace(/[^\w.\-]/g, '_').substring(0, 30) + '.txt'
    return 'output.txt'
  }

  // ===== iframe 高度自动调整 =====
  // 注意：高度调整现在由 useHtmlSandbox 的 postMessage 协议处理。
  // 此函数保留用于向后兼容，但为空操作。
  function onIframeLoad(_event: Event) {
    // 空操作：高度现在通过 useHtmlSandbox 中的 postMessage 管理
  }

  return {
    codePopupVisible,
    codePopupData,
    codePopupPreviewMode,
    codeCopyToast,
    copyCode,
    downloadCode,
    openCodePopup,
    openCodePopupPreview,
    closeCodePopup,
    toggleCodePopupPreview,
    isHtmlContent,
    getFileNameFromStep,
    onIframeLoad,
    showCopyToast,
  }
}
