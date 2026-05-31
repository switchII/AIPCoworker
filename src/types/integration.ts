// MCP / IM / 搜索 / 通知 / 连接器 / 专家套件 集成
export type MCPTransport = 'stdio' | 'http' | 'sse'

// ─── 专家套件（多技能组合）────────────────────────────────────
export interface ExpertSuite {
  id: string
  name: string
  description: string
  icon: string
  /** 套件包含的技能 ID 列表（对应 SKILL.md 中的 id） */
  skillIds: string[]
  /** 是否已安装 */
  installed: boolean
  createdAt: number
}

// ─── 连接器（SSH / MySQL / PostgreSQL）─────────────────────
export type ConnectorType = 'ssh' | 'mysql' | 'postgresql'

export interface SSHConfig {
  host: string
  port: number
  username: string
  authType: 'password' | 'private_key'
  password?: string
  privateKeyPath?: string   // 私钥文件路径
  passphrase?: string       // 私钥密码
}

export interface DatabaseConfig {
  host: string
  port: number
  username: string
  password?: string
  database: string
  useSSL?: boolean
}

export interface ConnectorConfig {
  id: string
  name: string            // 用户自定义名称，如 "生产服务器" / "测试库"
  type: ConnectorType     // 'ssh' | 'mysql' | 'postgresql'
  description?: string
  enabled: boolean
  ssh?: SSHConfig
  db?: DatabaseConfig
  createdAt: number
}

export interface MCPServerConfig {
  id: string
  name: string
  transport: MCPTransport
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  // 认证相关字段
  authType?: 'none' | 'bearer' | 'apikey' | 'basic'
  apiKey?: string
  apiKeyHeader?: string  // 例如：'X-API-Key' 或 'Authorization'
  enabled: boolean
  timeout: number
}

export type IMPlatform = 'dingtalk' | 'feishu' | 'wechat_work' | 'slack'
export type CapabilityLevel = 'chat_only' | 'read_tools' | 'safe_tools' | 'full'

export interface IMChannelConfig {
  id: string
  platform: IMPlatform
  name: string
  webhookUrl: string
  capabilityLevel: CapabilityLevel
  workspaceBinding?: string
  enabled: boolean
}

export type SearchProvider = 'bing' | 'brave' | 'tavily' | 'searxng'

export interface SearchConfig {
  provider: SearchProvider
  apiKey: string
  baseUrl?: string
  enabled: boolean
}

export type NoticeTier = 'L1' | 'L2' | 'L3'
export type NoticeChannel = 'chat_card' | 'sidebar_badge' | 'system_notification' | 'pet_bubble'

export interface NoticeConfig {
  enabledTiers: NoticeTier[]
  channels: NoticeChannel[]
  l2QuotaPerHour: number
  quietHoursStart?: string
  quietHoursEnd?: string
}
