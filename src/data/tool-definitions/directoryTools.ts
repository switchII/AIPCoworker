/**
 * 目录浏览类工具定义
 * 包含：列出目录
 */
import type { ToolDefinition } from '../../agent/llm/llmClient'

export const listDirectoryTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_directory',
    description: '列出目录下的文件和子目录',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目录路径，默认为工作目录' },
      },
    },
  },
}

export const directoryTools: ToolDefinition[] = [
  listDirectoryTool,
]
