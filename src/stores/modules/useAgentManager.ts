import { ref, computed } from 'vue'
import type { AgentDefinition } from '../../types/agent'

export function useAgentManager() {
  const agents = ref<AgentDefinition[]>([
    {
      id: 'default', name: '通用助手', description: '默认AI助手，擅长通用任务处理',
      avatar: '🤖', maxTurns: 30, systemPrompt: '你是一个乐于助人的AI助手。',
      tools: ['*'], disallowedTools: [], skills: [], category: '通用',
      enabled: true, isBuiltIn: true
    },
    {
      id: 'senior-engineer', name: '高级工程师', description: '精通全栈开发，代码审查和架构设计',
      avatar: '👨‍💻', maxTurns: 50, systemPrompt: '你是一位资深全栈工程师...',
      tools: ['*'], disallowedTools: [], skills: ['code-review', 'refactor'], category: '开发',
      enabled: true, isBuiltIn: true
    },
    {
      id: 'data-analyst', name: '数据分析师', description: '擅长数据处理、统计分析和可视化',
      avatar: '📊', maxTurns: 30, systemPrompt: '你是一位专业的数据分析师...',
      tools: ['run_command', 'read_file', 'write_file', 'web_search'], disallowedTools: [], skills: ['data-viz'], category: '数据',
      enabled: true, isBuiltIn: true
    },
    {
      id: 'product-manager', name: '产品经理', description: '擅长需求分析、产品设计和项目管理',
      avatar: '📋', maxTurns: 20, systemPrompt: '你是一位经验丰富的产品经理...',
      tools: ['web_search', 'read_file', 'write_file'], disallowedTools: ['run_command'], skills: [], category: '产品',
      enabled: true, isBuiltIn: true
    },
  ])

  const currentAgentId = ref('default')
  const currentAgent = computed(() => agents.value.find(a => a.id === currentAgentId.value) || agents.value[0])

  function addAgent(agent: AgentDefinition) {
    agents.value.push(agent)
  }

  function updateAgent(id: string, updates: Partial<AgentDefinition>) {
    const idx = agents.value.findIndex(a => a.id === id)
    if (idx >= 0) Object.assign(agents.value[idx], updates)
  }

  function deleteAgent(id: string) {
    agents.value = agents.value.filter(a => a.id !== id)
  }

  return { agents, currentAgentId, currentAgent, addAgent, updateAgent, deleteAgent }
}
