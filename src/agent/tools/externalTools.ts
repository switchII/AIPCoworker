/**
 * 外部工具（技能注入）— 定义与执行器。
 *
 * 外部工具由用户在 NewTask 页面选择的技能动态注入，
 * 不同的技能组合会提供不同的额工具集。
 * 例如 code-review 技能注入 search_files / find_in_files，
 * file-ops 技能注入 edit_file。
 *
 * 当前所有执行器为桩实现，后续接入 Tauri 后端替换。
 */

import type { ToolDefinition } from '../llm/llmClient'
import type { ToolResult } from '../core/reactAgent'

// ─── 工具定义 ──────────────────────────────────────────────

/**
 * 根据技能名称列表构建外部（技能注入）工具定义。
 * 不同技能可注入不同工具，与内置工具互补。
 */
export function buildExternalToolDefinitions(skillNames: string[]): ToolDefinition[] {
  const tools: ToolDefinition[] = []

  for (const skill of skillNames) {
    switch (skill) {
      case 'web-search':
        // web_search 已在内置工具中，此处不重复添加
        break

      case 'code-review':
        tools.push({
          type: 'function',
          function: {
            name: 'search_files',
            description: '在目录中按模式搜索文件',
            parameters: {
              type: 'object',
              properties: {
                pattern: { type: 'string', description: '文件名匹配模式（glob）' },
                path: { type: 'string', description: '搜索的根目录' },
              },
              required: ['pattern'],
            },
          },
        })
        tools.push({
          type: 'function',
          function: {
            name: 'find_in_files',
            description: '在文件内容中搜索指定文本',
            parameters: {
              type: 'object',
              properties: {
                text: { type: 'string', description: '要搜索的文本' },
                path: { type: 'string', description: '搜索目录' },
              },
              required: ['text'],
            },
          },
        })
        break

      case 'file-ops':
        // read_file, write_file, list_directory 已在内置工具中
        tools.push({
          type: 'function',
          function: {
            name: 'edit_file',
            description: '对文件进行局部编辑（查找替换）',
            parameters: {
              type: 'object',
              properties: {
                path: { type: 'string', description: '文件路径' },
                old_text: { type: 'string', description: '要替换的文本' },
                new_text: { type: 'string', description: '替换为的新文本' },
              },
              required: ['path', 'old_text', 'new_text'],
            },
          },
        })
        break
    }
  }

  return tools
}

// ─── 工具执行器 ────────────────────────────────────────────

/**
 * 执行单个外部（技能注入）工具。
 * 目前为桩实现 — 后续接入真实的文件系统 / 搜索能力。
 *
 * @returns ToolResult，如果工具名称不属于外部工具则返回 null
 */
export async function executeExternalTool(
  name: string,
  args: Record<string, unknown>,
  _workDir: string,
): Promise<ToolResult | null> {
  switch (name) {
    case 'search_files': {
      const pattern = args.pattern as string
      return { success: true, output: `[桩实现] 搜索文件: ${pattern}` }
    }
    case 'find_in_files': {
      const text = args.text as string
      return { success: true, output: `[桩实现] 内容搜索: ${text}` }
    }
    case 'edit_file': {
      const path = args.path as string
      return { success: true, output: `[桩实现] 编辑文件: ${path}` }
    }
    default:
      // 不是外部工具，返回 null 让调用方继续查找
      return null
  }
}
