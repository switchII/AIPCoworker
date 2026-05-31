/**
 * 内置工具定义索引
 *
 * 分类：
 * - fileOperations: 文件操作（read_file, write_file, delete_path, copy_path, move_path）
 * - directoryTools: 目录浏览（list_directory）
 * - searchTools: 搜索工具（glob_search, ripgrep_search）
 * - shellTools: Shell 命令（run_command）— 需要动态注入 workDir
 * - webTools: 网络操作（http_fetch）
 * - connectorTools: 连接器工具（SSH / MySQL / PostgreSQL）— 按连接器动态生成
 */
import type { ToolDefinition } from '../../agent/llm/llmClient'
import { fileOperationTools } from './fileOperations'
import { directoryTools } from './directoryTools'
import { searchTools } from './searchTools'
import { buildRunCommandTool } from './shellTools'
import { interactionTools } from './interactionTools'
import { webTools } from './webTools'

export { fileOperationTools, readFileTool, writeFileTool, deletePathTool, copyPathTool, movePathTool } from './fileOperations'
export { directoryTools, listDirectoryTool } from './directoryTools'
export { searchTools, globSearchTool, ripgrepSearchTool } from './searchTools'
export { buildRunCommandTool } from './shellTools'
export { interactionTools, askUserTool } from './interactionTools'
export { webTools, httpFetchTool } from './webTools'
export { buildConnectorToolDefinitions, isConnectorToolName, parseConnectorToolName, formatConnectorToolName, formatMCPToolName, formatToolName, buildToolDisplayLabel } from './connectorTools'

/**
 * 根据工作目录构建所有内置工具定义列表
 */
export function buildAllInternalToolDefinitions(workDir: string): ToolDefinition[] {
  return [
    ...fileOperationTools,
    ...directoryTools,
    ...searchTools,
    buildRunCommandTool(workDir),
    ...interactionTools,
    ...webTools,
  ]
}
