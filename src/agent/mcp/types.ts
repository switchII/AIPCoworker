/**
 * MCP (Model Context Protocol) 类型定义
 * 
 * 定义 MCP 协议相关的类型，包括：
 * - JSON-RPC 2.0 消息类型
 * - MCP 工具和资源类型
 * - 连接状态类型
 */

import type { MCPServerConfig } from '../../types/integration'
import type { ToolDefinition } from '../llm/llmClient'

// ─── JSON-RPC 2.0 消息类型 ─────────────────────────────────

export interface JSONRPCRequest {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
  id: number | string
}

export interface JSONRPCResponse {
  jsonrpc: '2.0'
  result?: unknown
  error?: JSONRPCError
  id: number | string
}

export interface JSONRPCError {
  code: number
  message: string
  data?: unknown
}

export interface JSONRPCNotification {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
}

// ─── MCP 初始化类型 ────────────────────────────────────────

export interface MCPInitializeRequest {
  protocolVersion: string
  capabilities: MCPClientCapabilities
  clientInfo: MCPClientInfo
}

export interface MCPClientCapabilities {
  experimental?: Record<string, unknown>
  sampling?: Record<string, unknown>
  roots?: {
    listChanged?: boolean
  }
}

export interface MCPClientInfo {
  name: string
  version: string
}

export interface MCPInitializeResponse {
  protocolVersion: string
  capabilities: MCPServerCapabilities
  serverInfo: MCPServerInfo
}

export interface MCPServerCapabilities {
  experimental?: Record<string, unknown>
  logging?: Record<string, unknown>
  prompts?: {
    listChanged?: boolean
  }
  resources?: {
    subscribe?: boolean
    listChanged?: boolean
  }
  tools?: {
    listChanged?: boolean
  }
}

export interface MCPServerInfo {
  name: string
  version: string
}

// ─── MCP 工具类型 ──────────────────────────────────────────

export interface MCPTool {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  }
}

export interface MCPToolCallRequest {
  name: string
  arguments?: Record<string, unknown>
}

export interface MCPToolCallResponse {
  content: MCPContent[]
  isError?: boolean
}

export type MCPContent = MCPTextContent | MCPImageContent | MCPResourceContent

export interface MCPTextContent {
  type: 'text'
  text: string
}

export interface MCPImageContent {
  type: 'image'
  data: string
  mimeType: string
}

export interface MCPResourceContent {
  type: 'resource'
  resource: {
    uri: string
    mimeType?: string
    text?: string
    blob?: string
  }
}

// ─── MCP 连接状态类型 ──────────────────────────────────────

export type MCPConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface MCPConnectionState {
  serverId: string
  status: MCPConnectionStatus
  error?: string
  tools: MCPTool[]
  lastConnected?: string
}

// ─── MCP 连接接口 ──────────────────────────────────────────

export interface MCPConnection {
  serverConfig: MCPServerConfig
  status: MCPConnectionStatus
  error?: string
  
  // 连接生命周期
  connect(): Promise<void>
  disconnect(): Promise<void>
  testConnection(): Promise<{ success: boolean; message: string }>
  
  // JSON-RPC 通信
  sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown>
  
  // 工具相关
  listTools(): Promise<MCPTool[]>
  callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResponse>
  
  // 状态
  getStatus(): MCPConnectionStatus
  getError(): string | undefined
}

// ─── MCP 工具定义转换 ──────────────────────────────────────

/**
 * 将 MCP 工具转换为 LLM 工具定义格式
 *
 * @param tool      MCP 服务器提供的工具定义
 * @param serverName 用户配置的服务器名称（用于生成可读的工具名）
 */
export function convertMCPToolToToolDefinition(tool: MCPTool, serverName: string): ToolDefinition {
  // 将服务器名称转为安全的工具名片段（只保留字母、数字、下划线）
  const safeName = serverName.replace(/[^a-zA-Z0-9_]/g, '_')
  // description 使用用户可读的格式：MCP | 服务名称 | 方法名
  const readableDesc = `MCP | ${serverName} | ${tool.name}`
  return {
    type: 'function',
    function: {
      name: `mcp_${safeName}_${tool.name}`,
      description: tool.description
        ? `${readableDesc} - ${tool.description}`
        : readableDesc,
      parameters: tool.inputSchema || {
        type: 'object',
        properties: {},
      },
    },
  }
}
