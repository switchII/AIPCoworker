/**
 * 代码块渲染器注册表
 *
 * 将 Markdown 中的特殊代码块（html/svg/mermaid）分发到专用渲染组件，
 * 实现可扩展的插件式渲染架构。
 *
 * 添加新渲染器步骤：
 * 1. 创建 Vue 组件，接收 { code: string } props
 * 2. 调用 registerCodeRenderer('language', Component)
 * 3. MarkdownRenderer 会自动识别并使用对应组件
 */
import { type DefineComponent, markRaw } from 'vue'

/** 注册到 codeRendererRegistry 的渲染组件类型 */
export type CodeRendererComponent = DefineComponent<{ code: string }>

export interface CodeRendererEntry {
  /** Vue 组件（使用 markRaw 防止响应式代理） */
  component: CodeRendererComponent
}

/** 语言 → 渲染组件 映射表 */
const registry = new Map<string, CodeRendererEntry>()

/**
 * 注册代码块渲染器。
 * @param language 代码块语言标识（如 'html', 'svg', 'mermaid'）
 * @param component Vue 组件，接收 { code: string } props
 */
export function registerCodeRenderer(
  language: string,
  component: CodeRendererComponent
): void {
  registry.set(language.toLowerCase(), { component: markRaw(component) })
}

/** 查询已注册的渲染器 */
export function getCodeRenderer(language: string): CodeRendererEntry | undefined {
  return registry.get(language.toLowerCase())
}

/** 判断语言是否已注册 */
export function hasCodeRenderer(language: string): boolean {
  return registry.has(language.toLowerCase())
}
