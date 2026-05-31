/**
 * 子代理工具 — 为复杂生成任务提供专注的 LLM 调用。
 *
 * 当主 Agent 需要生成复杂 HTML 页面或大型代码文件时，
 * 委托给子代理执行单次 LLM 调用（使用专注的系统提示），
 * 避免 JSON 格式错误，产出更干净的输出。
 *
 * 工具：
 *   - generate_html_page: 生成包含 CSS/JS 的完整 HTML 页面
 *   - generate_code_file: 生成任意语言的代码文件
 *
 * 使用方式：
 *   import { buildSubAgentToolDefinitions, executeSubAgentTool } from '@/agent/subagent'
 *
 *   const tools = buildSubAgentToolDefinitions()
 *   const result = await executeSubAgentTool('generate_html_page', args, context)
 */

import { streamChat, type ChatMessage, type LLMRequestParams, type ToolDefinition } from '../llm/llmClient'
import type { ToolResult } from '../core/reactAgent'
import { invoke } from '@tauri-apps/api/core'
import { buildInternalToolDefinitions } from '../tools/internalTools'
import { buildConnectorToolDefinitions } from '../../data/tool-definitions'
import { buildMCPToolDefinitions } from '../mcp/tools'
import { buildMemoryToolDefinitions } from '../memory'
import { buildExternalToolDefinitions } from '../tools/externalTools'
import { runSubAgent } from './subAgentRunner'
import type { ConnectorConfig } from '../../types/integration'

// ─── 上下文 ────────────────────────────────────────────────────────

/** 传递给子代理工具的上下文（用于 LLM 访问） */
export interface SubAgentContext {
  /** LLM 基础 URL */
  baseUrl: string
  /** LLM API 密钥 */
  apiKey: string
  /** LLM API 格式 */
  format: LLMRequestParams['format']
  /** 模型 ID */
  model: string
  /** 工作目录 */
  workDir: string
  /** 可选的对话摘要（用于上下文传递） */
  contextSummary?: string
  /**
   * 主代理的对话历史（用于生成子代理时注入上下文）。
   * 仅包含 user/assistant 的文本内容，不含 tool 消息和 tool_calls，
   * 确保子代理能理解任务背景而不会被无关的工具细节干扰。
   */
  conversationHistory?: ChatMessage[]
  /** 当前工具调用 ID（用于追踪多个并发的子代理） */
  toolCallId?: string
  /** 流式 token 回调（每次子代理产生 token 时触发，用于 UI 实时显示） */
  onToken?: (token: string) => void
  /**
   * 综合工具执行器（供 assign_to_subagent 使用）。
   * 子代理可调用内置工具 + 连接器 + MCP + 记忆等，与主代理拥有相同的工具集。
   */
  toolExecutor?: (name: string, args: Record<string, unknown>) => Promise<ToolResult>
  /** MCP 服务器 ID 列表（供子代理构建 MCP 工具定义） */
  mcpServerIds?: string[]
  /** 技能名称列表（供子代理构建技能工具定义） */
  skillNames?: string[]
  /** 连接器配置（供子代理构建连接器工具定义） */
  connectorConfigs?: ConnectorConfig[]
  /** 子代理每次迭代完成时回调 */
  onIteration?: (payload: { iteration: number; thinking: string; toolNames: string[]; toolResults: { name: string; success: boolean; summary: string; args?: Record<string, unknown> }[]; finished: boolean }) => void
}

// ─── 工具定义 ───────────────────────────────────────────────

/** 安全拼接路径（跨平台兼容） */
function joinPath(base: string, name: string): string {
  if (!base) return name
  const sep = base.includes('\\') ? '\\' : '/'
  return base.endsWith(sep) || base.endsWith('/') ? `${base}${name}` : `${base}${sep}${name}`
}

/** 将文件名中的不安全字符替换为下划线 */
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_') || 'output'
}

/**
 * 仅移除包裹整个输出的外层 Markdown 代码围栏。
 * 内层代码块（如文档中的 ```python ... ```）不会被误删。
 *
 * 判断条件：内容必须以 ``` 开头且以 ``` 结尾，才视为外层围栏。
 */
function stripOuterFence(content: string): string {
  const trimmed = content.trim()
  // 仅当整个输出被一对围栏包裹时才移除：以 ``` 开头且以 ``` 结尾
  if (/^```(?:\w+)?\s*\n/.test(trimmed) && /\n```\s*$/.test(trimmed)) {
    const firstNewline = trimmed.indexOf('\n')
    return trimmed.slice(firstNewline + 1, trimmed.lastIndexOf('```')).trim()
  }
  return trimmed
}

/**
 * 从主代理对话历史中提取精简上下文，供生成子代理注入。
 *
 * 策略：
 *   - 保留 user / assistant 的文本内容
 *   - 保留 tool 结果（截断到 2000 字符）— 这些是主代理已获取的数据，生成子代理需要了解
 *   - 跳过 assistant 消息中的 tool_calls 字段（对生成无意义）
 *   - 截断每条消息到 2000 字符，避免上下文过长
 *   - 保留最近的 N 条有效消息（默认 10 条）
 */
function buildContextBlock(context: SubAgentContext): string | null {
  const history = context.conversationHistory
  if (!history || history.length === 0) return null

  const meaningful: { role: string; content: string }[] = []
  const MAX_MSG_CHARS = 2000
  const MAX_MESSAGES = 10

  for (const msg of history) {
    if (msg.role === 'system') continue
    // 跳过 assistant 消息中仅含 tool_calls 的情况（无实质文本）
    if (msg.role === 'assistant' && !msg.content && msg.tool_calls) continue

    const text = (msg.content || '').trim()
    if (!text) continue

    const roleLabel = msg.role === 'user' ? '用户'
      : msg.role === 'assistant' ? '助手'
      : '工具结果'
    meaningful.push({
      role: roleLabel,
      content: text.length > MAX_MSG_CHARS ? text.slice(0, MAX_MSG_CHARS) + '…' : text,
    })
  }

  if (meaningful.length === 0) return null

  // 仅保留最近的 N 条
  const recent = meaningful.slice(-MAX_MESSAGES)

  const lines = recent.map(m => `[${m.role}]: ${m.content}`)
  return [
    '以下是你与用户之前的对话历史（背景上下文），请据此理解当前生成任务的完整背景和需求：',
    '',
    '--- 对话历史 ---',
    ...lines,
    '--- 对话历史结束 ---',
  ].join('\n')
}

const generateHtmlPageTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'generate_html_page',
    description:
      '使用专用子代理生成完整的 HTML 页面。' +
      '当页面较复杂时（包含多个区块、交互元素、图表或大量 CSS/JS），应使用此工具而非直接编写 HTML。' +
      '子代理会生成一个独立的 HTML 文件并自动保存到工作目录中。\n\n' +
      '重要提示：使用此工具前，请先查看可用技能索引。' +
      '如果有相关技能（如 infographic、report、chart、dashboard 等），' +
      '请先通过 skill_load 加载完整指令，以获得更专业的生成效果。\n\n' +
      '适用场景：\n' +
      '- 数据可视化仪表盘\n' +
      '- 带表单/图表的交互式网页\n' +
      '- 多区块带样式的报告页面\n' +
      '- 落地页或展示页面\n\n' +
      '简单的 HTML 片段请勿使用此工具 — 直接编写即可。',
    parameters: {
      type: 'object',
      properties: {
        file_name: {
          type: 'string',
          description: '输出文件名（含 .html 扩展名，如 "report.html"、"dashboard.html"）',
        },
        title: {
          type: 'string',
          description: '页面标题（显示在浏览器标签页和页面头部）',
        },
        description: {
          type: 'string',
          description: '详细描述页面应包含的内容和外观效果',
        },
        requirements: {
          type: 'string',
          description: '具体技术要求（如"使用 Chart.js 绘制图表"、"深色主题"、"响应式设计"等）',
        },
      },
      required: ['file_name', 'title', 'description'],
    },
  },
}

const generateCodeFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'generate_code_file',
    description:
      '使用专用子代理生成完整的代码文件。' +
      '当文件较大或较复杂时（10 行以上、多个函数/类、复杂逻辑），应使用此工具而非直接编写代码。\n\n' +
      '生成的文件会自动保存到工作目录中，并返回文件路径以便运行或引用。\n\n' +
      '重要提示：使用此工具前，请先查看可用技能索引。' +
      '如果有相关技能，请先通过 skill_load 加载完整指令，以获得更专业的生成效果。\n\n' +
      '适用场景：\n' +
      '- 大型 Python/JavaScript/TypeScript 脚本\n' +
      '- 复杂的数据处理流水线\n' +
      '- 多类应用程序\n' +
      '- 过长的 shell 脚本\n\n' +
      '简短的代码片段请勿使用此工具 — 直接编写即可。',
    parameters: {
      type: 'object',
      properties: {
        file_name: {
          type: 'string',
          description: '输出文件名（含扩展名，如 "analysis.py"、"server.js"）',
        },
        language: {
          type: 'string',
          description: '编程语言（如 "python"、"javascript"、"typescript"、"bash"）',
        },
        description: {
          type: 'string',
          description: '详细描述代码应实现的功能',
        },
        requirements: {
          type: 'string',
          description: '具体要求（需使用的库、需遵循的模式、约束条件等）',
        },
      },
      required: ['file_name', 'language', 'description'],
    },
  },
}

const generateDocumentTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'generate_document',
    description:
      '使用专用子代理生成完整的文档文件（Markdown、纯文本、reStructuredText 等）。' +
      '当文档较长或结构复杂时（超过 10 行、多章节、含表格/代码块/图表），应使用此工具而非 write_file。\n\n' +
      '生成的文件会自动保存到工作目录中，并返回文件路径。\n\n' +
      '重要提示：使用此工具前，请先查看可用技能索引。' +
      '如果有相关技能（如 report、article、summary 等），请先通过 skill_load 加载完整指令。\n\n' +
      '适用场景：\n' +
      '- 长篇技术报告或调研报告\n' +
      '- 项目文档（README、API 文档、设计文档）\n' +
      '- 多章节的文章或指南\n' +
      '- 包含表格、代码示例、流程图的复杂文档\n' +
      '- 会议纪要、需求文档等业务文档\n\n' +
      '短小的文本片段请勿使用此工具 — 直接用 write_file 编写即可。',
    parameters: {
      type: 'object',
      properties: {
        file_name: {
          type: 'string',
          description: '输出文件名（含扩展名，如 "report.md"、"guide.txt"、"api-docs.md"）',
        },
        format: {
          type: 'string',
          description: '文档格式（如 "markdown"、"plaintext"、"rst"），默认 "markdown"',
        },
        description: {
          type: 'string',
          description: '详细描述文档应包含的内容、结构和风格要求',
        },
        requirements: {
          type: 'string',
          description: '具体要求（目标读者、语气风格、必须包含的章节、参考素材等）',
        },
      },
      required: ['file_name', 'description'],
    },
  },
}

const assignToSubagentTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'assign_to_subagent',
    description:
      '将主任务的一部分工作委托给独立的子代理执行。' +
      '子代理拥有自己的工具集（文件操作、命令执行、搜索等），独立完成任务后返回结果。\n\n' +
      '使用场景：\n' +
      '- 复杂的多步骤子任务（如：先读取文件 → 分析 → 生成报告）\n' +
      '- 需要独立上下文的耗时任务（避免主代理上下文过长）\n' +
      '- 需要多次工具调用的专项任务（如：搜索多个文件并汇总）\n' +
      '- 代码生成、文件生成等需要专注处理的任务\n\n' +
      '优势：\n' +
      '- 子代理拥有独立上下文，不会增加主代理的上下文负担\n' +
      '- 子代理可以多次迭代使用工具，自主完成复杂任务\n' +
      '- 结果自动汇总返回给主代理',
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: '委托给子代理的具体任务描述，需要清晰、完整，包含所有必要的上下文信息',
        },
        context_info: {
          type: 'string',
          description: '补充背景信息（可选），帮助子代理更好地理解任务背景，例如相关文件路径、已知的信息等',
        },
      },
      required: ['task'],
    },
  },
}

/** 构建子代理工具定义列表 */
export function buildSubAgentToolDefinitions(subAgentContext?: SubAgentContext): ToolDefinition[] {
  const tools = [generateHtmlPageTool, generateCodeFileTool, generateDocumentTool]
  // 仅当提供了工具执行器时，才添加 assign_to_subagent 工具
  if (subAgentContext?.toolExecutor) {
    tools.push(assignToSubagentTool)
  }
  return tools
}

// ─── 工具执行器 ──────────────────────────────────────────────────

/** 子代理结果标记前缀（桥接器用于识别块创建） */
export const SUBAGENT_RESULT_MARKER = '[SUBAGENT_RESULT]'

/**
 * 执行子代理工具调用。
 * @returns 包含结构化 JSON 输出的 ToolResult，工具名不匹配时返回 null
 */
export async function executeSubAgentTool(
  name: string,
  args: Record<string, unknown>,
  context: SubAgentContext,
): Promise<ToolResult | null> {
  switch (name) {
    case 'generate_html_page':
      return await executeHtmlGeneration(args, context)
    case 'generate_code_file':
      return await executeCodeGeneration(args, context)
    case 'generate_document':
      return await executeDocumentGeneration(args, context)
    case 'assign_to_subagent':
      return await executeAssignToSubagent(args, context)
    default:
      return null
  }
}

/**
 * 构建包含主代理上下文的 messages 数组。
 * 如果有对话历史，注入一条背景上下文消息，然后追加生成任务消息。
 */
function buildMessagesWithContext(context: SubAgentContext, taskMessage: string): ChatMessage[] {
  const messages: ChatMessage[] = []

  // 注入主代理对话历史作为背景上下文
  const contextBlock = buildContextBlock(context)
  if (contextBlock) {
    messages.push({ role: 'user', content: contextBlock })
    // 添加一条 assistant 确认消息，让模型知道已理解上下文
    messages.push({
      role: 'assistant',
      content: '我已理解上述对话背景和上下文。请告诉我需要生成什么，我会基于上述背景生成符合要求的内容。',
    })
  }

  // 追加当前的生成任务消息
  messages.push({ role: 'user', content: taskMessage })
  return messages
}

// ─── HTML 生成 ────────────────────────────────────────────────

async function executeHtmlGeneration(
  args: Record<string, unknown>,
  context: SubAgentContext,
): Promise<ToolResult> {
  const fileName = (args.file_name as string) || 'generated_page.html'
  const title = args.title as string
  const description = args.description as string
  const requirements = (args.requirements as string) || ''

  const systemPrompt = [
    '你是一个专业的 HTML 页面生成器。你的唯一任务是生成完整的、自包含的 HTML 文件（内嵌 CSS 和 JavaScript）。',
    '',
    '严格规则：',
    '1. 只输出原始 HTML 代码 — 不要 markdown、不要解释、不要代码围栏',
    '2. 以 <!DOCTYPE html> 开头，必须以 </html> 结尾',
    '3. HTML 必须完整，不能截断。如果接近 token 上限，在逻辑断点处停止，但必须闭合所有已打开的标签',
    '4. 所有 CSS 写在 <head> 内的 <style> 标签中',
    '5. 所有 JavaScript 写在 </body> 前的 <script> 标签中',
    '6. 使用现代 CSS（flexbox/grid、自定义属性、平滑动画）',
    '7. 页面需响应式且视觉美观',
    '8. 需要外部库时（Chart.js、Tailwind 等），使用 CDN 链接',
    '9. 确保 HTML 完整且有效',
    '',
    '重要：永远不要留下未闭合的标签。必须以 </html> 结束。',
    '',
    '输出格式：纯 HTML，以 <!DOCTYPE html> 开头，以 </html> 结尾',
  ].join('\n')

  const userMessage = [
    `请按以下要求生成一个 HTML 页面：`,
    '',
    `**标题：** ${title}`,
    '',
    `**描述：**`,
    description,
    '',
    requirements ? `**技术要求：**\n${requirements}` : '',
    '',
    '请立即生成完整的 HTML 文件。记住：只输出原始 HTML 代码，不要任何解释。',
  ].filter(Boolean).join('\n')

  // 立即发送状态提示，让用户感知到子代理已开始工作（减少首 token 到达前的空白感）
  context.onToken?.('')

  try {
    // 注入主代理对话历史作为背景上下文，使生成内容与用户需求对齐
    const messages = buildMessagesWithContext(context, userMessage)

    const params: LLMRequestParams = {
      baseUrl: context.baseUrl,
      apiKey: context.apiKey,
      format: context.format,
      model: context.model,
      messages,
      systemPrompt,
      temperature: 0.7,
      maxTokens: 16384, // HTML 页面通常不需要超过 16K tokens
    }

    // 使用流式调用，实时输出 token 供 UI 显示
    // 同步等待流式调用完成，确保 HTML 生成完毕后再继续
    const fullText = await new Promise<string>((resolve, reject) => {
      let accumulated = ''
      streamChat(params, {
        onToken(token: string) {
          accumulated += token
          context.onToken?.(token)
        },
        // 转发思考/推理 token 到 UI，避免 reasoning 模型长时间无输出
        onThinking(thinking: string) {
          context.onToken?.(thinking)
        },
        onComplete(text: string) {
          resolve(text || accumulated)
        },
        onError(error: Error) {
          reject(error)
        },
      })
    })

    // 从响应中提取 HTML（处理可能存在的 Markdown 代码围栏）
    // 使用 stripOuterFence 避免误删文档内的内层代码块
    let htmlContent = stripOuterFence(fullText)

    // 检查 HTML 是否完整（必须有闭合的 </html> 标签）
    const hasClosingHtml = htmlContent.includes('</html>')
    if (!hasClosingHtml) {
      console.warn('[SubAgent] HTML 生成可能被截断（缺少 </html> 标签）')
    }

    // 移除前后多余的非 HTML 内容
    const doctypeIdx = htmlContent.indexOf('<!DOCTYPE')
    if (doctypeIdx === -1) {
      const htmlIdx = htmlContent.indexOf('<html')
      if (htmlIdx > 0) {
        htmlContent = htmlContent.slice(htmlIdx)
      }
    } else if (doctypeIdx > 0) {
      htmlContent = htmlContent.slice(doctypeIdx)
    }
    
    // 如果 HTML 不完整，尝试修复常见的截断问题
    if (!hasClosingHtml) {
      // 检查是否有未闭合的标签，尝试添加基本的闭合标签
      if (!htmlContent.includes('</style>') && htmlContent.includes('<style')) {
        htmlContent += '\n</style>'
      }
      if (!htmlContent.includes('</head>') && htmlContent.includes('<head')) {
        htmlContent += '\n</head>'
      }
      if (!htmlContent.includes('</body>') && htmlContent.includes('<body')) {
        htmlContent += '\n</body>'
      }
      if (!htmlContent.includes('</html>')) {
        htmlContent += '\n</html>'
      }
      console.log('[SubAgent] 已尝试修复被截断的 HTML')
    }

    // 将 HTML 写入磁盘
    // 确保文件名以 .html 结尾
    const safeName = fileName.endsWith('.html') ? sanitizeFileName(fileName) : sanitizeFileName(fileName) + '.html'
    const filePath = joinPath(context.workDir, safeName)

    try {
      await invoke('agent_write_file', { path: filePath, content: htmlContent })
      console.log(`[SubAgent] HTML 文件已写入: ${filePath}`)
    } catch (writeErr) {
      console.error('[SubAgent] HTML 文件写入失败:', writeErr)
      return {
        success: false,
        output: `HTML 文件写入失败: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`,
      }
    }

    const resultData = {
      type: 'html_render' as const,
      htmlContent,
      title,
      description,
      filePath,
      fileName: safeName,
    }

    // 返回结构化结果给 UI（JSON）+ 可读信息给 LLM
    const llmMessage = `HTML 页面已生成并保存到: ${filePath}\n文件名: ${safeName}\n页面标题: ${title}\n文件大小: ${new Blob([htmlContent]).size} 字节`

    return {
      success: true,
      output: `${SUBAGENT_RESULT_MARKER}${JSON.stringify(resultData)}\n\n${llmMessage}`,
    }
  } catch (err) {
    return {
      success: false,
      output: `HTML 生成失败: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ─── 代码生成 ────────────────────────────────────────────────

async function executeCodeGeneration(
  args: Record<string, unknown>,
  context: SubAgentContext,
): Promise<ToolResult> {
  const fileName = (args.file_name as string) || 'generated_code.py'
  const language = args.language as string
  const description = args.description as string
  const requirements = (args.requirements as string) || ''

  const systemPrompt = [
    `你是一个专业的 ${language} 代码生成器。你的唯一任务是生成完整、可运行的代码文件。`,
    '',
    '规则：',
    '1. 只输出原始代码 — 不要 markdown 围栏、不要解释',
    '2. 包含所有必要的导入和依赖',
    '3. 为复杂逻辑添加清晰的注释',
    '4. 遵循该语言的最佳实践和惯用模式',
    '5. 妥善处理错误',
    '6. 确保代码可直接投入生产使用',
    '',
    '输出格式：纯代码，不要用 markdown 包裹',
  ].join('\n')

  const userMessage = [
    `请按以下要求生成一个 ${language} 文件：`,
    '',
    `**文件名：** ${fileName}`,
    `**语言：** ${language}`,
    '',
    `**描述：**`,
    description,
    '',
    requirements ? `**要求：**\n${requirements}` : '',
    '',
    '请立即生成完整的代码文件。记住：只输出原始代码，不要任何解释。',
  ].filter(Boolean).join('\n')

  // 立即发送状态提示
  context.onToken?.('')

  try {
    // 注入主代理对话历史作为背景上下文，使生成内容与用户需求对齐
    const messages = buildMessagesWithContext(context, userMessage)

    const params: LLMRequestParams = {
      baseUrl: context.baseUrl,
      apiKey: context.apiKey,
      format: context.format,
      model: context.model,
      messages,
      systemPrompt,
      temperature: 0.3,
      maxTokens: 16384, // 代码文件通常不需要超过 16K tokens
    }

    // 使用流式调用，实时输出 token 供 UI 显示
    // 同步等待流式调用完成，确保代码生成完毕后再继续
    const fullText = await new Promise<string>((resolve, reject) => {
      let accumulated = ''
      streamChat(params, {
        onToken(token: string) {
          accumulated += token
          context.onToken?.(token)
        },
        // 转发思考/推理 token 到 UI，避免 reasoning 模型长时间无输出
        onThinking(thinking: string) {
          context.onToken?.(thinking)
        },
        onComplete(text: string) {
          resolve(text || accumulated)
        },
        onError(error: Error) {
          reject(error)
        },
      })
    })

    // 从响应中提取代码（处理可能存在的 Markdown 代码围栏）
    // 使用 stripOuterFence 避免误删代码内的内层代码块
    let codeContent = stripOuterFence(fullText)

    // 将代码写入磁盘
    const safeName = sanitizeFileName(fileName)
    const filePath = joinPath(context.workDir, safeName)

    try {
      await invoke('agent_write_file', { path: filePath, content: codeContent })
      console.log(`[SubAgent] 代码文件已写入: ${filePath}`)
    } catch (writeErr) {
      console.error('[SubAgent] 代码文件写入失败:', writeErr)
      return {
        success: false,
        output: `代码文件写入失败: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`,
      }
    }

    const resultData = {
      type: 'code_edit' as const,
      code: codeContent,
      language: language.toLowerCase(),
      fileName: safeName,
      filePath,
      description,
    }

    // 返回结构化结果给 UI（JSON）+ 可读信息给 LLM
    const llmMessage = `代码文件已生成并保存到: ${filePath}\n文件名: ${safeName}\n语言: ${language}\n文件大小: ${new Blob([codeContent]).size} 字节`

    return {
      success: true,
      output: `${SUBAGENT_RESULT_MARKER}${JSON.stringify(resultData)}\n\n${llmMessage}`,
    }
  } catch (err) {
    return {
      success: false,
      output: `代码生成失败: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ─── 文档生成 ────────────────────────────────────────────────

async function executeDocumentGeneration(
  args: Record<string, unknown>,
  context: SubAgentContext,
): Promise<ToolResult> {
  const fileName = (args.file_name as string) || 'generated_document.md'
  const format = ((args.format as string) || 'markdown').toLowerCase()
  const description = args.description as string
  const requirements = (args.requirements as string) || ''

  // 根据格式调整提示
  const formatLabels: Record<string, string> = {
    markdown: 'Markdown',
    md: 'Markdown',
    plaintext: '纯文本',
    txt: '纯文本',
    rst: 'reStructuredText',
    asciidoc: 'AsciiDoc',
    adoc: 'AsciiDoc',
  }
  const formatLabel = formatLabels[format] || format

  const isMarkdown = ['markdown', 'md'].includes(format)
  const isRst = ['rst', 'restructuredtext'].includes(format)

  const formatRules: string[] = []
  if (isMarkdown) {
    formatRules.push(
      '- 使用标准 Markdown 语法（# 标题、- 列表、> 引用、``` 代码块、| 表格）',
      '- 合理使用标题层级（h1-h4），不要跳级',
      '- 代码块标注语言类型（如 ```python）',
      '- 适当使用粗体、斜体强调重点',
      '- 表格对齐，保持可读性',
    )
  } else if (isRst) {
    formatRules.push(
      '- 使用 reStructuredText 语法（= 标题下划线、.. code-block::、.. table::）',
      '- 遵循 Sphinx 文档规范',
    )
  } else {
    formatRules.push(
      '- 使用清晰的纯文本格式',
      '- 用空行分隔段落和章节',
      '- 使用缩进表示层级关系',
    )
  }

  const systemPrompt = [
    `你是一个专业的 ${formatLabel} 文档撰写器。你的唯一任务是生成完整、结构清晰的文档内容。`,
    '',
    '严格规则：',
    '1. 只输出文档内容 — 不要前言、不要解释、不要用 markdown 围栏包裹整个输出',
    '2. 文档必须完整，不能截断。如果接近 token 上限，在逻辑断点处停止，但必须闭合当前章节',
    '3. 结构清晰，层次分明，使用合理的标题和章节划分',
    '4. 内容详实，避免空洞的描述，用具体的信息和示例支撑观点',
    '5. 语言流畅自然，符合目标读者的阅读习惯',
    '6. 如有需要，包含目录（Table of Contents）',
    '',
    '格式规范：',
    ...formatRules,
    '',
    '输出格式：直接输出文档内容，以第一个标题或正文段落开头',
  ].join('\n')

  const userMessage = [
    `请按以下要求生成一个 ${formatLabel} 文档：`,
    '',
    `**文件名：** ${fileName}`,
    `**格式：** ${formatLabel}`,
    '',
    `**内容描述：**`,
    description,
    '',
    requirements ? `**具体要求：**\n${requirements}` : '',
    '',
    '请立即生成完整的文档内容。记住：只输出文档正文，不要任何额外解释。',
  ].filter(Boolean).join('\n')

  // 立即发送状态提示，让用户感知到子代理已开始工作（减少 LLM 首 token 到达前的空白感）
  context.onToken?.('')

  try {
    // 注入主代理对话历史作为背景上下文，使生成内容与用户需求对齐
    const messages = buildMessagesWithContext(context, userMessage)

    const params: LLMRequestParams = {
      baseUrl: context.baseUrl,
      apiKey: context.apiKey,
      format: context.format,
      model: context.model,
      messages,
      systemPrompt,
      temperature: 0.5,
      maxTokens: 8192, // Markdown 文档通常不需要超过 8K tokens；过高会导致生成时间过长
    }

    // 流式调用，实时输出 token 供 UI 显示
    const fullText = await new Promise<string>((resolve, reject) => {
      let accumulated = ''
      streamChat(params, {
        onToken(token: string) {
          accumulated += token
          context.onToken?.(token)
        },
        onThinking(thinking: string) {
          context.onToken?.(thinking)
        },
        onComplete(text: string) {
          resolve(text || accumulated)
        },
        onError(error: Error) {
          reject(error)
        },
      })
    })

    // 清理输出：移除可能被包裹的 markdown 围栏
    // 使用 stripOuterFence 避免误删文档内的内层代码块（这是之前导致文档被严重截断的 bug）
    let docContent = stripOuterFence(fullText)

    // 完整性检查：如果文档异常短，输出警告以便排查
    const contentBytes = new Blob([docContent]).size
    if (contentBytes < 200) {
      console.warn(
        `[SubAgent] 文档生成结果异常短（${contentBytes} 字节），可能被截断。` +
        `原始 LLM 输出长度: ${fullText.length} 字符`
      )
    }

    // 写入磁盘
    const safeName = sanitizeFileName(fileName)
    const filePath = joinPath(context.workDir, safeName)

    try {
      await invoke('agent_write_file', { path: filePath, content: docContent })
      console.log(`[SubAgent] 文档文件已写入: ${filePath}`)
    } catch (writeErr) {
      console.error('[SubAgent] 文档文件写入失败:', writeErr)
      return {
        success: false,
        output: `文档文件写入失败: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`,
      }
    }

    const resultData = {
      type: 'code_edit' as const,
      code: docContent,
      language: format,
      fileName: safeName,
      filePath,
      description,
    }

    const llmMessage = `文档已生成并保存到: ${filePath}\n文件名: ${safeName}\n格式: ${formatLabel}\n文件大小: ${new Blob([docContent]).size} 字节`

    return {
      success: true,
      output: `${SUBAGENT_RESULT_MARKER}${JSON.stringify(resultData)}\n\n${llmMessage}`,
    }
  } catch (err) {
    return {
      success: false,
      output: `文档生成失败: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ─── 从子代理历史中提取文件操作 ─────────────────────────────

/** 文件操作记录 */
interface FileOperation {
  action: string
  path: string
}

/**
 * 从子代理对话历史中提取文件操作元数据。
 * 扫描 assistant(tool_calls) 中的 write_file / delete_path / move_path / copy_path，
 * 将操作类型和文件路径汇总返回给主代理，避免子代理创建的文件路径丢失。
 */
function extractFileOperations(history: ChatMessage[]): FileOperation[] {
  const ops: FileOperation[] = []
  const seen = new Set<string>()

  for (const msg of history) {
    if (msg.role !== 'assistant' || !msg.tool_calls?.length) continue

    for (const tc of msg.tool_calls) {
      const fnName = tc.function?.name
      if (!fnName) continue

      try {
        const args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {}
        switch (fnName) {
          case 'write_file': {
            const path = args.path as string
            if (path && !seen.has(`write:${path}`)) {
              seen.add(`write:${path}`)
              ops.push({ action: '写入', path })
            }
            break
          }
          case 'delete_path': {
            const path = args.path as string
            if (path && !seen.has(`delete:${path}`)) {
              seen.add(`delete:${path}`)
              ops.push({ action: '删除', path })
            }
            break
          }
          case 'move_path': {
            const src = args.source as string
            const dst = args.destination as string
            if (dst && !seen.has(`move:${dst}`)) {
              seen.add(`move:${dst}`)
              ops.push({ action: '移动', path: `${src} → ${dst}` })
            }
            break
          }
          case 'copy_path': {
            const dst = args.destination as string
            if (dst && !seen.has(`copy:${dst}`)) {
              seen.add(`copy:${dst}`)
              ops.push({ action: '复制', path: `${args.source} → ${dst}` })
            }
            break
          }
        }
      } catch {
        // JSON 解析失败，跳过
      }
    }
  }
  return ops
}

// ─── 委托子代理（assign_to_subagent）────────────────────────────

/**
 * 执行 assign_to_subagent 工具：将子任务委托给独立的子 ReAct Agent。
 *
 * 子代理拥有完整的内置工具集（文件/命令/搜索/连接器），
 * 在自己的上下文中运行 ReAct 循环，完成后将结果返回给主代理。
 */
async function executeAssignToSubagent(
  args: Record<string, unknown>,
  context: SubAgentContext,
): Promise<ToolResult> {
  const task = args.task as string
  const contextInfo = (args.context_info as string) || ''

  if (!task) {
    return { success: false, output: '错误：缺少 task 参数，请提供要委托给子代理的任务描述。' }
  }

  if (!context.toolExecutor) {
    return { success: false, output: '错误：子代理工具执行器未配置，无法运行 assign_to_subagent。' }
  }

  // 立即发送状态提示，让用户感知到子代理已开始工作
  context.onToken?.('')

  // 构建子代理完整工具集：内置工具 + 连接器工具 + MCP 工具 + 记忆工具 + 外部技能工具
  const tools = buildInternalToolDefinitions(context.workDir)
  if (context.connectorConfigs && context.connectorConfigs.length > 0) {
    tools.push(...buildConnectorToolDefinitions(context.connectorConfigs))
  }
  // MCP 工具
  try {
    const mcpTools = await buildMCPToolDefinitions(context.mcpServerIds)
    tools.push(...mcpTools)
  } catch (err) {
    console.warn('[SubAgent] 构建 MCP 工具失败:', err)
  }
  // 记忆工具
  tools.push(...buildMemoryToolDefinitions())
  // 外部技能工具
  if (context.skillNames && context.skillNames.length > 0) {
    tools.push(...buildExternalToolDefinitions(context.skillNames))
  }

  // 按工具名去重（内置优先）
  const seen = new Set<string>()
  const dedupedTools = tools.filter((t: ToolDefinition) => {
    if (seen.has(t.function.name)) return false
    seen.add(t.function.name)
    return true
  })

  // 包装执行器，捕获异常并返回 ToolResult
  const safeExecutor = async (name: string, toolArgs: Record<string, unknown>): Promise<ToolResult> => {
    try {
      return await context.toolExecutor!(name, toolArgs)
    } catch (err) {
      return { success: false, output: `工具执行失败: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  // 拼装完整任务描述（含背景信息）
  const fullTask = contextInfo
    ? `${task}\n\n--- 背景信息 ---\n${contextInfo}`
    : task

  try {
    const result = await runSubAgent({
      context,
      task: fullTask,
      tools: dedupedTools,
      executeTool: safeExecutor,
      maxIterations: 15,
      stream: true,
    })

    // 从子代理历史中提取文件操作元数据（写入/创建/删除的文件路径）
    const fileOps = extractFileOperations(result.history)
    const fileOpsSummary = fileOps.length > 0
      ? `\n\n--- 文件操作记录 ---\n${fileOps.map(op => `- [${op.action}] ${op.path}`).join('\n')}\n所有路径均为绝对路径，可直接使用 read_file 读取。`
      : ''

    if (result.finished) {
      // 子代理成功完成，返回结果给主代理 LLM
      const summary = [
        `[子代理执行完成]`,
        `迭代次数: ${result.iterations}`,
        `耗时: ${result.elapsedSeconds.toFixed(1)}s`,
        ``,
        `--- 子代理结果 ---`,
        result.text,
        fileOpsSummary,
      ].join('\n')
      return { success: true, output: summary }
    } else {
      // 子代理未正常完成（达到迭代上限或出错）
      const summary = [
        `[子代理执行未完成]`,
        `迭代次数: ${result.iterations}`,
        `耗时: ${result.elapsedSeconds.toFixed(1)}s`,
        ``,
        `--- 子代理输出 ---`,
        result.text || '（无输出）',
        fileOpsSummary,
      ].join('\n')
      return { success: false, output: summary }
    }
  } catch (err) {
    return {
      success: false,
      output: `子代理执行失败: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
