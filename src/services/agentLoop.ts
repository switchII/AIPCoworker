// Agent Loop - 核心交互引擎
// 参考 Abu-Cowork/src/core/agent/agentLoop.ts
import { getLLMService } from './llmService'
import type { LLMConfig, ChatMessage, ToolCall } from '../types/agent'

interface AgentLoopOptions {
  conversationId: string
  messages: ChatMessage[]
  systemPrompt: string
  llmConfig: LLMConfig
  maxTurns: number
  onToken: (token: string) => void
  onThinking?: (thinking: string) => void
  onToolCallStart?: (toolCall: ToolCall) => void
  onToolCallEnd?: (toolCall: ToolCall) => void
  onComplete: (message: ChatMessage) => void
  onError: (error: Error) => void
}

// 工具执行器 - 参考 Abu-Cowork/src/core/agent/toolExecutor.ts
async function executeToolCall(name: string, args: Record<string, string>): Promise<{ success: boolean; output: string }> {
  // 模拟短暂延迟让 UI 有时间更新
  await new Promise(resolve => setTimeout(resolve, 300))

  switch (name) {
    case 'web_search':
      return {
        success: true,
        output: `搜索 "${args.query}" 的结果:\n1. 相关网页结果...\n2. 知识图谱信息...\n(实际搜索功能需配置搜索 API)`
      }
    case 'read_file':
      return {
        success: true,
        output: `[文件内容: ${args.path}]\n(Tauri环境中可通过fs插件读取实际文件)`
      }
    case 'write_file':
      return { success: true, output: `已写入文件: ${args.path}\n(Tauri环境中可通过fs插件写入实际文件)` }
    case 'run_command':
      return { success: true, output: `$ ${args.command}\n[命令输出]\n(Tauri环境中可通过shell插件执行实际命令)` }
    case 'list_directory':
      return { success: true, output: `目录 ${args.path} 的内容:\n(Tauri环境中可通过fs插件列出实际目录)` }
    case 'edit_file':
      return { success: true, output: `已编辑文件: ${args.path}` }
    case 'http_fetch':
      return { success: true, output: `已获取 URL 内容: ${args.url}` }
    default:
      return { success: false, output: `未知工具: ${name}` }
  }
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<void> {
  const {
    messages, systemPrompt, llmConfig,
    onToken, onThinking, onToolCallStart, onToolCallEnd,
    onComplete, onError
  } = options

  // 前置检查
  if (!llmConfig.apiKey) {
    onError(new Error('请先在 Agent 设置中配置 API Key'))
    return
  }

  const llm = getLLMService(llmConfig)

  // 构建请求消息（只取 user 和 assistant 角色）
  const requestMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }))

  let fullResponse = ''
  let thinkingContent = ''
  const toolCalls: ToolCall[] = []
  let currentToolName = ''
  let currentToolArgs = ''

  try {
    await llm.streamChat(
      requestMessages,
      {
        onToken: (token: string) => {
          fullResponse += token
          onToken(token)
        },
        onThinking: (thinking: string) => {
          thinkingContent += thinking
          onThinking?.(thinking)
        },
        onToolCall: (tc: { name: string; arguments: string }) => {
          if (tc.name && tc.name !== currentToolName) {
            // 新工具调用开始 - 先完成上一个
            if (currentToolName) {
              finishCurrentTool()
            }
            currentToolName = tc.name
            currentToolArgs = tc.arguments || ''
            const toolCall: ToolCall = {
              id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: tc.name,
              description: getToolDescription(tc.name),
              input: tc.arguments || '',
              status: 'running'
            }
            toolCalls.push(toolCall)
            onToolCallStart?.(toolCall)
          } else if (tc.arguments) {
            // 累积参数
            currentToolArgs += tc.arguments
          }
        },
        onComplete: async (_text: string) => {
          // 完成最后一个工具调用
          if (currentToolName) {
            await finishCurrentToolAsync()
          }

          const resultMessage: ChatMessage = {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: fullResponse,
            timestamp: new Date().toISOString(),
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            thinking: thinkingContent || undefined
          }
          onComplete(resultMessage)
        },
        onError: (error: Error) => {
          onError(error)
        }
      },
      systemPrompt
    )
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }

  function finishCurrentTool() {
    const lastTool = toolCalls[toolCalls.length - 1]
    if (lastTool) {
      lastTool.input = currentToolArgs
      lastTool.status = 'success'
      lastTool.output = '处理中...'
      onToolCallEnd?.(lastTool)
    }
    currentToolName = ''
    currentToolArgs = ''
  }

  async function finishCurrentToolAsync() {
    const lastTool = toolCalls[toolCalls.length - 1]
    if (lastTool) {
      lastTool.input = currentToolArgs
      try {
        const parsedArgs = currentToolArgs ? JSON.parse(currentToolArgs) : {}
        const result = await executeToolCall(currentToolName, parsedArgs)
        lastTool.output = result.output
        lastTool.status = result.success ? 'success' : 'error'
      } catch {
        // JSON parse 失败时，直接使用原始参数作为描述
        lastTool.output = `执行 ${currentToolName}(${currentToolArgs})`
        lastTool.status = 'success'
      }
      onToolCallEnd?.(lastTool)
    }
    currentToolName = ''
    currentToolArgs = ''
  }
}

function getToolDescription(name: string): string {
  const descriptions: Record<string, string> = {
    'web_search': '搜索互联网',
    'read_file': '读取文件',
    'write_file': '写入文件',
    'run_command': '执行命令',
    'list_directory': '列出目录',
    'edit_file': '编辑文件',
    'find_files': '查找文件',
    'search_files': '搜索文件内容',
    'http_fetch': '获取网页',
    'generate_image': '生成图片',
    'delegate_agent': '委派Agent',
    'update_memory': '更新记忆',
  }
  return descriptions[name] || name
}

// 构建系统提示词 - 参考 Abu-Cowork/src/core/agent/orchestrator.ts
export function buildSystemPrompt(options: {
  soulPersonality: string
  agentName: string
  agentSystemPrompt: string
  skills: string[]
  permissionMode: string
  customInstructions: string
}): string {
  const { soulPersonality, agentName, agentSystemPrompt, skills, permissionMode, customInstructions } = options

  let prompt = `# 角色身份\n你是 ${agentName}，一个强大的AI助手。\n\n`

  if (agentSystemPrompt) {
    prompt += `## 核心指令\n${agentSystemPrompt}\n\n`
  }

  if (soulPersonality) {
    prompt += `## 人格特征\n${soulPersonality}\n\n`
  }

  prompt += `## 能力\n`
  prompt += `- 你可以使用工具来完成任务（文件读写、命令执行、网页搜索等）\n`
  prompt += `- 当需要最新信息时，使用 web_search 工具搜索互联网\n`
  prompt += `- 操作文件时注意安全性和正确性\n`
  prompt += `- 权限模式: ${permissionMode}\n\n`

  if (skills.length > 0) {
    prompt += `## 可用技能\n${skills.map(s => `- ${s}`).join('\n')}\n\n`
  }

  if (customInstructions) {
    prompt += `## 用户自定义指令\n${customInstructions}\n\n`
  }

  prompt += `## 行为准则\n`
  prompt += `- 始终以用户利益为先\n`
  prompt += `- 回答要简洁清晰有帮助\n`
  prompt += `- 遇到不确定的情况时坦诚说明\n`
  prompt += `- 如果需要执行危险操作（删除文件、修改系统配置等），先询问用户确认\n`

  return prompt
}
