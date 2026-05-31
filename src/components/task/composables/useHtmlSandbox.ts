import { onUnmounted } from 'vue'

// ---------------------------------------------------------------------------
// 外部资源 CDN 白名单
// ---------------------------------------------------------------------------
const CDN_ALLOWLIST = [
  'https://cdnjs.cloudflare.com',
  'https://cdn.jsdelivr.net',
  'https://unpkg.com',
  'https://esm.sh',
].join(' ')

// iframe 最大高度限制，防止内容无限增长
const MAX_IFRAME_HEIGHT = 4000

// 预览更新节流间隔（约 7fps）
const PREVIEW_INTERVAL = 150

// ---------------------------------------------------------------------------
// 注入到 iframe 中的基础样式
// ---------------------------------------------------------------------------
const BASE_STYLES = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: auto !important; min-height: 0 !important; }
body {
  font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 14px; line-height: 1.6;
  color: #1f2937; background: #fff; padding: 16px; overflow: hidden;
}
button {
  cursor: pointer; font-family: inherit;
  border: 1px solid #e5e7eb; border-radius: 6px;
  padding: 6px 12px; background: #fff; color: #374151;
  font-size: 13px; transition: background 0.15s;
}
button:hover { background: #f3f4f6; }
button:active { transform: scale(0.98); }
input[type="range"] { accent-color: #4f46e5; }
`

// ---------------------------------------------------------------------------
// 接收器页面 HTML —— 仅加载一次到 iframe.srcdoc，后续所有更新通过 postMessage 传递
// ---------------------------------------------------------------------------
const RECEIVER_HTML = `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' ${CDN_ALLOWLIST}; style-src 'unsafe-inline'; img-src data: blob: ${CDN_ALLOWLIST}; media-src data: blob: ${CDN_ALLOWLIST}; connect-src ${CDN_ALLOWLIST}; font-src ${CDN_ALLOWLIST};">
<style>${BASE_STYLES}</style>
</head><body>
<script>
(function(){
  var lastH=0, first=true;
  function reportHeight(){
    var h=document.documentElement.scrollHeight;
    if(h!==lastH){lastH=h;
      window.parent.postMessage({type:'html-sandbox-resize',height:h,first:first},'*');
      first=false;
    }
  }
  new MutationObserver(reportHeight).observe(document.body,{childList:true,subtree:true,attributes:true,characterData:true});
  new ResizeObserver(reportHeight).observe(document.documentElement);
  window.addEventListener('load',reportHeight);

  // Intercept link clicks - open in new tab via parent
  document.addEventListener('click',function(e){
    var a=e.target&&e.target.closest?e.target.closest('a'):null;
    if(a&&a.href){e.preventDefault();
      window.parent.postMessage({type:'html-sandbox-link',url:a.href},'*');
    }
  });

  window.addEventListener('message',function(e){
    if(!e.data)return;

    // Streaming preview update (scripts stripped)
    if(e.data.type==='widget:update'){
      document.body.innerHTML=e.data.html;
      // Prefetch external scripts for faster finalize
      if(e.data.scripts){
        e.data.scripts.forEach(function(src){
          if(!document.querySelector('link[href="'+src+'"]')){
            var link=document.createElement('link');
            link.rel='prefetch';link.as='script';link.href=src;
            document.head.appendChild(link);
          }
        });
      }
      reportHeight();
    }

    // Final render with full script execution
    if(e.data.type==='widget:finalize'){
      var tmp=document.createElement('div');
      tmp.innerHTML=e.data.html;
      var scripts=[];
      tmp.querySelectorAll('script').forEach(function(s){
        scripts.push({src:s.src,text:s.textContent,type:s.type});s.remove();
      });
      var cur=document.createElement('div');
      cur.innerHTML=document.body.innerHTML;
      cur.querySelectorAll('script').forEach(function(s){s.remove();});
      if(tmp.innerHTML!==cur.innerHTML){document.body.innerHTML=tmp.innerHTML;}

      // Chain script execution: external scripts must load before inline scripts
      function runNext(i){
        if(i>=scripts.length){
          window.dispatchEvent(new Event('load'));
          setTimeout(reportHeight,100);
          return;
        }
        var s=scripts[i];var el=document.createElement('script');
        if(s.type) el.type=s.type;
        if(s.src){
          el.src=s.src;
          el.onload=function(){reportHeight();runNext(i+1);};
          el.onerror=function(){runNext(i+1);}; // Continue on error
          document.body.appendChild(el);
        }else{
          try{
            el.textContent=s.text;
            document.body.appendChild(el);
          }catch(err){console.error('[HtmlSandbox] Script error:',err);}
          reportHeight();
          runNext(i+1);
        }
      }
      runNext(0);
    }
  });
})();
</script>
</body></html>`

// ---------------------------------------------------------------------------
// 基于 WeakMap 的状态跟踪（可跨组件重新挂载保持）
// ---------------------------------------------------------------------------
const iframeMap = new WeakMap<HTMLElement, HTMLIFrameElement>()
const readyMap = new WeakMap<HTMLIFrameElement, boolean>()
const bufferMap = new WeakMap<HTMLIFrameElement, { type: string; html: string; scripts?: string[] }>()
const listenerMap = new WeakMap<HTMLElement, (e: MessageEvent) => void>()

// 高度缓存，防止组件重新挂载时出现 0→实际高度的跳变
const heightCache = new Map<string, number>()
const HEIGHT_CACHE_MAX = 100

function hKey(code: string): string {
  return code.substring(0, 200)
}

function setHeightCache(key: string, h: number) {
  if (heightCache.size >= HEIGHT_CACHE_MAX) {
    const first = heightCache.keys().next().value
    if (first !== undefined) heightCache.delete(first)
  }
  heightCache.set(key, h)
}

// ---------------------------------------------------------------------------
// HTML 消毒/净化工具函数
// ---------------------------------------------------------------------------

/** 检查 HTML 是否包含可见内容（排除纯 style/script/meta 标签） */
export function hasVisibleContent(html: string): boolean {
  const stripped = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(meta|link|title)[^>]*>/gi, '')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .trim()
  return stripped.length > 0
}

/** 对流式传输中的 HTML 进行消毒 —— 移除脚本和不安全属性 */
export function sanitizeForStreaming(html: string): string {
  // 移除完整的 <script>...</script> 块
  let safe = html.replace(/<script[\s\S]*?<\/script>/gi, '')

  // 截断未闭合的 <script 标签，防止原始 JS 作为文本泄露
  const lastOpen = safe.lastIndexOf('<script')
  if (lastOpen !== -1 && !/<\/script>/i.test(safe.substring(lastOpen))) {
    safe = safe.substring(0, lastOpen)
  }

  // 剥离内联事件处理器（如 onclick="..."）
  safe = safe.replace(/\s(on\w+)="[^"]*"/gi, '')

  // 将空的 <canvas> 替换为加载占位符（图表需要脚本来渲染）
  safe = safe.replace(
    /<canvas([^>]*)><\/canvas>/gi,
    '<div$1 style="display:flex;align-items:center;justify-content:center;min-height:200px;background:#f3f4f6;border-radius:8px;color:#6b7280;font-size:13px;">图表加载中…</div>'
  )

  return safe
}

/** 提取外部脚本 URL 用于预取 */
export function extractScriptUrls(html: string): string[] {
  const urls: string[] = []
  const re = /<script[^>]+src=["']([^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) urls.push(m[1])
  return urls
}

// ---------------------------------------------------------------------------
// iframe 生命周期管理
// ---------------------------------------------------------------------------

export interface HtmlSandboxOptions {
  /** iframe 高度变化时的回调 */
  onHeightChange?: (height: number) => void
  /** iframe 内链接被点击时的回调 */
  onLinkClick?: (url: string) => void
  /** 无缓存时的初始高度 */
  initialHeight?: number
}

/**
 * 获取或创建沙箱化 iframe 用于 HTML 渲染。
 * iframe 使用 postMessage 协议进行所有通信。
 */
export function getOrCreateIframe(
  container: HTMLElement,
  code: string,
  options: HtmlSandboxOptions = {}
): HTMLIFrameElement {
  const existing = iframeMap.get(container)
  if (existing && existing.isConnected) return existing

  // 清理过期引用
  if (existing) {
    const oldListener = listenerMap.get(container)
    if (oldListener) {
      window.removeEventListener('message', oldListener)
      listenerMap.delete(container)
    }
    iframeMap.delete(container)
  }

  const iframe = document.createElement('iframe')
  iframe.setAttribute('sandbox', 'allow-scripts')
  iframe.srcdoc = RECEIVER_HTML
  iframe.style.cssText = 'width:100%;border:none;overflow:hidden;display:block;background:#fff;'

  // 使用缓存高度或默认值
  const cached = heightCache.get(hKey(code))
  iframe.style.height = cached ? `${cached}px` : `${options.initialHeight || 60}px`

  // 高度和链接消息处理器
  const onMessage = (e: MessageEvent) => {
    if (e.source !== iframe.contentWindow) return
    const d = e.data
    if (d?.type === 'html-sandbox-resize' && typeof d.height === 'number') {
      const h = Math.min(d.height, MAX_IFRAME_HEIGHT)
      iframe.style.transition = 'none'
      iframe.style.height = `${h}px`
      setHeightCache(hKey(code), h)
      options.onHeightChange?.(h)
    }
    if (d?.type === 'html-sandbox-link' && typeof d.url === 'string') {
      if (options.onLinkClick) {
        options.onLinkClick(d.url)
      } else {
        window.open(d.url, '_blank', 'noopener')
      }
    }
  }
  window.addEventListener('message', onMessage)
  listenerMap.set(container, onMessage)

  // OnLoad 处理器 —— 刷新缓冲的消息
  iframe.onload = () => {
    readyMap.set(iframe, true)
    const buf = bufferMap.get(iframe)
    if (buf) {
      iframe.contentWindow?.postMessage(buf, '*')
      bufferMap.delete(iframe)
    }
  }

  container.appendChild(iframe)
  iframeMap.set(container, iframe)
  return iframe
}

/** 向 iframe 发送消息，若未就绪则缓冲 */
export function sendToIframe(
  iframe: HTMLIFrameElement,
  type: 'widget:update' | 'widget:finalize',
  html: string,
  extra?: Record<string, unknown>
) {
  const msg = { type, html, ...extra }
  if (readyMap.get(iframe)) {
    iframe.contentWindow?.postMessage(msg, '*')
  } else {
    bufferMap.set(iframe, msg as any)
  }
}

/** 清理 iframe 及其监听器 */
export function cleanupIframe(container: HTMLElement) {
  const onMessage = listenerMap.get(container)
  if (onMessage) {
    window.removeEventListener('message', onMessage)
    listenerMap.delete(container)
  }
  const iframe = iframeMap.get(container)
  if (iframe) {
    readyMap.delete(iframe)
    bufferMap.delete(iframe)
  }
  iframeMap.delete(container)
}

// ---------------------------------------------------------------------------
// Vue 组合式函数
// ---------------------------------------------------------------------------

/** 节流预览状态 */
let lastPreviewTime = 0
let pendingPreview: ReturnType<typeof setTimeout> | undefined

/**
 * 用于安全 HTML 沙箱渲染的 Vue 组合式函数。
 * 提供流式预览和最终渲染能力。
 */
export function useHtmlSandbox() {
  // 组件卸载时清理
  onUnmounted(() => {
    if (pendingPreview) {
      clearTimeout(pendingPreview)
      pendingPreview = undefined
    }
  })

  /**
   * 向 iframe 发送流式预览更新。
   * 节流至约 7fps 以防止闪烁。
   * 若 HTML 尚无可见内容则返回 false。
   */
  function previewHtml(
    code: string,
    container: HTMLElement | null,
    options: HtmlSandboxOptions = {}
  ): boolean {
    if (!container || !hasVisibleContent(code)) return false

    const iframe = getOrCreateIframe(container, code, options)
    const now = Date.now()

    const doSend = () => {
      lastPreviewTime = Date.now()
      const scripts = extractScriptUrls(code)
      sendToIframe(iframe, 'widget:update', sanitizeForStreaming(code),
        scripts.length > 0 ? { scripts } : undefined)
    }

    if (now - lastPreviewTime >= PREVIEW_INTERVAL) {
      if (pendingPreview) {
        clearTimeout(pendingPreview)
        pendingPreview = undefined
      }
      doSend()
    } else if (!pendingPreview) {
      pendingPreview = setTimeout(() => {
        pendingPreview = undefined
        doSend()
      }, PREVIEW_INTERVAL - (now - lastPreviewTime))
    }

    return true
  }

  /**
   * 执行最终渲染，包含完整的脚本执行。
   */
  function finalizeHtml(
    code: string,
    container: HTMLElement | null,
    options: HtmlSandboxOptions = {}
  ): void {
    if (!container) return
    const iframe = getOrCreateIframe(container, code, options)
    sendToIframe(iframe, 'widget:finalize', code)
  }

  /**
   * 清理 iframe 资源。
   */
  function cleanup(container: HTMLElement | null): void {
    if (container) {
      cleanupIframe(container)
    }
  }

  return {
    previewHtml,
    finalizeHtml,
    cleanup,
    // 暴露工具函数供外部直接使用
    hasVisibleContent,
    sanitizeForStreaming,
    extractScriptUrls,
    getOrCreateIframe,
    sendToIframe,
    cleanupIframe,
  }
}

// 导出常量供外部使用
export { RECEIVER_HTML, BASE_STYLES, CDN_ALLOWLIST, MAX_IFRAME_HEIGHT }
