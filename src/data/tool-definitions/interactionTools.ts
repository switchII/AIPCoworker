/**
 * 问题澄清工具定义 — ask_user
 *
 * 当 Agent 需要用户澄清问题时调用此工具。
 * 支持 1 个或多个问题，每个问题带有选项列表（最后一项自动添加"自定义输入"）。
 */
import type { ToolDefinition } from '../../agent/llm/llmClient'

export const askUserTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'ask_user',
    description:
      '向用户提出澄清问题。当你需要用户确认方向、选择方案或补充信息时使用此工具。' +
      '每个问题应包含 2-5 个选项，系统会自动添加"自定义输入"选项。' +
      '通常在任务执行前期使用，用于确认需求细节、选择实现方案或澄清模糊点。',
    parameters: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          description: '要向用户提出的问题列表（1-5 个问题）',
          minItems: 1,
          maxItems: 5,
          items: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                description: '问题文本，简明扼要地描述需要用户回答的内容',
              },
              options: {
                type: 'array',
                description: '可选选项列表（2-5 个），系统会自动追加"自定义输入"选项',
                minItems: 2,
                maxItems: 5,
                items: {
                  type: 'object',
                  properties: {
                    label: {
                      type: 'string',
                      description: '选项显示文本',
                    },
                    value: {
                      type: 'string',
                      description: '选项值（选中标识）',
                    },
                  },
                  required: ['label', 'value'],
                },
              },
              multi_select: {
                type: 'boolean',
                description: '是否允许多选（默认 false）',
              },
            },
            required: ['question', 'options'],
          },
        },
      },
      required: ['questions'],
    },
  },
}

export const interactionTools = [askUserTool]
