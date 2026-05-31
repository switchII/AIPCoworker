import { ref } from 'vue'
import type { ConnectorConfig } from '../../types/integration'

/**
 * ConnectorManager — 连接器配置管理（持久化到 ~/.aipcowork/connectors/connectors.json）
 *
 * 存储路径：~/.aipcowork/connectors/connectors.json
 * 按类型分类存储 SSH / MySQL / PostgreSQL 连接器配置
 */
export function useConnectorManager() {
  const connectors = ref<ConnectorConfig[]>([])

  async function loadConnectors(): Promise<ConnectorConfig[]> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const json = await invoke<string>('load_connectors')
      const parsed = JSON.parse(json)
      connectors.value = Array.isArray(parsed) ? parsed : []
      console.log('[ConnectorManager] 已加载连接器配置:', connectors.value.length, '个')
    } catch (e) {
      console.warn('[ConnectorManager] 加载连接器配置失败:', e)
      connectors.value = []
    }
    return connectors.value
  }

  async function saveConnectors() {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const json = JSON.stringify(connectors.value, null, 2)
      await invoke('save_connectors', { configJson: json })
      console.log('[ConnectorManager] 已保存连接器配置')
    } catch (e) {
      console.warn('[ConnectorManager] 保存连接器配置失败:', e)
    }
  }

  function addConnector(conn: ConnectorConfig) {
    connectors.value.push(conn)
    saveConnectors()
  }

  function updateConnector(id: string, updates: Partial<ConnectorConfig>) {
    const idx = connectors.value.findIndex(c => c.id === id)
    if (idx !== -1) {
      connectors.value[idx] = { ...connectors.value[idx], ...updates }
      saveConnectors()
    }
  }

  function removeConnector(id: string) {
    connectors.value = connectors.value.filter(c => c.id !== id)
    saveConnectors()
  }

  function toggleConnector(id: string) {
    const idx = connectors.value.findIndex(c => c.id === id)
    if (idx !== -1) {
      connectors.value[idx].enabled = !connectors.value[idx].enabled
      saveConnectors()
    }
  }

  function getConnector(id: string): ConnectorConfig | undefined {
    return connectors.value.find(c => c.id === id)
  }

  return {
    connectors,
    loadConnectors, saveConnectors,
    addConnector, updateConnector, removeConnector,
    toggleConnector, getConnector,
  }
}
