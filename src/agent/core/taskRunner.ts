/**
 * 任务运行器 — NewTask.vue 与 ReAct Agent 之间的桥梁。
 *
 * 职责：
 *   1. 接收用户在 NewTask 页面选择的所有配置（模型、目录、技能、套件、消息）
 *   2. 将模型 ID 解析为 LLM 连接参数（从 ProviderInstance 列表中查找）
 *   3. 根据选中的技能/套件构建工具定义和执行器
 *   4. 调用 runReActAgent 执行任务循环
 *   5. 通过事件回调向 UI 层推送实时状态
 *
 * 使用方式：
 *   import { TaskRunner } from '@/agent/core/taskRunner'
 *
 *   const runner = new TaskRunner({
 *     modelId: 'gpt-4o',
 *     providers: store.providers,
 *     workDir: '/path/to/project',
 *     skillNames: ['web-search'],
 *     suiteNames: [],
 *     userMessage: '帮我分析这份数据',
 *   })
 *
 *   // 监听事件
 *   runner.on('token', (token) => { ... })
 *   runner.on('thinking', (text) => { ... })
 *   runner.on('step', (step) => { ... })
 *   runner.on('toolCallStart', (tc) => { ... })
 *   runner.on('toolCallEnd', (tc, result) => { ... })
 *   runner.on('complete', (result) => { ... })
 *   runner.on('error', (err) => { ... })
 *
 *   // 启动
 *   await runner.start()
 *
 *   // 取消
 *   runner.abort()
 */

import {
  runReActAgent,
  type ReActAgentParams,
  type ReActLLMConfig,
  type ReActResult,
  type ReActStep,
  type ReActStreamCallbacks,
  type ReActRequestPayload,
  type ToolResult,
} from './reactAgent'
import { generatePlan, assessAndPlan, buildPlanAwarePrompt, type PlanStreamCallbacks } from './planAgent'
import type { PlanItem } from '../../types/task'
import type { ChatMessage, ToolCall } from '../llm/llmClient'
import type { ProviderInstance } from '../../types/llm'
import type { ClarificationQuestion, ClarificationAnswer } from '../../types/task'
import { buildTools, createToolExecutor, type SubAgentContext, type PlanContext } from '../tools'
import { ContextCompressor, type ContextCompressorConfig, type ContextOptimizerConfig } from '../context'
import { SUBAGENT_RESULT_MARKER } from '../subagent'
import { getMemoryManager } from '../memory'
import { getLogger } from '../logger'
import { loadAllInstalledSkills, loadSkillsByIdentifiers, formatSkillIndex, formatSkillsForPrompt } from '../skill'
import { useAgentStore } from '../../stores/agentStore'
import type { ConnectorConfig } from '../../types/integration'
import { invoke } from '@tauri-apps/api/core'

// ─── 公共类型 ──────────────────────────────────────────────

/** 创建 TaskRunner 所需的配置 */
export interface TaskRunnerConfig {
  /** 任务 ID（用于日志追踪，可选） */
  taskId?: string
  /** 用户在 ModelPicker 中选中的模型 ID */
  modelId: string
  /** 当前所有已配置的 LLM 供应商列表（来自 agentStore.providers） */
  providers: ProviderInstance[]
  /** 用户选择的工作目录 */
  workDir: string
  /** 用户选中的技能名称列表 */
  skillNames: string[]
  /** 用户选中的套件名称列表 */
  suiteNames: string[]
  /** 用户选中的 MCP 服务器 ID 列表 */
  mcpServerIds?: string[]
  /** 用户选中的连接器 ID 列表（对应 useConnectorManager 中的连接器） */
  connectorIds?: string[]
  /** 用户输入的消息/任务描述 */
  userMessage: string
  /** 可选的系统提示（不传则自动根据技能/套件生成） */
  systemPrompt?: string
  /** 最大迭代次数（不传则使用 reactAgent 的 DEFAULT_MAX_ITERATIONS = 100） */
  maxIterations?: number
  /** 是否启用流式输出（默认 true） */
  stream?: boolean
  /** 已有的对话历史（多轮对话时使用） */
  history?: ChatMessage[]
  /** 执行模式：'auto' | 'react' | 'plan_execute'，默认 'auto' */
  executionMode?: 'auto' | 'react' | 'plan_execute'
}

/** TaskRunner 支持的事件类型 */
export interface TaskRunnerEvents {
  /** 文本 token 流入 */
  token: (token: string) => void
  /** 思考/推理 token */
  thinking: (thinking: string) => void
  /** ReAct 步骤完成 */
  step: (step: ReActStep) => void
  /** 工具调用开始 */
  toolCallStart: (toolCall: ToolCall) => void
  /** 工具调用结束 */
  toolCallEnd: (toolCall: ToolCall, result: ToolResult) => void
  /** 任务完成 */
  complete: (result: ReActResult) => void
  /** 发生错误 */
  error: (error: Error) => void
  /** 任务被取消 */
  abort: () => void
  /** 问题澄清请求：Agent 需要用户回答问题后继续 */
  clarification: (request: ClarificationRequest) => void
  /** 每次 LLM 请求前触发（调试用，查看发送的提示词） */
  prompt: (payload: ReActRequestPayload) => void
  /** 子代理开始执行（HTML/代码生成） */
  subagentStart: (payload: SubAgentStartPayload) => void
  /** 子代理执行完成 */
  subagentEnd: (payload: SubAgentEndPayload) => void
  /** 子代理流式输出 token（实时显示生成内容） */
  subagentToken: (token: string, toolCallId?: string) => void
  /** 子代理 ReAct 迭代完成（仅 assign_to_subagent 触发，每次迭代后推送步骤信息） */
  subagentIteration: (payload: SubAgentIterationPayload) => void
  /** 计划已创建（Plan-Execute 模式） */
  planCreated: (planItems: PlanItem[]) => void
  /** 计划生成开始（创建 plan_output block） */
  planStart: () => void
  /** 计划阶段的思考 token（与执行阶段的 thinking 区分） */
  planThinking: (thinking: string) => void
  /** 计划生成阶段的流式 token（JSON 输出，非思考内容） */
  planToken: (token: string) => void
  /** 计划项更新（状态变化） */
  planItemUpdate: (planItem: PlanItem) => void
  /** 计划项被移除 */
  planItemRemove: (itemId: string) => void
}

/** 子代理开始执行时的载荷 */
export interface SubAgentStartPayload {
  /** 子代理工具名称 */
  toolName: string
  /** 生成任务描述 */
  description: string
  /** 生成类型 */
  type: 'html_render' | 'code_edit' | 'document' | 'sub_agent'
  /** 对应的 toolCall ID（用于追踪多个并发的子代理） */
  toolCallId?: string
  /** 最大迭代次数（仅 sub_agent 类型使用） */
  maxIterations?: number
}

/** 子代理执行完成时的载荷 */
export interface SubAgentEndPayload {
  /** 子代理工具名称 */
  toolName: string
  /** 是否成功 */
  success: boolean
  /** 生成类型 */
  type: 'html_render' | 'code_edit' | 'document' | 'sub_agent'
  /** 对应的 toolCall ID（用于追踪多个并发的子代理） */
  toolCallId?: string
  /** 结果数据（成功时） */
  result?: {
    htmlContent?: string
    code?: string
    language?: string
    fileName?: string
    filePath?: string
    title?: string
    /** assign_to_subagent 子代理返回的文本结果 */
    text?: string
  }
  /** 错误信息（失败时） */
  error?: string
}

/** 子代理 ReAct 循环迭代完成时的载荷（仅 assign_to_subagent 使用） */
export interface SubAgentIterationPayload {
  /** 迭代编号（从 1 开始） */
  iteration: number
  /** 本次迭代的 LLM 思考内容 */
  thinking: string
  /** 本次迭代调用的工具名称列表 */
  toolNames: string[]
  /** 工具执行结果摘要 */
  toolResults: { name: string; success: boolean; summary: string; args?: Record<string, unknown> }[]
  /** 是否自然结束（无更多工具调用） */
  finished: boolean
  /** 对应的 toolCall ID */
  toolCallId?: string
}

/** 澄清请求载荷 */
export interface ClarificationRequest {
  /** 澄清问题列表 */
  questions: ClarificationQuestion[]
  /** 提交答案后继续执行（由 TaskRunner 注入） */
  submit: (answers: ClarificationAnswer[]) => void
}

// ─── TaskRunner 类 ──────────────────────────────────────────

export class TaskRunner {
  private config: TaskRunnerConfig
  private listeners: { [K in keyof TaskRunnerEvents]?: TaskRunnerEvents[K][] } = {}
  private aborted = false
  private running = false
  private abortController: AbortController | null = null

  /** 等待用户回答的 pending resolve 函数 */
  private pendingClarificationResolve: ((result: ToolResult) => void) | null = null

  constructor(config: TaskRunnerConfig) {
    this.config = config
  }

  // ── 事件系统 ──

  /** 注册事件监听 */
  on<K extends keyof TaskRunnerEvents>(event: K, handler: TaskRunnerEvents[K]): this {
    if (!this.listeners[event]) {
      this.listeners[event] = []
    }
    this.listeners[event]!.push(handler as any)
    return this
  }

  /** 移除事件监听 */
  off<K extends keyof TaskRunnerEvents>(event: K, handler: TaskRunnerEvents[K]): this {
    const list = this.listeners[event]
    if (list) {
      this.listeners[event] = list.filter((h) => h !== handler) as any
    }
    return this
  }

  /** 触发事件 */
  private emit<K extends keyof TaskRunnerEvents>(event: K, ...args: Parameters<TaskRunnerEvents[K]>): void {
    const list = this.listeners[event]
    if (list) {
      for (const handler of list) {
        ;(handler as (...a: any[]) => void)(...args)
      }
    }
  }

  // ── 模型解析 ──

  /**
   * 根据 modelId 从 providers 列表中解析出 LLM 连接配置。
   * 如果找不到，抛出错误。
   */
  private resolveLLMConfig(): ReActLLMConfig {
    const { modelId, providers } = this.config

    for (const provider of providers) {
      if (!provider.enabled) continue
      const model = provider.models.find((m) => m.id === modelId)
      if (model) {
        return {
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          format: provider.apiFormat,
          model: modelId,
          contextWindow: model.contextWindow,
        }
      }
    }

    // 回退：使用第一个可用的供应商
    const firstEnabled = providers.find((p) => p.enabled && p.models.length > 0)
    if (firstEnabled) {
      const fallbackModel = firstEnabled.models[0]
      return {
        baseUrl: firstEnabled.baseUrl,
        apiKey: firstEnabled.apiKey,
        format: firstEnabled.apiFormat,
        model: fallbackModel.id,
        contextWindow: fallbackModel.contextWindow,
      }
    }

    throw new Error(`未找到模型 "${modelId}" 对应的供应商配置，请先在设置中添加 LLM 供应商`)
  }

  // ── 上下文压缩器 ──

  /**
   * 创建上下文压缩器。
   * 根据模型的 contextWindow 自动配置压缩参数。
   * 如果模型没有声明 contextWindow，使用默认值 128000。
   */
  private createContextCompressor(llm: ReActLLMConfig): ContextCompressor {
    // 使用模型的 contextWindow，如果未声明则使用默认值
    const maxContextTokens = llm.contextWindow ?? 128000

    const compressorConfig: ContextCompressorConfig = {
      maxContextTokens,
      triggerRatio: 0.75,
      keepRecentMessages: 6,
      keepSystemPrompt: true,
      maxSummaryTokens: 2000,
      charsPerToken: 4,
      enabled: true,
      llm: {
        baseUrl: llm.baseUrl,
        apiKey: llm.apiKey,
        format: llm.format,
        model: llm.model,
      },
    }

    console.log(
      `[TaskRunner] 创建上下文压缩器: maxContextTokens=${maxContextTokens}, ` +
      `triggerRatio=${compressorConfig.triggerRatio}, keepRecentMessages=${compressorConfig.keepRecentMessages}`
    )

    return new ContextCompressor(compressorConfig)
  }

  // ── 系统提示生成 ──

  /** 根据技能和工作目录生成系统提示（含记忆上下文） */
  private async buildSystemPrompt(): Promise<string> {
    if (this.config.systemPrompt) {
      return this.config.systemPrompt
    }

    const { workDir, skillNames, suiteNames } = this.config
    const sections: string[] = []

    // ── 角色定义 ──
    sections.push(
      '# 角色',
      '你是 AIPCowork — 一个专业的 AI 协同办公助手。你运行在用户的本地桌面环境中，',
      '能够通过工具直接操作文件系统、执行命令和搜索信息。你的目标是高效、准确地完成用户交代的任务。',
    )

    // ── 环境信息 ──
    let envLines: string[] = [
      `- 工作目录: ${workDir || '（未指定）'}`,
      '- 运行平台: 本地桌面应用（Tauri）',
      '- 文件系统: 拥有真实读写权限，操作会立即生效',
    ]
    try {
      const sysInfo = await invoke<{
        os: string
        os_version: string
        kernel_version: string
        hostname: string
        cpu_brand: string
        cpu_cores: number
        total_memory_mb: number
        available_memory_mb: number
        username: string
        arch: string
        current_time: string
      }>('get_system_info')
      envLines = [
        `- 操作系统: ${sysInfo.os_version}`,
        `- 内核版本: ${sysInfo.kernel_version}`,
        `- 系统架构: ${sysInfo.arch}`,
        `- 主机名: ${sysInfo.hostname}`,
        `- 用户名: ${sysInfo.username}`,
        `- CPU: ${sysInfo.cpu_brand}（${sysInfo.cpu_cores} 核）`,
        `- 内存: ${sysInfo.total_memory_mb} MB 总计 / ${sysInfo.available_memory_mb} MB 可用`,
        `- 工作目录: ${workDir || '（未指定）'}`,
        `- 当前时间: ${sysInfo.current_time}`,
        '- 文件系统: 拥有真实读写权限，操作会立即生效',
      ]
    } catch (err) {
      console.warn('[TaskRunner] 获取系统信息失败:', err)
    }
    sections.push('', '# 环境', ...envLines)

    if (skillNames.length > 0) {
      sections.push(`- 已启用技能: ${skillNames.join('、')}`)
    }
    if (suiteNames.length > 0) {
      sections.push(`- 已启用套件: ${suiteNames.join('、')}`)
    }

    // ── 连接器信息 ──
    const connectorConfigs = this.resolveConnectorConfigs()
    if (connectorConfigs.length > 0) {
      sections.push('', '# 可用连接器', '以下连接器已激活，你可以使用对应的工具操作远程服务器和数据库：')
      for (const conn of connectorConfigs) {
        const typeLabel = conn.type === 'ssh' ? 'SSH 服务器'
          : conn.type === 'mysql' ? 'MySQL 数据库'
          : 'PostgreSQL 数据库'
        const host = conn.type === 'ssh'
          ? `${conn.ssh?.host || '?'}:${conn.ssh?.port || 22}`
          : `${conn.db?.host || '?'}:${conn.db?.port || 3306}/${conn.db?.database || ''}`
        const toolNames = conn.type === 'ssh'
          ? `ssh_exec_${conn.id}, ssh_read_file_${conn.id}`
          : conn.type === 'mysql'
          ? `mysql_query_${conn.id}, mysql_list_tables_${conn.id}`
          : `pg_query_${conn.id}, pg_list_tables_${conn.id}`
        sections.push(`- **${conn.name}** (${typeLabel}): ${host}，可用工具: ${toolNames}`)
      }
    }

    // ── 工具使用规范 ──
    sections.push(
      '',
      '# 工具使用规范',
      '1. 你可以在一次思考中同时调用多个工具。无依赖关系的工具会按顺序执行',
      '2. 读取文件前先确认文件路径正确；写入文件时确保内容完整',
      '3. 执行命令时使用工作目录作为基准路径',
      '4. 每次工具调用后检查返回结果，确认成功再继续下一步',
      '5. 如果工具执行失败，分析错误原因后重试或换用其他方案',
      '6. 如果任务描述不够清晰，使用 ask_user 工具向用户提问澄清，避免猜测',
      '7. **优先使用专用内置工具，而非通过 run_command 执行等效的 shell 命令**：',
      '   - 发起 HTTP 请求时，使用 http_fetch（不要用 curl / wget / Invoke-WebRequest）',
      '   - 读取文件内容时，使用 read_file（不要用 cat / type / Get-Content）',
      '   - 写入文件内容时，使用 write_file（不要用 echo > / Set-Content）',
      '   - 列出目录时，使用 list_directory（不要用 ls / dir）',
      '   - 搜索文件时，使用 glob_search（不要用 find / Get-ChildItem）',
      '   - 搜索文件内容时，使用 ripgrep_search（不要用 grep / Select-String）',
      '   - 复制/移动/删除文件时，使用 copy_path / move_path / delete_path（不要用 cp / mv / rm）',
      '   - 在远程服务器上执行命令时，使用对应的 ssh_exec_<connectorId> 工具（不要用 run_command）',
      '   - 操作远程数据库时，使用对应的 mysql_query_<connectorId> / pg_query_<connectorId> 工具',
      '   专用工具跨平台兼容、有安全守卫、输出更简洁，始终优于 shell 命令',
      '8. **所有文件操作必须在工作目录内进行**，不要在工作目录之外创建、读取或修改文件',
      '9. **创建或写入文件时的工具选择规则（非常重要）**：',
      '   - 生成 HTML 页面（任何包含 <html> 的文件）→ 必须用 generate_html_page',
      '   - 生成代码文件（.py/.js/.ts/.java/.go/.rs/.sh 等，超过 10 行）→ 必须用 generate_code_file',
      '   - 生成文档文件（.md/.txt/.rst/.adoc 等，超过 10 行）→ 必须用 generate_document',
      '   - write_file 仅限以下场景使用：',
      '     a) 数据文件：JSON / YAML / CSV / XML / INI / TOML',
      '     b) 短小配置片段（少于 10 行的 .env、配置文件补丁等）',
      '     c) 对已有文件做局部修改（替换某几行内容）',
      '   - **绝对禁止**用 write_file 生成代码、HTML 页面或长篇文档 — 会导致内容截断和格式错误',
      '10. **通过 run_command 执行脚本生成文件时（如 PPT、Excel、PDF 等），必须在命令输出中明确列出生成的文件路径**，例如：`已生成文件: report.pptx`。这样系统才能自动追踪产物。',
      '11. **对于复杂的多步骤子任务，使用 assign_to_subagent 委托给子代理**：',
      '    - 子代理拥有独立上下文和工具集，适合独立的专项任务',
      '    - 适用场景：多文件汇总分析、独立研究报告、复杂代码重构等',
      '    - 子代理完成后会自动返回结果，不占用主代理上下文',
    )

    // ── 工作原则 ──
    sections.push(
      '',
      '# 工作原则',
      '1. **先分析再行动**：理解任务全貌后再规划执行步骤',
      '2. **渐进式执行**：每完成一步验证结果，确保方向正确',
      '3. **安全优先**：涉及文件删除、覆盖等破坏性操作时，先确认路径和影响范围',
      '4. **透明沟通**：遇到不确定的情况时，向用户说明现状并请求指导',
      '5. **简洁回复**：用清晰的中文汇报结果，避免冗余信息',
      '6. **主动利用技能**：在执行任务前，先查看「可用技能索引」。如果有相关技能，',
      '   务必先调用 skill_load 加载完整指令再执行，而不是直接用通用方法。',
      '   例如：生成报告/图表/信息图前，检查是否有 infographic、report 等相关技能可用。',
    )

    // ── 输出格式 ──
    sections.push(
      '',
      '# 输出要求',
      '- **必须始终使用中文回复**，包括思考过程、工具调用说明和最终回答',
      '- 禁止在同一段回复中混用中文和英文，统一使用中文表达',
      '- 代码、命令、文件路径、变量名等技术标识符可保持原始语言',
      '- 汇报执行结果时，简要说明做了什么、结果如何',
      '- 如果任务涉及多个步骤，按顺序清晰列出',
    )

    // ── 记忆上下文 ──
    try {
      const mm = getMemoryManager()
      await mm.init()
      const memoryContext = mm.getMemoryContextForPrompt(this.config.userMessage)
      if (memoryContext) {
        sections.push('', memoryContext)
      }
    } catch (err) {
      console.warn('[TaskRunner] 加载记忆上下文失败:', err)
    }

    // ── 加载已安装技能并注入系统提示 ──
    // 1. 所有已安装技能仅加载轻量级索引（名称 + 描述），不注入完整 SKILL.md 内容
    // 2. 用户显式选中的技能加载完整内容注入提示
    try {
      const allSkills = await loadAllInstalledSkills()

      if (allSkills.length > 0) {
        const indexPrompt = formatSkillIndex(allSkills)
        if (indexPrompt) {
          sections.push('', indexPrompt)
          console.log(`[TaskRunner] 已注入 ${allSkills.length} 个技能的轻量级索引`)
        }
      }

      // 用户选中的技能 + 套件包含的技能：加载完整 SKILL.md 内容
      const allSkillNames = this.resolveAllSkillNames()
      if (allSkillNames.length > 0) {
        const selected = await loadSkillsByIdentifiers(allSkillNames)
        if (selected.length > 0) {
          const fullPrompt = formatSkillsForPrompt(selected)
          if (fullPrompt) {
            sections.push('', fullPrompt)
            console.log(`[TaskRunner] 已注入 ${selected.length} 个选中技能的完整内容（含套件技能）`)
          }
        } else {
          console.warn('[TaskRunner] 未找到匹配的技能内容:', allSkillNames)
        }
      }
    } catch (err) {
      console.warn('[TaskRunner] 加载技能内容失败:', err)
    }

    // ── 多轮对话上下文提示 ──
    // 如果有历史对话，提示 AI 当前是继续对话，需继承前文上下文
    if (this.config.history && this.config.history.length > 0) {
      const historyMsgCount = this.config.history.length
      const userMsgCount = this.config.history.filter(m => m.role === 'user').length
      sections.push(
        '',
        '# 对话上下文',
        `这是与用户的第 ${userMsgCount + 1} 轮对话（消息历史中共有 ${historyMsgCount} 条消息）。`,
        '用户的消息历史已在下方完整提供，你必须：',
        '1. 仔细阅读并理解之前的完整对话历史（包括工具调用和结果）',
        '2. 基于前文上下文回答用户的最新问题，不要重复之前已完成的工作',
        '3. 如果用户引用了之前讨论的内容，从历史中找到相关上下文并据此回答',
        '4. 保持与前文一致的上下文和认知，不要“忘记”之前发生的事情',
      )
      console.log(`[TaskRunner] 已注入多轮对话上下文提示: ${historyMsgCount} 条历史消息`)
    }

    return sections.join('\n')
  }

  // ── 工具构建 ──

  /** 合并内置工具 + 连接器工具 + 技能工具 + MCP 工具 + 子代理工具 + 计划工具，去重（委托给 tools 模块） */
  private async buildTools(planContext?: PlanContext) {
    console.log('[TaskRunner] 开始构建工具列表...')
    console.log('[TaskRunner] workDir:', this.config.workDir)
    console.log('[TaskRunner] skillNames:', this.config.skillNames)
    console.log('[TaskRunner] mcpServerIds:', this.config.mcpServerIds)
    console.log('[TaskRunner] connectorIds:', this.config.connectorIds)

    // 解析 LLM 配置以传递给子代理工具
    const llm = this.resolveLLMConfig()

    // 解析用户选中的连接器配置（提前声明，以便注入子代理上下文）
    const connectorConfigs = this.resolveConnectorConfigs()
    if (connectorConfigs.length > 0) {
      console.log('[TaskRunner] 已加载连接器:', connectorConfigs.map(c => `${c.name}(${c.type})`))
    }

    const subAgentContext: SubAgentContext = {
      baseUrl: llm.baseUrl,
      apiKey: llm.apiKey,
      format: llm.format,
      model: llm.model,
      workDir: this.config.workDir,
      connectorConfigs,
      mcpServerIds: this.config.mcpServerIds,
      skillNames: this.resolveAllSkillNames(),
      // 主代理对话历史：初始化为多轮对话历史，
      // 在 start() 中会通过 onStep 回调持续追加主代理的实时步骤，
      // 确保生成子代理能看到主代理的完整上下文（用户需求 + 已读取的文件 + 已分析的结果）
      conversationHistory: this.config.history ? [...this.config.history] : [],
      // 综合工具执行器：子代理可调用内置 + 连接器 + MCP + 记忆 + 外部技能工具
      toolExecutor: async (name: string, args: Record<string, unknown>) => {
        // 1. 内置工具（含连接器工具）
        const { executeInternalTool } = await import('../tools/internalTools')
        const internalResult = await executeInternalTool(name, args, this.config.workDir, connectorConfigs)
        if (internalResult !== null) return internalResult

        // 2. MCP 工具
        const { executeMCPTool } = await import('../mcp/tools')
        const mcpResult = await executeMCPTool(name, args, this.config.workDir)
        if (mcpResult !== null) return mcpResult

        // 3. 记忆工具
        const { executeMemoryTool } = await import('../memory')
        const memoryResult = await executeMemoryTool(name, args)
        if (memoryResult !== null) return memoryResult

        // 4. 外部技能工具
        const { executeExternalTool } = await import('../tools/externalTools')
        const externalResult = await executeExternalTool(name, args, this.config.workDir)
        if (externalResult !== null) return externalResult

        return { success: false, output: `未知工具: ${name}` } as ToolResult
      },
    }

    const tools = await buildTools(
      this.config.workDir,
      this.resolveAllSkillNames(),
      this.config.mcpServerIds,
      subAgentContext,
      connectorConfigs,
      planContext,
    )

    console.log(`[TaskRunner] 构建完成，总共 ${tools.length} 个工具:`)
    console.log('[TaskRunner] 工具列表:', tools.map(t => t.function.name))

    return { tools, subAgentContext, connectorConfigs }
  }

  /** 根据 connectorIds 从 Pinia store 中解析出对应的 ConnectorConfig 列表 */
  private resolveConnectorConfigs(): ConnectorConfig[] {
    const ids = this.config.connectorIds
    if (!ids || ids.length === 0) return []

    const store = useAgentStore()
    const configs: ConnectorConfig[] = []
    for (const id of ids) {
      const conn = store.connectors.find(c => c.id === id)
      if (conn && conn.enabled) {
        configs.push(conn)
      }
    }
    return configs
  }

  /** 合并用户选中的技能 + 套件包含的技能，返回去重后的完整技能 ID 列表 */
  private resolveAllSkillNames(): string[] {
    const { skillNames, suiteNames } = this.config
    if (suiteNames.length === 0) return [...skillNames]

    const store = useAgentStore()
    const suiteSkillIds: string[] = []
    for (const suiteName of suiteNames) {
      const suite = store.suites.find(s => s.name === suiteName && s.installed)
      if (suite) {
        suiteSkillIds.push(...suite.skillIds)
      }
    }

    // 去重合并
    const merged = new Set([...skillNames, ...suiteSkillIds])
    return Array.from(merged)
  }

  // ── 启动执行 ──

  /** 任务是否正在运行 */
  get isRunning(): boolean {
    return this.running
  }

  /** 任务是否已被取消 */
  get isAborted(): boolean {
    return this.aborted
  }

  /**
   * 启动任务执行。
   * 返回 ReActResult，同时通过事件回调推送实时状态。
   */
  async start(): Promise<ReActResult> {
    if (this.running) {
      throw new Error('任务已在运行中')
    }

    this.running = true
    this.aborted = false

    const logger = getLogger()
    const taskId = this.config.taskId ?? `task_${Date.now()}`

    try {
      // 解析 LLM 配置
      const llm = this.resolveLLMConfig()

      // 记录任务开始日志
      logger.taskStart(taskId, this.config.userMessage, {
        model: llm.model,
        workDir: this.config.workDir,
        skills: this.config.skillNames,
        suites: this.config.suiteNames,
        executionMode: this.config.executionMode ?? 'auto',
      })

      // 创建上下文压缩器（用于长对话时自动压缩上下文，保持对话稳定性）
      const contextCompressor = this.createContextCompressor(llm)

      // 构建系统提示（含记忆上下文和连接器信息）
      let systemPrompt = await this.buildSystemPrompt()

      // ── Plan-Execute 模式处理 ──
      let planContext: PlanContext | undefined
      const executionMode = this.config.executionMode ?? 'auto'

      if (executionMode !== 'react') {
        // 判断是否需要规划
        let needsPlan = executionMode === 'plan_execute'

        // 规划阶段的流式回调：thinking 走 planThinking 事件，token（JSON 输出）走 planToken 事件
        // 与 ReAct 执行阶段的 thinking 事件区分开
        const planCallbacks: PlanStreamCallbacks = {
          onThinking: (thinking: string) => {
            if (!this.aborted) this.emit('planThinking', thinking)
          },
          onToken: (token: string) => {
            if (!this.aborted) this.emit('planToken', token)
          },
        }

        if (executionMode === 'auto') {
          // 合并评估 + 计划生成为一次 LLM 调用（省掉一次往返）
          if (!this.aborted) this.emit('planStart')
          try {
            const result = await assessAndPlan(this.config.userMessage, llm, planCallbacks)
            needsPlan = result.needsPlan
            console.log(`[TaskRunner] 复杂度评估: needsPlan=${needsPlan}, reason=${result.reason}`)

            if (needsPlan && result.planItems.length > 0) {
              // 直接使用合并调用返回的计划项，无需再次调用 generatePlan
              planContext = {
                planItems: result.planItems,
                onUpdate: (updatedItem) => {
                  if (!this.aborted) this.emit('planItemUpdate', updatedItem)
                },
                onRemove: (removedItemId) => {
                  if (!this.aborted) this.emit('planItemRemove', removedItemId)
                },
              }

              if (!this.aborted) {
                console.log('[TaskRunner] 触发 planCreated 事件，步骤数:', result.planItems.length)
                this.emit('planCreated', result.planItems)
              }

              const planPrompt = buildPlanAwarePrompt(result.planItems)
              systemPrompt += planPrompt
              console.log(`[TaskRunner] 已生成执行计划，共 ${result.planItems.length} 个步骤`)
            } else if (!needsPlan && !this.aborted) {
              // 简单任务无需规划，直接结算 plan_output block
              this.emit('planCreated', [])
            }
          } catch (err) {
            console.warn('[TaskRunner] 评估+计划生成失败，回退到纯 ReAct:', err)
          }
        }

        // 生成执行计划（仅 plan_execute 模式 — auto 模式已在上方合并调用中完成）
        if (needsPlan && executionMode === 'plan_execute') {
          console.log('[TaskRunner] 开始生成执行计划...')

          // plan_execute 模式下也需要创建 plan_output block
          if (executionMode === 'plan_execute' && !this.aborted) {
            this.emit('planStart')
          }

          try {
            const planItems = await generatePlan(this.config.userMessage, llm, systemPrompt, planCallbacks)
            console.log('[TaskRunner] generatePlan 返回结果:', planItems.length, '个步骤')
            
            if (planItems.length > 0) {
              // 创建计划上下文
              planContext = {
                planItems,
                onUpdate: (updatedItem) => {
                  if (!this.aborted) this.emit('planItemUpdate', updatedItem)
                },
                onRemove: (removedItemId) => {
                  if (!this.aborted) this.emit('planItemRemove', removedItemId)
                },
              }

              // 触发计划创建事件
              if (!this.aborted) {
                console.log('[TaskRunner] 触发 planCreated 事件，步骤数:', planItems.length)
                this.emit('planCreated', planItems)
              }

              // 将计划注入系统提示
              const planPrompt = buildPlanAwarePrompt(planItems)
              systemPrompt += planPrompt

              console.log(`[TaskRunner] 已生成执行计划，共 ${planItems.length} 个步骤`)
            } else {
              console.warn('[TaskRunner] 计划生成返回空数组，回退到纯 ReAct 模式')
            }
          } catch (err) {
            console.error('[TaskRunner] 计划生成失败，回退到纯 ReAct:', err)
            console.error('[TaskRunner] 错误详情:', err instanceof Error ? err.message : String(err))
          }
        }
      }

      // 构建工具集（含子代理上下文、连接器配置和计划上下文）
      const { tools, subAgentContext, connectorConfigs } = await this.buildTools(planContext)

      // 构建主代理运行时历史：在 onStep 中持续追加，使子代理能看到主代理的当前状态
      const runningHistory: ChatMessage[] = [...(this.config.history || [])]
      // 同步到 subAgentContext，使后续工具调用能读取最新历史
      subAgentContext.conversationHistory = runningHistory

      // 构建上下文优化器配置（用于压缩大型工具返回结果，缓存保存在用户工作目录下）
      const contextOptimizerConfig: ContextOptimizerConfig = {
        enabled: true,
        workDir: this.config.workDir,
        llm: {
          baseUrl: llm.baseUrl,
          apiKey: llm.apiKey,
          format: llm.format,
          model: llm.model,
        },
      }

      // 构建工具执行器（包装 ask_user 拦截 + 子代理事件 + 连接器配置 + 计划工具 + 上下文优化）
      const baseExecutor = createToolExecutor(this.config.workDir, subAgentContext, connectorConfigs, planContext, contextOptimizerConfig)
      const executeTool = this.wrapWithClarification(this.wrapWithSubAgentEvents(baseExecutor, subAgentContext))

      // 构建流式回调
      const streamCallbacks: ReActStreamCallbacks = {
        onToken: (token: string) => {
          if (!this.aborted) this.emit('token', token)
        },
        onThinking: (thinking: string) => {
          if (!this.aborted) this.emit('thinking', thinking)
        },
        onToolCallStart: (toolCall: ToolCall) => {
          if (!this.aborted) this.emit('toolCallStart', toolCall)
        },
        onToolCallEnd: (toolCall: ToolCall, result: ToolResult) => {
          if (!this.aborted) this.emit('toolCallEnd', toolCall, result)
        },
      }

      // 构建 agent 参数
      const agentParams: ReActAgentParams = {
        taskId,
        llm,
        systemPrompt,
        userMessage: this.config.userMessage,
        history: this.config.history,
        tools,
        executeTool,
        maxIterations: this.config.maxIterations,
        stream: this.config.stream ?? true,
        streamCallbacks,
        contextCompressor,
        planContext,
        onStep: (step: ReActStep) => {
          // 将主代理每步的思考结果追加到运行时历史，使后续子代理工具能看到上下文
          if (step.toolCalls.length > 0) {
            // 有工具调用的步骤：合并思考文本 + 工具调用为一条 assistant 消息
            const tcEntries = step.toolCalls.map((tc, i) => ({
              id: tc.id || `call_${i}`,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.arguments },
            }))
            runningHistory.push({
              role: 'assistant',
              content: step.text || '',
              tool_calls: tcEntries,
            })
            // 追加工具结果（截断过长的输出，避免上下文过长）
            for (let i = 0; i < step.toolCalls.length; i++) {
              const tc = step.toolCalls[i]
              const tr = step.toolResults[i]
              if (tr) {
                const summary = tr.output.length > 3000 ? tr.output.slice(0, 3000) + '…' : tr.output
                runningHistory.push({ role: 'tool', content: summary, tool_call_id: tc.id || `call_${i}` })
              }
            }
          } else if (step.text) {
            // 纯文本步骤（无工具调用）
            runningHistory.push({ role: 'assistant', content: step.text })
          }
          // 保持 subAgentContext 中的引用始终指向最新的运行时历史
          subAgentContext.conversationHistory = runningHistory
          if (!this.aborted) this.emit('step', step)
        },
        onError: (error: Error) => {
          if (!this.aborted) this.emit('error', error)
        },
        onRequest: (payload) => {
          if (!this.aborted) this.emit('prompt', payload)
        },
      }

      // 运行 ReAct Agent
      const result = await runReActAgent(agentParams)

      // 记录任务完成/终止日志
      if (result.finished) {
        logger.taskComplete(taskId, result.text, undefined)
      } else {
        logger.taskAborted(taskId, result.text || 'Agent 未正常完成')
      }

      if (!this.aborted) {
        this.emit('complete', result)
      }

      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      logger.taskError(taskId, 'unhandled_exception', error.message, error.stack)
      if (!this.aborted) {
        this.emit('error', error)
      }
      throw error
    } finally {
      // 确保日志刷盘
      await logger.flushAll()
      this.running = false
    }
  }

  /**
   * 取消正在运行的任务。
   * 中止后不会再触发任何事件回调。
   */
  abort(): void {
    if (!this.running || this.aborted) return

    this.aborted = true
    this.abortController?.abort()

    const logger = getLogger()
    const taskId = this.config.taskId ?? 'unknown'
    logger.taskAborted(taskId, '用户主动取消')

    // 如果有等待中的澄清请求，用取消结果解除挂起
    if (this.pendingClarificationResolve) {
      this.pendingClarificationResolve({
        success: false,
        output: '用户已取消任务',
      })
      this.pendingClarificationResolve = null
    }

    this.emit('abort')
  }

  // ── 问题澄清 ──────────────────────────────────────────

  /**
   * 提交用户对澄清问题的回答。
   * 解除 executeTool 中的 pending Promise，让 ReAct 循环继续。
   */
  submitClarification(answers: ClarificationAnswer[]): void {
    if (!this.pendingClarificationResolve) {
      console.warn('[TaskRunner] 没有等待中的澄清请求')
      return
    }

    const resolve = this.pendingClarificationResolve
    this.pendingClarificationResolve = null

    // 将答案格式化为文本反馈给 LLM
    const answerText = answers
      .map(a => `[问题 ${a.questionId}] ${a.values.join(', ')}`)
      .join('\n')

    resolve({
      success: true,
      output: `用户回答：\n${answerText}`,
    })
  }

  /** 是否正在等待用户回答澄清问题 */
  get isWaitingForClarification(): boolean {
    return this.pendingClarificationResolve !== null
  }

  /**
   * 包装工具执行器，拦截 ask_user 工具调用。
   * 当 LLM 请求 ask_user 时，创建一个 pending Promise 挂起执行，
   * 同时触发 clarification 事件，等待用户回答后解除。
   */
  private wrapWithClarification(
    baseExecutor: (name: string, args: Record<string, unknown>) => Promise<ToolResult>,
  ) {
    return async (name: string, args: Record<string, unknown>): Promise<ToolResult> => {
      if (name !== 'ask_user') {
        return baseExecutor(name, args)
      }

      // 解析 ask_user 参数
      const rawQuestions = (args.questions || []) as Array<{
        question: string
        options: Array<{ label: string; value: string }>
        multi_select?: boolean
      }>

      // 构建 ClarificationQuestion 列表（自动追加「自定义输入」选项）
      const questions: ClarificationQuestion[] = rawQuestions.map((q, idx) => ({
        id: `q${idx + 1}`,
        question: q.question,
        options: [
          ...q.options.map(o => ({ label: o.label, value: o.value })),
          { label: '自定义输入', value: '__custom__', isCustom: true },
        ],
        multiSelect: q.multi_select ?? false,
      }))

      // 创建 pending Promise
      return new Promise<ToolResult>((resolve) => {
        this.pendingClarificationResolve = resolve

        // 触发 clarification 事件，传递 submit 回调
        this.emit('clarification', {
          questions,
          submit: (answers: ClarificationAnswer[]) => {
            this.submitClarification(answers)
          },
        })
      })
    }
  }

  // ── 子代理事件包装 ──────────────────────────────────────────

  /** 子代理工具名称集合 */
  private static readonly SUBAGENT_TOOLS = new Set(['generate_html_page', 'generate_code_file', 'generate_document', 'assign_to_subagent'])

  /**
   * 包装工具执行器，为子代理工具添加 start/end/token 事件。
   * 在子代理工具执行前注入流式 token 回调，实现 UI 实时显示。
   */
  private wrapWithSubAgentEvents(
    baseExecutor: (name: string, args: Record<string, unknown>) => Promise<ToolResult>,
    subAgentContext: SubAgentContext,
  ) {
    return async (name: string, args: Record<string, unknown>, toolCallId?: string): Promise<ToolResult> => {
      if (!TaskRunner.SUBAGENT_TOOLS.has(name)) {
        return baseExecutor(name, args)
      }

      // 推断生成类型
      const genType = name === 'generate_html_page' ? 'html_render'
        : name === 'generate_document' ? 'document'
        : name === 'assign_to_subagent' ? 'sub_agent'
        : 'code_edit'
      const description = name === 'assign_to_subagent'
        ? ((args.task as string) || '子代理任务')
        : ((args.description as string) || (args.title as string) || name)

      // 设置当前 toolCallId 到子代理上下文
      subAgentContext.toolCallId = toolCallId

      // 注入流式 token 回调：将子代理产生的每个 token 转发为 subagentToken 事件
      subAgentContext.onToken = (token: string) => {
        if (!this.aborted) this.emit('subagentToken', token, toolCallId)
      }

      // 仅 assign_to_subagent 注入迭代回调，将子代理 ReAct 循环的每次迭代转发为 subagentIteration 事件
      if (genType === 'sub_agent') {
        subAgentContext.onIteration = (payload) => {
          if (!this.aborted) {
            this.emit('subagentIteration', { ...payload, toolCallId })
          }
        }
      }

      // 触发子代理开始事件
      if (!this.aborted) {
        // 立即向 UI 发送状态提示，让用户知道子代理正在启动（减少首 token 到达前的空白感）
        const typeLabel = genType === 'html_render' ? 'HTML 页面'
          : genType === 'document' ? '文档'
          : genType === 'sub_agent' ? '子代理任务'
          : '代码文件'
        this.emit('thinking', `[正在生成${typeLabel}...]\n`)
        this.emit('token', '')
        this.emit('subagentStart', {
          toolName: name, description, type: genType, toolCallId,
          ...(genType === 'sub_agent' ? { maxIterations: 15 } : {}),
        })
      }

      // 执行子代理工具
      let result: ToolResult
      try {
        result = await baseExecutor(name, args)
      } finally {
        // 清除回调，避免污染下一次工具调用
        subAgentContext.onToken = undefined
        subAgentContext.onIteration = undefined
        subAgentContext.toolCallId = undefined
      }

      // 解析结果
      if (!this.aborted) {
        if (result.success && result.output.startsWith(SUBAGENT_RESULT_MARKER)) {
          try {
            const afterMarker = result.output.slice(SUBAGENT_RESULT_MARKER.length)
            // JSON 部分在第一个 \n\n 之前（之后是给 LLM 的可读消息）
            const jsonEnd = afterMarker.indexOf('\n\n')
            const jsonStr = jsonEnd >= 0 ? afterMarker.slice(0, jsonEnd) : afterMarker
            const resultData = JSON.parse(jsonStr)
            this.emit('subagentEnd', {
              toolName: name,
              success: true,
              type: genType,
              toolCallId,
              result: resultData,
            })
          } catch {
            this.emit('subagentEnd', { toolName: name, success: false, type: genType, toolCallId, error: '结果解析失败' })
          }
        } else if (genType === 'sub_agent') {
          // assign_to_subagent 返回纯文本结果（无 SUBAGENT_RESULT_MARKER）
          this.emit('subagentEnd', {
            toolName: name,
            success: result.success,
            type: genType,
            toolCallId,
            result: result.success ? { text: result.output } : undefined,
            error: result.success ? undefined : result.output,
          })
        } else {
          this.emit('subagentEnd', {
            toolName: name,
            success: result.success,
            type: genType,
            toolCallId,
            error: result.success ? undefined : result.output,
          })
        }
      }

      return result
    }
  }
}
