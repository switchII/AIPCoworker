/**
 * 工具注册中心 — 统一对外暴露工具构建与执行能力。
 *
 * 职责：
 *   1. 合并内置工具 + 外部（技能注入）工具 + MCP 工具，按名称去重（内置优先）
 *   2. 提供统一的工具执行器，依次查找内置 → MCP → 外部工具
 *   3. 保持与原 taskRunner.ts 中 buildTools() / createToolExecutor() 相同的签名
 *
 * 使用方式：
 *   import { buildTools, createToolExecutor } from '@/agent/tools'
 */

import type { ToolDefinition } from '../llm/llmClient'
import type { ToolResult } from '../core/reactAgent'
import type { ConnectorConfig } from '../../types/integration'
import { buildInternalToolDefinitions, executeInternalTool } from './internalTools'
import { buildExternalToolDefinitions, executeExternalTool } from './externalTools'
import { buildMCPToolDefinitions, executeMCPTool } from '../mcp/tools'
import { buildMemoryToolDefinitions, executeMemoryTool } from '../memory'
import { buildSkillToolDefinitions, executeSkillTool } from '../skill'
import { buildSubAgentToolDefinitions, executeSubAgentTool, type SubAgentContext } from '../subagent'
import { buildConnectorToolDefinitions } from '../../data/tool-definitions'
import { buildPlanToolDefinitions, executePlanTool, type PlanContext } from '../plan'
import { optimizeToolResult, shouldOptimizeTool, type ContextOptimizerConfig } from '../context'

// ─── Re-export sub-agent types ──────────────────────────────────────
export type { SubAgentContext } from '../subagent'

// ─── Re-export plan types ──────────────────────────────────────
export type { PlanContext } from '../plan'

// ─── 重导出子模块（方便外部按需引用）──────────────────────────
export { buildInternalToolDefinitions, executeInternalTool } from './internalTools'
export { buildExternalToolDefinitions, executeExternalTool } from './externalTools'
export { buildMemoryToolDefinitions, executeMemoryTool } from '../memory'
export { buildSkillToolDefinitions, executeSkillTool } from '../skill'
export { buildSubAgentToolDefinitions, executeSubAgentTool, SUBAGENT_RESULT_MARKER } from '../subagent'

// ─── 超时工具 ──────────────────────────────────────────────────

/** 工具执行超时时间（毫秒） */
const TOOL_TIMEOUT_MS = 600_000  // 600 秒

/**
 * 为 Promise 添加超时包装。
 * 超时后返回失败结果，不会无限等待。
 */
function withTimeout(promise: Promise<ToolResult>, toolName: string): Promise<ToolResult> {
  return new Promise<ToolResult>((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        success: false,
        output: `工具 "${toolName}" 执行超时（${TOOL_TIMEOUT_MS / 1000}秒），已终止等待。`,
      })
    }, TOOL_TIMEOUT_MS)

    promise.then(
      (result) => { clearTimeout(timer); resolve(result) },
      (error) => { clearTimeout(timer); resolve({ success: false, output: String(error) }) },
    )
  })
}

// ─── 工具列表构建 ──────────────────────────────────────────

/**
 * 合并内置工具 + 连接器工具 + 技能注入的外部工具 + MCP 工具，按工具名去重（内置优先）。
 *
 * @param workDir     工作目录路径
 * @param skillNames  用户选中的技能名称列表
 * @param mcpServerIds  用户选中的 MCP 服务器 ID 列表（可选）
 * @param subAgentContext  子代理上下文（可选）
 * @param connectorConfigs  用户选中的连接器配置列表（可选，仅选中的连接器工具会加载）
 * @param planContext  计划上下文（可选，Plan-Execute 模式时使用）
 */
export async function buildTools(
  workDir: string,
  skillNames: string[],
  mcpServerIds?: string[],
  subAgentContext?: SubAgentContext,
  connectorConfigs?: ConnectorConfig[],
  planContext?: PlanContext,
): Promise<ToolDefinition[]> {
  const internalTools = buildInternalToolDefinitions(workDir)

  // 连接器工具：仅当用户选择了对应连接器时才加载
  const connectorTools = connectorConfigs ? buildConnectorToolDefinitions(connectorConfigs) : []

  const externalTools = buildExternalToolDefinitions(skillNames)

  // 获取记忆工具
  const memoryTools = buildMemoryToolDefinitions()

  // 获取技能管理工具
  const skillTools = buildSkillToolDefinitions()

  // 获取子代理工具（HTML 生成、代码生成、assign_to_subagent）
  const subAgentTools = subAgentContext ? buildSubAgentToolDefinitions(subAgentContext) : []

  // 获取计划管理工具（Plan-Execute 模式）
  const planTools = planContext ? buildPlanToolDefinitions() : []

  // 获取 MCP 工具
  let mcpTools: ToolDefinition[] = []
  try {
    mcpTools = await buildMCPToolDefinitions(mcpServerIds)
  } catch (err) {
    console.warn('[ToolRegistry] 构建 MCP 工具列表失败:', err)
  }

  // 按工具名去重，优先级：内置 > 连接器 > 计划 > 记忆 > 技能管理 > 子代理 > MCP > 外部
  const seen = new Set<string>()
  const tools: ToolDefinition[] = []

  for (const tool of [...internalTools, ...connectorTools, ...planTools, ...memoryTools, ...skillTools, ...subAgentTools, ...mcpTools, ...externalTools]) {
    const name = tool.function.name
    if (!seen.has(name)) {
      seen.add(name)
      tools.push(tool)
    }
  }

  return tools
}

// ─── 统一工具执行器 ────────────────────────────────────────

/**
 * 创建统一的工具执行器。
 *
 * 执行顺序：内置（含连接器）→ 计划 → 记忆 → 技能管理 → MCP → 外部 → 均未命中则返回错误。
 * 所有工具调用均受超时保护（600秒）。
 * 签名与原 taskRunner.ts 中的 createToolExecutor() 保持一致。
 */
export function createToolExecutor(
  workDir: string,
  subAgentContext?: SubAgentContext,
  connectorConfigs?: ConnectorConfig[],
  planContext?: PlanContext,
  contextOptimizerConfig?: ContextOptimizerConfig,
) {
  return async (name: string, args: Record<string, unknown>, toolCallId?: string): Promise<ToolResult> => {
    console.log(`[ToolExecutor] 执行工具: ${name}(${JSON.stringify(args)})，工作目录: ${workDir}`)

    // 执行工具并添加超时保护
    const execute = async (): Promise<ToolResult> => {
      // 优先查找内置工具（含连接器工具）
      const internalResult = await executeInternalTool(name, args, workDir, connectorConfigs)
      if (internalResult !== null) return internalResult

      // 再查找计划工具
      if (planContext) {
        const planResult = executePlanTool(name, args, planContext)
        if (planResult !== null) return planResult
      }

      // 再查找记忆工具
      const memoryResult = await executeMemoryTool(name, args)
      if (memoryResult !== null) return memoryResult

      // 再查找技能管理工具
      const skillResult = await executeSkillTool(name, args)
      if (skillResult !== null) return skillResult

      // 再查找子代理工具（HTML 生成、代码生成）
      if (subAgentContext) {
        // 设置 toolCallId 到子代理上下文
        const contextWithToolCallId = { ...subAgentContext, toolCallId }
        const subAgentResult = await executeSubAgentTool(name, args, contextWithToolCallId)
        if (subAgentResult !== null) return subAgentResult
      }

      // 再查找 MCP 工具
      const mcpResult = await executeMCPTool(name, args, workDir)
      if (mcpResult !== null) return mcpResult

      // 最后查找外部工具
      const externalResult = await executeExternalTool(name, args, workDir)
      if (externalResult !== null) return externalResult

      // 未知工具
      return { success: false, output: `未知工具: ${name}` }
    }

    let result = await withTimeout(execute(), name)

    // 上下文优化：对大型工具返回结果进行压缩
    if (contextOptimizerConfig && shouldOptimizeTool(name) && result.success) {
      try {
        result = await optimizeToolResult(name, result, contextOptimizerConfig)
      } catch (err) {
        console.warn(`[ToolExecutor] 上下文优化失败 (${name}):`, err)
        // 优化失败不影响结果，继续使用原始结果
      }
    }

    return result
  }
}
