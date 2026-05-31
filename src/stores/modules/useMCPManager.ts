import { ref } from 'vue'
import type { MCPServerConfig } from '../../types/agent'

export function useMCPManager() {
  const mcpServers = ref<MCPServerConfig[]>([])

  async function loadMCPServers() {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const json = await invoke<string>('load_mcp_servers')
      const servers = JSON.parse(json)
      mcpServers.value = servers
      console.log('[MCP] 已加载服务器配置:', servers.length, '个')
    } catch (e) {
      console.warn('[MCP] 加载服务器配置失败:', e)
    }
  }

  async function saveMCPServers() {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const json = JSON.stringify(mcpServers.value, null, 2)
      await invoke('save_mcp_servers', { configJson: json })
      console.log('[MCP] 已保存服务器配置')
    } catch (e) {
      console.warn('[MCP] 保存服务器配置失败:', e)
    }
  }

  function addMCPServer(server: MCPServerConfig) {
    mcpServers.value.push(server)
    saveMCPServers()
  }

  function updateMCPServer(id: string, updates: Partial<MCPServerConfig>) {
    const index = mcpServers.value.findIndex(s => s.id === id)
    if (index !== -1) {
      mcpServers.value[index] = { ...mcpServers.value[index], ...updates }
      saveMCPServers()
    }
  }

  function removeMCPServer(id: string) {
    mcpServers.value = mcpServers.value.filter(s => s.id !== id)
    saveMCPServers()
  }

  function toggleMCPServer(id: string) {
    const index = mcpServers.value.findIndex(s => s.id === id)
    if (index !== -1) {
      mcpServers.value[index].enabled = !mcpServers.value[index].enabled
      saveMCPServers()
    }
  }

  return {
    mcpServers, loadMCPServers, saveMCPServers,
    addMCPServer, updateMCPServer, removeMCPServer, toggleMCPServer
  }
}
