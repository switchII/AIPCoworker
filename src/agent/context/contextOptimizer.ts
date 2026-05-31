/**
 * 上下文优化工具 — 自动压缩大型工具返回结果。
 *
 * 当工具（MCP、内置、连接器等）返回的内容超过阈值时：
 *   1. 将完整内容保存到用户工作目录下的 .context_cache/ 子目录
 *   2. 通过子代理（LLM）生成内容摘要
 *   3. 将优化后的结果（摘要 + 文件路径）返回给主 Agent
 *
 * 这样可以显著减少 LLM 上下文窗口的占用，避免 token 超限。
 *
 * 使用方式：
 *   import { optimizeToolResult, type ContextOptimizerConfig } from '@/agent/context'
 *
 *   const optimized = await optimizeToolResult(toolName, result, config)
 */

import { chatRaw, type ChatMessage, type LLMRequestParams } from '../llm/llmClient'
import type { ToolResult } from '../core/reactAgent'
import { invoke } from '@tauri-apps/api/core'

// ─── 配置 ────────────────────────────────────────────────────

/** 上下文优化器的配置 */
export interface ContextOptimizerConfig {
  /** 触发优化的字符数阈值（默认 20000） */
  threshold?: number
  /** LLM 配置（用于生成摘要） */
  llm: {
    baseUrl: string
    apiKey: string
    format: LLMRequestParams['format']
    model: string
  }
  /** 用户选择的工作目录（缓存文件保存到此目录下） */
  workDir: string
  /** 是否启用优化（默认 true） */
  enabled?: boolean
}

// ─── 常量 ────────────────────────────────────────────────────

/** 默认触发阈值：40000 字符（约 4000 tokens） */
const DEFAULT_THRESHOLD = 40000

/** 摘要的最大长度（字符） */
const MAX_SUMMARY_LENGTH = 3000

/** 缓存目录名（在工作目录下的隐藏目录） */
const CACHE_DIR = '.context_cache'

// ─── 核心函数 ────────────────────────────────────────────────

/**
 * 优化工具返回结果。
 * 如果内容超过阈值，则保存到文件并返回摘要 + 路径。
 * 如果内容较小或优化失败，返回原始结果。
 */
export async function optimizeToolResult(
  toolName: string,
  result: ToolResult,
  config: ContextOptimizerConfig,
): Promise<ToolResult> {
  // 未启用时直接返回
  if (config.enabled === false) return result

  const content = result.output
  const threshold = config.threshold ?? DEFAULT_THRESHOLD

  // 内容未超阈值，不处理
  if (content.length <= threshold) return result

  console.log(`[ContextOptimizer] 工具 "${toolName}" 返回内容过大 (${content.length} 字符)，开始优化...`)

  try {
    // 1. 保存完整内容到缓存文件（在用户工作目录下）
    const filePath = await saveToCache(toolName, content, config.workDir)

    // 2. 通过子代理生成摘要
    const summary = await generateSummary(toolName, content, config)

    // 3. 构建优化后的输出
    const optimizedOutput = [
      `[内容已优化] 原始大小: ${content.length} 字符`,
      `完整内容已保存到: ${filePath}`,
      ``,
      `--- 内容摘要 ---`,
      summary,
      `--- 摘要结束 ---`,
      ``,
      `如需查看完整内容，请使用 read_file 工具读取上述文件。`,
    ].join('\n')

    console.log(`[ContextOptimizer] 优化完成: ${content.length} -> ${optimizedOutput.length} 字符`)

    return {
      ...result,
      output: optimizedOutput,
    }
  } catch (err) {
    console.warn('[ContextOptimizer] 优化失败，返回原始结果:', err)
    // 优化失败时，截断内容但仍返回（避免上下文爆炸）
    return {
      ...result,
      output: truncateWithNotice(content, toolName),
    }
  }
}

// ─── 文件存储 ────────────────────────────────────────────────

/**
 * 将内容保存到用户工作目录下的 .context_cache/ 子目录。
 * 文件名格式：{timestamp}_{tool_name}.txt
 * 返回完整文件路径。
 */
async function saveToCache(
  toolName: string,
  content: string,
  workDir: string,
): Promise<string> {
  const timestamp = Date.now()
  const safeToolName = toolName.replace(/[^a-zA-Z0-9_-]/g, '_')
  const fileName = `${timestamp}_${safeToolName}.txt`
  const filePath = `${workDir}/${CACHE_DIR}/${fileName}`

  // 使用 agent_write_file 命令写入文件（自动创建目录）
  await invoke('agent_write_file', { path: filePath, content })

  console.log(`[ContextOptimizer] 缓存已保存到工作目录: ${filePath}`)
  return filePath
}

// ─── 摘要生成 ────────────────────────────────────────────────

/**
 * 通过子代理（LLM）生成内容摘要。
 * 使用非流式调用，快速返回。
 */
async function generateSummary(
  toolName: string,
  content: string,
  config: ContextOptimizerConfig,
): Promise<string> {
  // 截取内容的前 30000 字符用于摘要（避免摘要请求本身过大）
  const contentForSummary = content.length > 30000
    ? content.slice(0, 30000) + '\n\n... [内容过长已截断]'
    : content

  const systemPrompt = [
    '你是一个专业的内容摘要生成器。你的任务是为核心内容生成简洁、准确的中文摘要。',
    '',
    '规则：',
    '1. 摘要应保留关键信息、主要结论和重要细节',
    '2. 使用清晰的结构（标题、要点）组织摘要',
    '3. 如果内容是代码，说明代码的功能和主要函数/类',
    '4. 如果内容是数据，说明数据的结构和关键字段',
    '5. 如果内容是命令输出，说明执行结果和关键信息',
    '6. 摘要长度控制在 200-500 字之间',
    '',
    '输出格式：直接输出摘要内容，不要添加额外说明。',
  ].join('\n')

  const userMessage = `请为以下工具 "${toolName}" 的返回结果生成摘要：\n\n${contentForSummary}`

  const messages: ChatMessage[] = [{ role: 'user', content: userMessage }]

  const params: LLMRequestParams = {
    baseUrl: config.llm.baseUrl,
    apiKey: config.llm.apiKey,
    format: config.llm.format,
    model: config.llm.model,
    messages,
    systemPrompt,
    temperature: 0.3,
    maxTokens: 1000,
  }

  const response = await chatRaw(params)
  let summary = response.text.trim()

  // 限制摘要长度
  if (summary.length > MAX_SUMMARY_LENGTH) {
    summary = summary.slice(0, MAX_SUMMARY_LENGTH) + '...'
  }

  return summary || '（摘要生成失败）'
}

// ─── 降级处理 ────────────────────────────────────────────────

/**
 * 当优化完全失败时的降级方案：截断内容并添加提示。
 */
function truncateWithNotice(content: string, toolName: string): string {
  const maxLen = 15000
  if (content.length <= maxLen) return content

  return [
    `[工具 "${toolName}" 返回内容过大，已截断显示前 ${maxLen} 字符]`,
    '',
    content.slice(0, maxLen),
    '',
    `... [已截断：原始内容共 ${content.length} 字符，仅显示前 ${maxLen} 字符]`,
  ].join('\n')
}

// ─── 工具名过滤 ──────────────────────────────────────────────

/** 不需要优化的工具（输出通常很小或是二进制内容） */
const SKIP_TOOLS = new Set([
  'update_plan_item',
  'add_plan_item',
  'remove_plan_item',
  'get_plan',
  'ask_user',
  'skill_load',
  'skill_list',
  'skill_install',
  'skill_uninstall',
  'memory_get',
  'memory_set',
  'memory_search',
])

/**
 * 判断工具是否需要上下文优化。
 * 排除控制类工具和输出通常很小的工具。
 */
export function shouldOptimizeTool(toolName: string): boolean {
  if (SKIP_TOOLS.has(toolName)) return false
  // 子代理工具（generate_*）有自己的处理逻辑，不优化
  if (toolName.startsWith('generate_')) return false
  return true
}
