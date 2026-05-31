import { ref } from 'vue'
import type {
  SkillDefinition, PermissionConfig, SafetyConfig,
  TriggerConfig, IMChannelConfig, SearchConfig,
  NoticeConfig, ContextConfig, UpdateConfig, SoulConfig,
  SandboxConfig, LogConfig
} from '../../types/agent'

export function useConfigs() {
  // ===== 技能管理 =====
  const skills = ref<SkillDefinition[]>([
    { id: 'web-search', name: 'Web搜索', description: '搜索互联网获取最新信息', trigger: '/search', allowedTools: ['web_search', 'http_fetch'], blockedTools: [], maxTurns: 5, context: 'inline', content: '', enabled: true, isBuiltIn: true },
    { id: 'code-review', name: '代码审查', description: '审查代码质量和安全性', trigger: '/review', allowedTools: ['read_file', 'find_files', 'search_files'], blockedTools: ['run_command'], maxTurns: 10, context: 'fork', content: '', enabled: true, isBuiltIn: true },
    { id: 'file-ops', name: '文件操作', description: '文件的读取、写入和管理', trigger: '/file', allowedTools: ['read_file', 'write_file', 'edit_file', 'list_directory', 'find_files'], blockedTools: [], maxTurns: 15, context: 'inline', content: '', enabled: true, isBuiltIn: true },
  ])

  // ===== 权限 & 安全 =====
  const permissionConfig = ref<PermissionConfig>({
    mode: 'default',
    trustedDirectories: [],
    autoApproveReadOnly: true
  })

  const safetyConfig = ref<SafetyConfig>({
    contentGuardEnabled: true,
    injectionDetection: true,
    destructiveCommandBlock: true,
    maxDangerLevel: 'medium'
  })

  // ===== 触发器 =====
  const triggers = ref<TriggerConfig[]>([])

  // ===== IM 集成 =====
  const imChannels = ref<IMChannelConfig[]>([])

  // ===== 搜索配置 =====
  const searchConfig = ref<SearchConfig>({
    provider: 'bing',
    apiKey: '',
    enabled: true
  })

  // ===== 通知配置 =====
  const noticeConfig = ref<NoticeConfig>({
    enabledTiers: ['L1', 'L2', 'L3'],
    channels: ['chat_card', 'system_notification'],
    l2QuotaPerHour: 10,
  })

  // ===== 上下文 & 性能 =====
  const contextConfig = ref<ContextConfig>({
    contextWindowSize: 128000,
    maxOutputTokens: 4096,
    autoCompaction: true,
    compressionStrategy: 'hybrid'
  })

  // ===== 更新配置 =====
  const updateConfig = ref<UpdateConfig>({
    autoCheck: true,
    checkIntervalHours: 6,
    autoInstall: false
  })

  // ===== Soul / 人格 =====
  const soulConfig = ref<SoulConfig>({
    personality: '友善、专业、乐于助人的AI助手',
    proactivityLevel: 'balanced',
    communicationStyle: '简洁明了，技术准确',
    customInstructions: ''
  })

  // ===== 沙箱 =====
  const sandboxConfig = ref<SandboxConfig>({
    enabled: false,
    isolationLevel: 'basic',
    allowedCommands: ['ls', 'cat', 'head', 'tail', 'grep', 'find', 'wc'],
    blockedPaths: ['/etc', '/usr', '/System']
  })

  // ===== 日志 =====
  const logConfig = ref<LogConfig>({
    level: 'info',
    persistLevel: 'warn',
    retentionDays: 7,
    maxBufferSize: 500
  })

  return {
    skills, permissionConfig, safetyConfig,
    triggers, imChannels, searchConfig, noticeConfig,
    contextConfig, updateConfig, soulConfig, sandboxConfig, logConfig
  }
}
