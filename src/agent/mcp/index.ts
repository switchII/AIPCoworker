/**
 * MCP (Model Context Protocol) 模块
 * 
 * 提供 MCP 服务器的连接管理、工具发现和工具执行功能。
 * 
 * 使用方式：
 *   import { 
 *     initializeMCPServers, 
 *     buildMCPToolDefinitions, 
 *     executeMCPTool,
 *     mcpManager 
 *   } from '@/agent/mcp'
 */

// 重导出类型
export type {
  MCPConnectionStatus,
  MCPConnectionState,
  MCPTool,
  MCPToolCallResponse,
  MCPContent,
  MCPTextContent,
  MCPImageContent,
  MCPResourceContent,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
} from './types'

// 重导出客户端
export { mcpManager, createMCPConnection } from './client'

// 重导出工具集成
export {
  buildMCPToolDefinitions,
  executeMCPTool,
  getEnabledMCPServerIds,
  getAvailableMCPServers,
  initializeMCPServers,
  shutdownMCPServers,
} from './tools'
