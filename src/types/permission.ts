// 权限 & 安全
export type PermissionMode = 'default' | 'auto' | 'strict'

export interface PermissionConfig {
  mode: PermissionMode
  trustedDirectories: string[]
  autoApproveReadOnly: boolean
}

export interface SafetyConfig {
  contentGuardEnabled: boolean
  injectionDetection: boolean
  destructiveCommandBlock: boolean
  maxDangerLevel: 'low' | 'medium' | 'high' | 'critical'
}
