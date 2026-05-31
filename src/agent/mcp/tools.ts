/**
 * MCP 工具集成
 * 
 * 将 MCP 服务器提供的工具集成到 Agent 工具系统中：
 * - 工具发现和转换
 * - 工具执行
 * - 与内置工具和外部工具的整合
 */

import type { ToolDefinition } from '../llm/llmClient'
import type { ToolResult } from '../core/reactAgent'
import type { MCPServerConfig } from '../../types/integration'
import { mcpManager } from './client'
import { convertMCPToolToToolDefinition } from './types'
import { useAgentStore } from '../../stores/agentStore'

// ─── 工具发现 ──────────────────────────────────────────────

/**
 * 从所有已启用的 MCP 服务器构建工具定义列表
 * 
 * @param serverIds MCP 服务器 ID 列表，如果不传则使用所有已启用的服务器
 * @returns 工具定义列表
 */
export async function buildMCPToolDefinitions(serverIds?: string[]): Promise<ToolDefinition[]> {
  const store = useAgentStore()
  const enabledServers = store.mcpServers.filter(s => s.enabled)
  
  console.log('[MCP] buildMCPToolDefinitions 调用')
  console.log('[MCP] 传入的 serverIds:', serverIds)
  console.log('[MCP] 已启用的服务器:', enabledServers.map(s => ({ id: s.id, name: s.name })))
  
  const targetServers = serverIds
    ? enabledServers.filter(s => serverIds.includes(s.id))
    : enabledServers
  
  console.log('[MCP] 目标服务器:', targetServers.map(s => ({ id: s.id, name: s.name })))
  
  const allTools: ToolDefinition[] = []
  
  for (const server of targetServers) {
    try {
      console.log(`\n[MCP] ========== 开始处理服务器: ${server.name} (${server.id}) ==========`)
      console.log(`[MCP] 服务器配置:`, {
        name: server.name,
        transport: server.transport,
        url: server.url,
        authType: server.authType,
        enabled: server.enabled
      })
      
      // 连接到服务器
      console.log(`[MCP] 正在连接服务器...`)
      const connection = await mcpManager.connect(server)
      
      console.log(`[MCP] ✓ 连接成功，正在获取工具列表...`)
      // 获取工具列表
      const tools = await connection.listTools()
      
      console.log(`[MCP] ✓ 从服务器 ${server.name} 获取到 ${tools.length} 个工具:`)
      if (tools.length > 0) {
        console.log(`[MCP] 工具列表:`, tools.map(t => t.name))
      }
      
      // 转换为 ToolDefinition 格式（使用服务器名称而非 ID）
      const toolDefinitions = tools.map(tool => {
        const def = convertMCPToolToToolDefinition(tool, server.name)
        console.log(`[MCP] 转换工具: ${tool.name} -> ${def.function.name}`)
        return def
      })
      
      allTools.push(...toolDefinitions)
      
      console.log(`[MCP] ========== 服务器 ${server.name} 处理完成，发现 ${tools.length} 个工具 ==========\n`)
    } catch (err) {
      console.warn(`\n[MCP] ✗ 服务器 ${server.name} (${server.id}) 处理失败:`)
      console.warn(`[MCP] 错误详情:`, err)
      console.warn(`[MCP] 错误堆栈:`, err instanceof Error ? err.stack : 'N/A')
      console.warn(`[MCP] 继续处理其他服务器...\n`)
    }
  }
  
  console.log(`[MCP] buildMCPToolDefinitions 完成，总共返回 ${allTools.length} 个工具`)
  return allTools
}

/**
 * 获取所有已启用的 MCP 服务器 ID 列表
 */
export function getEnabledMCPServerIds(): string[] {
  const store = useAgentStore()
  return store.mcpServers
    .filter(s => s.enabled)
    .map(s => s.id)
}

/**
 * 获取可用的 MCP 服务器列表
 */
export function getAvailableMCPServers(): MCPServerConfig[] {
  const store = useAgentStore()
  return store.mcpServers.filter(s => s.enabled)
}

// ─── 工具执行 ──────────────────────────────────────────────

/**
 * 执行 MCP 工具
 * 
 * @param name 工具名称（格式：mcp_{sanitized_server_name}_{toolName}）
 * @param args 工具参数
 * @param workDir 工作目录
 * @returns 工具执行结果，如果不是 MCP 工具则返回 null
 */
export async function executeMCPTool(
  name: string,
  args: Record<string, unknown>,
  _workDir: string,
): Promise<ToolResult | null> {
  // 解析工具名称：mcp_{safe_server_name}_{toolName}
  if (!name.startsWith('mcp_')) {
    return null
  }
  
  const parts = name.split('_')
  if (parts.length < 3) {
    return {
      success: false,
      output: `无效的 MCP 工具名称: ${name}`,
    }
  }
  
  // 提取 safe_server_name 和 toolName
  // 格式：mcp_{safe_server_name}_{toolName}
  // 服务器名称可能包含多个下划线，所以按名称从长到短匹配
  const nameWithoutPrefix = name.substring(4) // 去掉 "mcp_"
  
  const store = useAgentStore()
  let serverId = ''
  let toolName = ''
  
  // 尝试匹配服务器（按名称从长到短匹配，避免部分匹配）
  const sortedServers = [...store.mcpServers].sort((a, b) => b.name.length - a.name.length)
  for (const server of sortedServers) {
    const safeName = server.name.replace(/[^a-zA-Z0-9_]/g, '_')
    if (nameWithoutPrefix.startsWith(safeName + '_')) {
      serverId = server.id
      toolName = nameWithoutPrefix.substring(safeName.length + 1)
      break
    }
  }
  
  if (!serverId || !toolName) {
    return {
      success: false,
      output: `未找到 MCP 服务器: ${name}`,
    }
  }
  
  try {
    // 获取或创建连接
    const connection = mcpManager.getConnection(serverId)
    if (!connection) {
      // 尝试连接
      const server = store.mcpServers.find(s => s.id === serverId)
      if (!server) {
        return {
          success: false,
          output: `MCP 服务器不存在: ${serverId}`,
        }
      }
      
      await mcpManager.connect(server)
      const newConnection = mcpManager.getConnection(serverId)
      if (!newConnection) {
        return {
          success: false,
          output: `无法连接到 MCP 服务器: ${serverId}`,
        }
      }
    }
    
    // 执行工具调用
    const finalConnection = mcpManager.getConnection(serverId)!
    const response = await finalConnection.callTool(toolName, args)
    
    // 转换响应格式
    if (response.isError) {
      return {
        success: false,
        output: response.content
          .map(c => {
            if (c.type === 'text') return c.text
            if (c.type === 'image') return `[Image: ${c.mimeType}]`
            if (c.type === 'resource') return `[Resource: ${c.resource.uri}]`
            return String(c)
          })
          .join('\n'),
      }
    }
    
    const output = response.content
      .map(c => {
        if (c.type === 'text') return c.text
        if (c.type === 'image') return `[Image: ${c.mimeType}]`
        if (c.type === 'resource') {
          if (c.resource.text) return c.resource.text
          if (c.resource.blob) return `[Binary resource: ${c.resource.uri}]`
          return `[Resource: ${c.resource.uri}]`
        }
        return String(c)
      })
      .join('\n')
    
    return {
      success: true,
      output,
    }
  } catch (err) {
    return {
      success: false,
      output: `MCP 工具执行失败: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ─── 连接管理辅助函数 ──────────────────────────────────────

/**
 * 初始化所有已启用的 MCP 服务器连接
 * 在 Agent 启动时调用
 */
export async function initializeMCPServers(): Promise<void> {
  const store = useAgentStore()
  const enabledServers = store.mcpServers.filter(s => s.enabled)
  
  console.log(`[MCP] 正在初始化 ${enabledServers.length} 个 MCP 服务器...`)
  
  const results = await Promise.allSettled(
    enabledServers.map(async (server) => {
      try {
        await mcpManager.connect(server)
        const tools = await mcpManager.getConnection(server.id)?.listTools()
        console.log(`[MCP] ✓ ${server.name}: ${tools?.length || 0} 个工具`)
      } catch (err) {
        console.warn(`[MCP] ✗ ${server.name}:`, err)
      }
    })
  )
  
  const successCount = results.filter(r => r.status === 'fulfilled').length
  console.log(`[MCP] 初始化完成: ${successCount}/${enabledServers.length} 个服务器连接成功`)
}

/**
 * 断开所有 MCP 服务器连接
 * 在 Agent 关闭时调用
 */
export async function shutdownMCPServers(): Promise<void> {
  console.log('[MCP] 正在断开所有服务器连接...')
  await mcpManager.disconnectAll()
  console.log('[MCP] 所有连接已断开')
}
