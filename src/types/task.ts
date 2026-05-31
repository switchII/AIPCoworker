// ─── 问题澄清 ──────────────────────────────────────────────

/** 澄清问题中的单个选项 */
export interface ClarificationOption {
  /** 选项显示文本 */
  label: string
  /** 选项值 */
  value: string
  /** 是否为「自定义输入」选项 */
  isCustom?: boolean
}

/** 单个澄清问题 */
export interface ClarificationQuestion {
  /** 问题 ID（用于匹配答案） */
  id: string
  /** 问题文本 */
  question: string
  /** 可选选项列表（最后一项通常是自定义输入） */
  options: ClarificationOption[]
  /** 是否允许多选 */
  multiSelect?: boolean
}

/** 用户对单个问题的回答 */
export interface ClarificationAnswer {
  /** 对应的问题 ID */
  questionId: string
  /** 选中的值（可以是预设选项的 value 或自定义输入的文本） */
  values: string[]
}

/** 附加到 ExecutionBlock 上的澄清数据 */
export interface ClarificationData {
  questions: ClarificationQuestion[]
  answered: boolean
  answers?: ClarificationAnswer[]
}

// ─── 计划执行 ──────────────────────────────────────────────

export type PlanItemStatus = 'pending' | 'in_progress' | 'completed' | 'failed'
export type ExecutionMode = 'react' | 'plan_execute'

export interface PlanItem {
  id: string
  title: string
  description?: string
  status: PlanItemStatus
  order: number
}

// ─── 子代理迭代步骤 ───────────────────────────────────────────

/** 子代理 ReAct 循环中的一次迭代步骤 */
export interface SubAgentStep {
  /** 迭代编号（从 1 开始） */
  iteration: number
  /** 本次迭代的 LLM 思考内容 */
  thinking: string
  /** 本次迭代调用的工具名称列表 */
  toolNames: string[]
  /** 本次迭代的工具执行结果摘要 */
  toolResults?: { name: string; success: boolean; summary: string; args?: Record<string, unknown> }[]
  /** 本迭代是否已完成（false = 正在执行工具） */
  completed: boolean
}

// ─── 任务执行 ──────────────────────────────────────────────

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed'
export type BlockStatus = 'pending' | 'running' | 'success' | 'failed'

export interface ExecutionStep {
  id: string
  type: 'command' | 'file_read' | 'file_write' | 'code_edit' | 'web_search' | 'mcp_execute' | 'file_gen' | 'method_exec'
  label: string
  target?: string
  detail?: string
  status: BlockStatus
  resultExpanded: boolean
  result: string
  resultLanguage?: string
  searchResults?: WebSearchResult[]
  code?: string
  language?: string
  fileName?: string
  finalStatus?: 'success' | 'failed'
}

export interface WebSearchResult {
  title: string
  url: string
  icon: string
  summary: string
  contentExpanded: boolean
  status: BlockStatus
  content: string
}

export interface ExecutionBlock {
  id: string
  type: 'thinking' | 'complex_thinking' | 'sub_agent' | 'code_edit' | 'document' | 'web_search' | 'file_query' | 'mcp_execute' | 'file_gen' | 'html_render' | 'clarification' | 'plan_output' | 'error'
  expanded: boolean
  status: BlockStatus
  duration?: number
  text?: string
  list?: { name: string; desc: string; children?: string[] }[]
  extraText?: string
  steps: ExecutionStep[]
  code?: string
  language?: string
  fileName?: string
  query?: string
  results?: WebSearchResult[]
  method?: string
  params?: string
  result?: string
  resultExpanded?: boolean
  genFiles?: { name: string; type: string; content: string; filePath?: string }[]
  htmlContent?: string
  /** 澄清问题数据（仅 type='clarification' 时使用） */
  clarification?: ClarificationData
  /** 子代理生成状态（HTML/代码生成块） */
  subagentStatus?: 'generating' | 'complete'
  /** 生成耗时（秒） */
  generationDuration?: number
  /** 规划阶段的思考内容（仅 type='plan_output' 时使用） */
  planThinking?: string
  /** 错误详情（仅 type='error' 时使用） */
  errorMessage?: string
  /** 子代理 ReAct 循环的迭代步骤（仅 type='sub_agent' 时使用） */
  subAgentSteps?: SubAgentStep[]
  /** 子代理当前迭代编号（运行中实时更新） */
  currentIteration?: number
  /** 子代理最大迭代次数 */
  maxIterations?: number
}

export interface TaskRecord {
  id: string
  title: string
  status: TaskStatus
  elapsedSeconds: number
  startTime: number
  input: string
  dir?: string
  skills: string[]
  suites: string[]
  mcpServerIds?: string[]
  connectorIds?: string[]
  projectId?: string
  blocks: ExecutionBlock[]
  genFiles: { name: string; type: string; content: string; filePath?: string }[]
  report?: string
  planItems?: PlanItem[]
  executionMode?: ExecutionMode
}
