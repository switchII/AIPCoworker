import { defineStore } from 'pinia'
import { useLLMConfig } from './modules/useLLMConfig'
import { useAgentManager } from './modules/useAgentManager'
import { useMCPManager } from './modules/useMCPManager'
import { useScheduler } from './modules/useScheduler'
import { useProviderManager } from './modules/useProviderManager'
import { useTaskManager } from './modules/useTaskManager'
import { useSessionManager } from './modules/useSessionManager'
import { useConversationManager } from './modules/useConversationManager'
import { useMemoryFiles } from './modules/useMemoryFiles'
import { useConfigs } from './modules/useConfigs'
import { useConnectorManager } from './modules/useConnectorManager'
import { useSuiteManager } from './modules/useSuiteManager'
import { useExperimentalSettings } from './modules/useExperimentalSettings'

export const useAgentStore = defineStore('agent', () => {
  // ===== 持久化 =====
  function persistState() {
    const state = {
      llmConfig: llm.llmConfig.value,
      agents: agent.agents.value,
      skills: configs.skills.value,
      permissionConfig: configs.permissionConfig.value,
      safetyConfig: configs.safetyConfig.value,
      mcpServers: mcp.mcpServers.value,
      scheduledTasks: scheduler.scheduledTasks.value,
      triggers: configs.triggers.value,
      imChannels: configs.imChannels.value,
      providers: provider.providers.value,
      activeModel: provider.activeModel.value,
      searchConfig: configs.searchConfig.value,
      noticeConfig: configs.noticeConfig.value,
      contextConfig: configs.contextConfig.value,
      updateConfig: configs.updateConfig.value,
      soulConfig: configs.soulConfig.value,
      sandboxConfig: configs.sandboxConfig.value,
      logConfig: configs.logConfig.value,
    }
    localStorage.setItem('agent_store', JSON.stringify(state))
  }

  function loadState() {
    const saved = localStorage.getItem('agent_store')
    if (saved) {
      try {
        const state = JSON.parse(saved)
        if (state.llmConfig) Object.assign(llm.llmConfig.value, state.llmConfig)
        if (state.agents) agent.agents.value = state.agents
        if (state.skills) configs.skills.value = state.skills
        if (state.permissionConfig) Object.assign(configs.permissionConfig.value, state.permissionConfig)
        if (state.safetyConfig) Object.assign(configs.safetyConfig.value, state.safetyConfig)
        if (state.mcpServers) mcp.mcpServers.value = state.mcpServers
        if (state.scheduledTasks) scheduler.scheduledTasks.value = state.scheduledTasks
        if (state.triggers) configs.triggers.value = state.triggers
        if (state.imChannels) configs.imChannels.value = state.imChannels
        if (state.providers) provider.providers.value = state.providers
        if (state.activeModel) provider.activeModel.value = state.activeModel
        if (state.searchConfig) Object.assign(configs.searchConfig.value, state.searchConfig)
        if (state.noticeConfig) Object.assign(configs.noticeConfig.value, state.noticeConfig)
        if (state.contextConfig) Object.assign(configs.contextConfig.value, state.contextConfig)
        if (state.updateConfig) Object.assign(configs.updateConfig.value, state.updateConfig)
        if (state.soulConfig) Object.assign(configs.soulConfig.value, state.soulConfig)
        if (state.sandboxConfig) Object.assign(configs.sandboxConfig.value, state.sandboxConfig)
        if (state.logConfig) Object.assign(configs.logConfig.value, state.logConfig)
      } catch (e) {
        console.error('Failed to load agent store:', e)
      }
    }
  }

  // ===== 初始化子模块 =====
  const llm = useLLMConfig()
  const agent = useAgentManager()
  const mcp = useMCPManager()
  const scheduler = useScheduler(persistState)
  const provider = useProviderManager(persistState)
  const task = useTaskManager()
  const session = useSessionManager()
  const conversation = useConversationManager()
  const memoryFiles = useMemoryFiles()
  const configs = useConfigs()
  const connector = useConnectorManager()
  const suite = useSuiteManager()
  const experimental = useExperimentalSettings()

  // ===== 包装需要持久化的 actions =====
  function saveLLMConfig(config: Partial<typeof llm.llmConfig.value>) {
    Object.assign(llm.llmConfig.value, config)
    persistState()
  }

  function addAgent(agentDef: Parameters<typeof agent.addAgent>[0]) {
    agent.addAgent(agentDef)
    persistState()
  }

  function updateAgent(id: string, updates: Parameters<typeof agent.updateAgent>[1]) {
    agent.updateAgent(id, updates)
    persistState()
  }

  function deleteAgent(id: string) {
    agent.deleteAgent(id)
    persistState()
  }

  // 初始化加载
  loadState()
  mcp.loadMCPServers()
  connector.loadConnectors()
  suite.loadSuites()
  task.loadTasks(20)
  experimental.loadSettings()

  return {
    // LLM Config
    ...llm, saveLLMConfig,
    // Agent Manager
    ...agent, addAgent, updateAgent, deleteAgent,
    // MCP Manager
    ...mcp,
    // Connector Manager
    ...connector,
    // Suite Manager
    ...suite,
    // Experimental Settings
    ...experimental,
    // Scheduler
    ...scheduler,
    // Provider Manager
    ...provider,
    // Task Manager
    ...task,
    // Session Manager
    ...session,
    // Conversation Manager (for AgentChat.vue)
    ...conversation,
    // Memory Files
    ...memoryFiles,
    // Configs
    ...configs,
    // Persistence
    persistState, loadState
  }
})
