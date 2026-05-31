/**
 * 文件操作类工具定义
 * 包含：读取、写入、删除、复制、移动
 */
import type { ToolDefinition } from '../../agent/llm/llmClient'

export const readFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read_file',
    description: '读取指定路径的文件内容。对于大文件，可使用 offset 和 limit 参数分段读取。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件的相对或绝对路径' },
        offset: {
          type: 'number',
          description: '起始读取行号（从0开始计数）。仅在文件过大、无法一次性读取时使用。',
        },
        limit: {
          type: 'number',
          description: '单次读取的行数。仅在文件过大、无法一次性读取时使用。',
        },
      },
      required: ['path'],
    },
  },
}

export const writeFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'write_file',
    description: '将内容写入指定文件（如不存在则创建）。路径必须在工作目录内，相对路径会自动解析为工作目录下的路径。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径（建议使用相对于工作目录的路径，如 "report.html"）' },
        content: { type: 'string', description: '要写入的文件内容' },
      },
      required: ['path', 'content'],
    },
  },
}

export const deletePathTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'delete_path',
    description: '删除指定的文件或目录（目录会递归删除）',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要删除的文件或目录路径' },
      },
      required: ['path'],
    },
  },
}

export const copyPathTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'copy_path',
    description: '复制文件或目录到目标路径',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: '源文件或目录路径' },
        destination: { type: 'string', description: '目标路径' },
      },
      required: ['source', 'destination'],
    },
  },
}

export const movePathTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'move_path',
    description: '移动或重命名文件/目录',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: '源文件或目录路径' },
        destination: { type: 'string', description: '目标路径' },
      },
      required: ['source', 'destination'],
    },
  },
}

export const fileOperationTools: ToolDefinition[] = [
  readFileTool,
  writeFileTool,
  deletePathTool,
  copyPathTool,
  movePathTool,
]
