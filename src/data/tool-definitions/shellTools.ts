/**
 * Shell 命令类工具定义
 * 包含：执行 shell 命令
 * 注意：run_command 的 description 包含动态 workDir，需要在运行时注入
 */
import type { ToolDefinition } from '../../agent/llm/llmClient'

/**
 * 构建 run_command 工具定义（动态注入工作目录）
 */
export function buildRunCommandTool(workDir: string): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'run_command',
      description: `在工作目录 (${workDir}) 下执行 shell 命令`,
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的 shell 命令' },
        },
        required: ['command'],
      },
    },
  }
}
