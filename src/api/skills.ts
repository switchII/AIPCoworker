/**
 * 技能市场 API
 *
 * 本地技能（已安装）通过 Tauri invoke 从 ~/.aipcowork/skills/ 读取
 * 商店技能（未安装）通过 HTTP API 获取
 */

import { invoke } from '@tauri-apps/api/core'
import { get, post } from '@/utils/request'
import { USE_MOCK } from '@/mock'
import {
  mockGetMarketplaceSkills,
  mockInstallSkill,
  mockCreateSkill,
  type SkillManifest,
} from '@/mock/skills'

// ======================== 类型导出 ========================

export type { SkillManifest }

// ======================== API ========================

const skillsApi = {
  /** 获取本地内置技能（~/.aipcowork/skills/builtin）— 始终从真实文件系统读取 */
  async getLocalBuiltin(): Promise<SkillManifest[]> {
    return invoke<SkillManifest[]>('load_builtin_skills')
  },

  /** 获取本地用户已安装技能（~/.aipcowork/skills/user）— 始终从真实文件系统读取 */
  async getLocalUser(): Promise<SkillManifest[]> {
    return invoke<SkillManifest[]>('load_user_skills')
  },

  /** 获取本地 AI 创建的技能（~/.aipcowork/skills/ai）— 始终从真实文件系统读取 */
  async getLocalAi(): Promise<SkillManifest[]> {
    return invoke<SkillManifest[]>('load_ai_skills')
  },

  /** 获取技能商店列表（HTTP API，返回所有可安装的技能）— mock 可用 */
  async getMarketplace(): Promise<SkillManifest[]> {
    if (USE_MOCK) return mockGetMarketplaceSkills()
    return get<SkillManifest[]>('/api/skills/marketplace')
  },

  /** 安装技能（从商店安装到 ~/.aipcowork/skills/user）— mock 可用 */
  async install(skillId: string): Promise<void> {
    if (USE_MOCK) return mockInstallSkill(skillId)
    return post<void>(`/api/skills/${skillId}/install`)
  },

  /** 卸载技能（从 ~/.aipcowork/skills/user 删除）— 始终调用 Tauri */
  async uninstall(skillId: string): Promise<void> {
    return invoke<void>('uninstall_skill', { skillId })
  },

  /** 创建新技能 */
  create(data: SkillManifest): Promise<{ success: boolean; message: string }> {
    if (USE_MOCK) return mockCreateSkill(data)
    return post<{ success: boolean; message: string }>('/api/skills', data)
  },
}

export default skillsApi
