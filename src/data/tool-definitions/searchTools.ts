/**
 * 搜索类工具定义
 * 包含：Glob 模式搜索、全文搜索（ripgrep）
 */
import type { ToolDefinition } from '../../agent/llm/llmClient'

export const globSearchTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'glob_search',
    description:
      '按 glob 模式在指定目录下搜索文件和目录（如 **/*.ts, src/**/index.*）。' +
      '必须指定搜索目录（path），默认为工作目录。禁止使用根目录或系统目录作为搜索路径。',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob 模式，支持 ** 递归匹配、* 单层匹配、? 单字符匹配' },
        path: {
          type: 'string',
          description:
            '要搜索的目录路径（必填）。必须是一个具体的项目目录，不能是系统根目录（如 /、C:\\）。' +
            '如果不确定，请使用工作目录。',
        },
      },
      required: ['pattern', 'path'],
    },
  },
}

export const ripgrepSearchTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'ripgrep_search',
    description:
      '在指定目录下全文搜索文件内容（类似 ripgrep/grep），支持正则表达式和上下文行。' +
      '必须指定搜索目录（path），默认为工作目录。禁止使用根目录或系统目录作为搜索路径。',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '搜索的正则表达式' },
        path: {
          type: 'string',
          description:
            '要搜索的目录路径（必填）。必须是一个具体的项目目录，不能是系统根目录（如 /、C:\\）。' +
            '如果不确定，请使用工作目录。',
        },
        include: { type: 'string', description: '文件过滤 glob 模式（如 "*.ts", "*.{js,jsx}"）' },
        case_sensitive: { type: 'boolean', description: '是否区分大小写（默认 true）' },
        context_lines: { type: 'number', description: '每个匹配项前后显示的上下文行数（默认 2）' },
        max_results: { type: 'number', description: '最大返回结果数（默认 50）' },
      },
      required: ['pattern', 'path'],
    },
  },
}

export const searchTools: ToolDefinition[] = [
  globSearchTool,
  ripgrepSearchTool,
]
