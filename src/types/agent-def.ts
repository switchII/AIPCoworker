// Agent 定义 & 技能
export interface AgentDefinition {
  id: string
  name: string
  description: string
  avatar: string
  model?: string
  maxTurns: number
  systemPrompt: string
  tools: string[]
  disallowedTools: string[]
  skills: string[]
  category: string
  enabled: boolean
  isBuiltIn: boolean
}

export interface SkillDefinition {
  id: string
  name: string
  description: string
  trigger: string
  allowedTools: string[]
  blockedTools: string[]
  maxTurns: number
  context: 'inline' | 'fork'
  content: string
  enabled: boolean
  isBuiltIn: boolean
}
