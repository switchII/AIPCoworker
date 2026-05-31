/**
 * 技能管理模块 — 统一导出
 *
 * 提供 Agent 运行时的技能自我管理能力：
 *   - SkillManager: 核心管理器（CRUD、Copy-on-Modify、安全扫描、备份）
 *   - 技能工具: skill_create / skill_patch / skill_edit / skill_write_file / skill_remove_file / skill_delete
 *   - SkillLoader: 从文件系统加载已安装技能的 SKILL.md 内容（遵循社区 frontmatter 规范）
 *
 * 使用方式：
 *   import { getSkillManager, buildSkillToolDefinitions, executeSkillTool } from '@/agent/skill'
 *   import { loadSkillsByIdentifiers, formatSkillsForPrompt, parseFrontmatter } from '@/agent/skill'
 */

export { SkillManager, getSkillManager } from './skillManager'
export type { SkillManifest, SkillNamespace, SkillInfo, SkillOperationResult, CreateMode } from './skillManager'
export { buildSkillToolDefinitions, executeSkillTool } from './skillTools'
export {
  loadAllInstalledSkills,
  loadSkillsByIdentifiers,
  formatSkillIndex,
  formatSkillsForPrompt,
  clearSkillCache,
  parseFrontmatter,
} from './skillLoader'
export type { LoadedSkill, FrontmatterResult } from './skillLoader'
