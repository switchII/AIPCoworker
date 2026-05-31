/**
 * 子代理模块 — 公共 API。
 *
 * 导出子代理工具定义、执行器、上下文类型和子 ReAct Agent。
 */

export {
  buildSubAgentToolDefinitions,
  executeSubAgentTool,
  SUBAGENT_RESULT_MARKER,
  type SubAgentContext,
} from './subagentTools'

export {
  runSubAgent,
  type SubAgentParams,
  type SubAgentResult,
} from './subAgentRunner'
