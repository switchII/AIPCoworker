import type { ExecutionBlock, ExecutionStep, WebSearchResult } from '../../../types/agent'

/**
 * Block/step display helpers extracted from TaskView.vue.
 * These are pure functions — no side effects, no reactive state.
 */
export function useBlockHelpers() {
  function toggleBlock(block: ExecutionBlock) {
    block.expanded = !block.expanded
  }

  function toggleStepResult(step: ExecutionStep) {
    step.resultExpanded = !step.resultExpanded
  }

  function toggleSearchResultContent(result: WebSearchResult | any) {
    result.contentExpanded = !result.contentExpanded
  }

  function getStatusIconClass(status: string): string {
    if (status === 'failed') return 'fa-solid fa-xmark'
    if (status === 'running') return 'fa-solid fa-spinner fa-spin'
    return 'fa-solid fa-check'
  }

  /** 获取步骤的统一图标：工具/MCP 调用统一用 screwdriver-wrench，其余按类型区分 */
  function getStepIcon(step: { type: string; target?: string }): string {
    // 所有工具调用和 MCP 执行统一用 screwdriver-wrench
    const toolTypes = new Set([
      'command', 'file_read', 'file_write', 'code_edit', 'document',
      'mcp_execute', 'method_exec', 'file_gen',
    ])
    if (toolTypes.has(step.type)) return 'fa-solid fa-screwdriver-wrench'
    if (step.type === 'web_search') return 'fa-solid fa-globe'
    return 'fa-solid fa-circle'
  }

  function getComplexStepIcon(type: string): string {
    // 工具/MCP 调用统一用 screwdriver-wrench
    const toolTypes = new Set([
      'command', 'file_read', 'file_write', 'code_edit', 'document',
      'mcp_execute', 'method_exec', 'file_gen',
    ])
    if (toolTypes.has(type)) return 'fa-solid fa-screwdriver-wrench'
    if (type === 'web_search') return 'fa-solid fa-globe'
    return 'fa-solid fa-circle'
  }

  function getComplexStepLabel(type: string): string {
    const map: Record<string, string> = {
      'code_edit': '代码编辑',
      'document': '文档生成',
      'file_read': '文件查看',
      'file_write': '文件写入',
      'web_search': '网页搜索',
      'mcp_execute': '方法执行',
      'file_gen': '文件生成',
      'command': '命令执行',
      'method_exec': '方法执行',
    }
    return map[type] || type
  }

  function toggleFolder(file: any) {
    file.expanded = !file.expanded
  }

  function toggleMcpResult(block: any) {
    block.resultExpanded = !block.resultExpanded
  }

  function togglePlanOutput(block: ExecutionBlock) {
    block.resultExpanded = !block.resultExpanded
  }

  function isMcpLargeResult(result: string | undefined): boolean {
    if (!result) return false
    return result.includes('\n') || result.length > 120
  }

  return {
    toggleBlock,
    toggleStepResult,
    toggleSearchResultContent,
    getStatusIconClass,
    getStepIcon,
    getComplexStepIcon,
    getComplexStepLabel,
    toggleFolder,
    toggleMcpResult,
    togglePlanOutput,
    isMcpLargeResult,
  }
}
