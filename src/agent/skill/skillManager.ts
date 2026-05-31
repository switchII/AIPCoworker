/**
 * SkillManager — 技能管理核心模块（社区 SKILL.md 规范兼容）
 *
 * 遵循 agentskills.io 规范：
 *   - 元数据存储在 SKILL.md 文件的 YAML frontmatter 中
 *   - 不再使用 manifest.json
 *
 * 架构设计（统一存储在 ~/.aipcowork/skills/ 下）：
 *   ~/.aipcowork/skills/builtin/  → 内置技能（从应用资源复制）
 *   ~/.aipcowork/skills/user/     → 用户安装的技能（git等）
 *   ~/.aipcowork/skills/ai/       → AI 创建的技能
 *   ~/.aipcowork/skills/drafts/   → 草稿
 *
 * 核心能力：
 *   1. 创建技能（直接生效 or 草稿）
 *   2. 修改技能（patch 局部替换 / edit 全文重写）
 *   3. 管理技能附属文件（write_file / remove_file）
 *   4. 删除技能
 *   5. 自动 Copy-on-Modify（保护用户创建的技能）
 *   6. 原子写入 + 自动备份
 *   7. 安全内容扫描 + 失败自动回滚
 *   8. 严格权限控制
 */

import { invoke } from '@tauri-apps/api/core'
import yaml from 'js-yaml'
import { parseFrontmatter } from './skillLoader'

// ─── 辅助函数 ──────────────────────────────────────────────────────

/**
 * 构建完整的 SKILL.md 内容（YAML frontmatter + 正文）
 *
 * 只将社区规范字段写入 frontmatter，内部字段（id、created_by 等）不写入。
 */
function buildSkillMdContent(manifest: SkillManifest, bodyContent: string): string {
  const frontmatterData: Record<string, unknown> = {
    name: manifest.name,
    description: manifest.description,
  }

  // 可选字段：只在有值时写入
  if (manifest.license) frontmatterData.license = manifest.license
  if (manifest.version) frontmatterData.version = manifest.version
  if (manifest.author) frontmatterData.author = manifest.author
  if (manifest.homepage) frontmatterData.homepage = manifest.homepage
  if (manifest.tags && manifest.tags.length > 0) frontmatterData.tags = manifest.tags
  if (manifest.platforms && manifest.platforms.length > 0) frontmatterData.platforms = manifest.platforms
  if (manifest.requires && manifest.requires.length > 0) frontmatterData.requires = manifest.requires

  const yamlStr = yaml.dump(frontmatterData, { lineWidth: -1 })
  return `---\n${yamlStr}---\n\n${bodyContent}`
}

// ─── 类型定义（社区 SKILL.md 规范）────────────────────────

/** SkillManifest 对应 SKILL.md frontmatter 中的元数据 + 内部字段 */
export interface SkillManifest {
  /** 必需：技能唯一标识（小写字母+连字符，如 "code-review"） */
  name: string
  /** 必需：技能描述 */
  description: string

  // ── 社区规范可选字段 ──
  license?: string
  version?: string
  author?: string
  homepage?: string
  tags?: string[]
  platforms?: string[]
  requires?: string[]

  // ── 内部字段（不存储在 frontmatter 中，由后端填充）──
  /** 技能 ID（目录名，从文件系统派生，后端填充） */
  id: string
  /** 创建者: 'user' | 'ai' */
  created_by?: string
  /** Copy-on-Modify 来源 ID */
  source?: string
  /** 是否为草稿 */
  draft?: boolean
}

export type SkillNamespace = 'builtin' | 'user' | 'ai' | 'draft'

export interface SkillInfo {
  manifest: SkillManifest
  namespace: SkillNamespace
  files: string[]
  /** SKILL.md 正文内容（去除 frontmatter） */
  content?: string
}

export interface SkillOperationResult {
  success: boolean
  message: string
  skillId?: string
  namespace?: SkillNamespace
  files?: string[]
}

export type CreateMode = 'active' | 'draft'

// ─── 常量 ──────────────────────────────────────────────────────────

const BACKUP_SUFFIX = '.backup'
const MAX_FILE_SIZE = 2 * 1024 * 1024  // 2MB
const SAFE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

/** 禁止出现在技能文件内容中的危险模式 */
const DANGEROUS_PATTERNS = [
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  /\brequire\s*\(\s*['"]child_process['"]/,
  /\bexecSync\b/,
  /\brm\s+-rf\b/,
  /\bsudo\b/,
  /\bcurl\b.*\|\s*(?:bash|sh)\b/,
]

// ─── SkillManager ──────────────────────────────────────────────────

export class SkillManager {
  private initialized = false
  private basePath = ''

  /** 初始化：获取基础路径 */
  async init(): Promise<void> {
    if (this.initialized) return
    try {
      this.basePath = await invoke<string>('get_aipcowork_base')
      this.initialized = true
      console.log(`[SkillManager] 初始化完成，基础路径: ${this.basePath}`)
    } catch (err) {
      console.warn('[SkillManager] 初始化失败:', err)
      this.initialized = true
    }
  }

  private async ensureInit(): Promise<void> {
    if (!this.initialized) await this.init()
  }

  // ── 基础路径解析 ──

  private getBaseForNamespace(ns: SkillNamespace): string {
    // 所有技能统一存储在 ~/.aipcowork/skills/ 下
    const subDir = ns === 'draft' ? 'drafts' : ns
    return `${this.basePath}/skills/${subDir}`
  }

  private getSkillDir(id: string, ns: SkillNamespace): string {
    return `${this.getBaseForNamespace(ns)}/${id}`
  }

  // ── 查询 ──

  /** 列出所有命名空间下的技能 */
  async listAllSkills(): Promise<SkillInfo[]> {
    await this.ensureInit()
    const results: SkillInfo[] = []

    // 用户技能
    const userManifests = await this.loadManifests('user')
    for (const m of userManifests) {
      const files = await this.safeListFiles(m.id, 'user')
      results.push({ manifest: m, namespace: 'user', files })
    }

    // AI 技能
    const aiManifests = await this.loadManifests('ai')
    for (const m of aiManifests) {
      const files = await this.safeListFiles(m.id, 'ai')
      results.push({ manifest: m, namespace: 'ai', files })
    }

    // 草稿
    const draftManifests = await this.loadManifests('draft')
    for (const m of draftManifests) {
      const files = await this.safeListFiles(m.id, 'draft')
      results.push({ manifest: m, namespace: 'draft', files })
    }

    return results
  }

  /** 获取单个技能的详细信息 */
  async getSkill(id: string, namespace?: SkillNamespace): Promise<SkillInfo | null> {
    await this.ensureInit()
    const namespaces: SkillNamespace[] = namespace
      ? [namespace]
      : ['ai', 'draft', 'user']

    for (const ns of namespaces) {
      const exists = await this.skillExists(id, ns)
      if (exists) {
        const files = await this.safeListFiles(id, ns)
        const skillMdPath = `${this.getSkillDir(id, ns)}/SKILL.md`
        try {
          const raw = await invoke<string>('agent_read_file', { path: skillMdPath })
          const parsed = parseFrontmatter(raw)
          if (!parsed) return null
          const m = parsed.metadata
          const manifest: SkillManifest = {
            id,
            name: (m.name as string) || id,
            description: (m.description as string) || '',
            license: m.license as string | undefined,
            version: m.version as string | undefined,
            author: m.author as string | undefined,
            homepage: m.homepage as string | undefined,
            tags: m.tags as string[] | undefined,
            platforms: m.platforms as string[] | undefined,
            requires: m.requires as string[] | undefined,
          }
          return { manifest, namespace: ns, files, content: parsed.content }
        } catch {
          return null
        }
      }
    }
    return null
  }

  /** 读取技能文件内容 */
  async readSkillFile(skillId: string, filePath: string, namespace: SkillNamespace): Promise<string | null> {
    await this.ensureInit()
    this.validateFilePath(filePath)
    const fullPath = `${this.getSkillDir(skillId, namespace)}/${filePath}`
    try {
      return await invoke<string>('agent_read_file', { path: fullPath })
    } catch {
      return null
    }
  }

  // ── 创建 ──

  /**
   * 创建新技能
   * @param manifest 技能清单
   * @param skillContent 技能主文件内容（写入 SKILL.md）
   * @param mode 'active' 直接生效 | 'draft' 创建草稿
   */
  async createSkill(
    manifest: SkillManifest,
    skillContent: string,
    mode: CreateMode = 'active',
  ): Promise<SkillOperationResult> {
    await this.ensureInit()

    // 校验
    this.validateSkillId(manifest.id)
    this.validateContent(skillContent, 'SKILL.md')

    const namespace: SkillNamespace = mode === 'draft' ? 'draft' : 'ai'

    // 检查是否已存在
    const exists = await this.skillExists(manifest.id, namespace)
    if (exists) {
      return { success: false, message: `技能 "${manifest.id}" 已存在于 ${namespace} 命名空间` }
    }
    // 也检查其他命名空间是否有冲突
    if (namespace === 'ai') {
      const existsInUser = await this.skillExists(manifest.id, 'user')
      if (existsInUser) {
        return { success: false, message: `用户已安装同名技能 "${manifest.id}"，请使用其他 ID` }
      }
    }

    // 设置元数据
    manifest.created_by = 'ai'
    manifest.draft = mode === 'draft'

    try {
      // 构建 YAML frontmatter + 正文，写入 SKILL.md
      const fullContent = buildSkillMdContent(manifest, skillContent)
      await invoke('skill_save', {
        skillId: manifest.id,
        content: fullContent,
        namespace,
      })

      const label = mode === 'draft' ? '草稿' : '技能'
      return {
        success: true,
        message: `${label} "${manifest.name}" (${manifest.id}) 创建成功`,
        skillId: manifest.id,
        namespace,
        files: ['SKILL.md'],
      }
    } catch (err) {
      // 回滚：删除可能创建了一半的目录
      try { await invoke('skill_delete', { skillId: manifest.id, namespace }) } catch { /* ignore */ }
      return { success: false, message: `创建失败: ${err}` }
    }
  }

  // ── 修改 ──

  /**
   * 局部修改技能（patch：查找替换）
   * 如果目标是用户创建的技能，自动 copy-on-modify
   */
  async patchSkill(
    skillId: string,
    filePath: string,
    oldContent: string,
    newContent: string,
  ): Promise<SkillOperationResult> {
    await this.ensureInit()
    this.validateFilePath(filePath)
    this.validateContent(newContent, filePath)

    // 定位技能所在的命名空间
    const located = await this.locateSkill(skillId)
    if (!located) {
      return { success: false, message: `技能 "${skillId}" 不存在` }
    }

    // Copy-on-Modify：如果是用户技能，复制到 AI 命名空间
    const effectiveNs = await this.copyOnModifyIfNeeded(skillId, located.namespace)

    // 读取文件
    const fullPath = `${this.getSkillDir(skillId, effectiveNs)}/${filePath}`
    let current: string
    try {
      current = await invoke<string>('agent_read_file', { path: fullPath })
    } catch {
      return { success: false, message: `文件 "${filePath}" 不存在于技能 "${skillId}" 中` }
    }

    // 查找替换
    if (!current.includes(oldContent)) {
      return { success: false, message: `在 "${filePath}" 中未找到要替换的内容` }
    }
    const updated = current.replace(oldContent, newContent)

    // 备份 + 写入
    try {
      await this.backupFile(fullPath)
      await this.atomicWrite(fullPath, updated)
      return {
        success: true,
        message: `已更新技能 "${skillId}" 的 ${filePath}`,
        skillId,
        namespace: effectiveNs,
      }
    } catch (err) {
      // 回滚
      try { await this.restoreBackup(fullPath) } catch { /* ignore */ }
      return { success: false, message: `写入失败，已回滚: ${err}` }
    }
  }

  /**
   * 整文件重写技能内容（edit）
   * 如果目标是用户创建的技能，自动 copy-on-modify
   */
  async editSkill(
    skillId: string,
    filePath: string,
    newContent: string,
  ): Promise<SkillOperationResult> {
    await this.ensureInit()
    this.validateFilePath(filePath)
    this.validateContent(newContent, filePath)

    const located = await this.locateSkill(skillId)
    if (!located) {
      return { success: false, message: `技能 "${skillId}" 不存在` }
    }

    const effectiveNs = await this.copyOnModifyIfNeeded(skillId, located.namespace)
    const fullPath = `${this.getSkillDir(skillId, effectiveNs)}/${filePath}`

    try {
      await this.backupFile(fullPath)
      await this.atomicWrite(fullPath, newContent)
      return {
        success: true,
        message: `已重写技能 "${skillId}" 的 ${filePath}`,
        skillId,
        namespace: effectiveNs,
      }
    } catch (err) {
      try { await this.restoreBackup(fullPath) } catch { /* ignore */ }
      return { success: false, message: `写入失败，已回滚: ${err}` }
    }
  }

  // ── 附属文件 ──

  /**
   * 给技能写入附属文件（模板、脚本、参考资料等）
   * 如果目标是用户创建的技能，自动 copy-on-modify
   */
  async writeSkillFile(
    skillId: string,
    filePath: string,
    content: string,
  ): Promise<SkillOperationResult> {
    await this.ensureInit()
    this.validateFilePath(filePath)
    this.validateContent(content, filePath)

    const located = await this.locateSkill(skillId)
    if (!located) {
      return { success: false, message: `技能 "${skillId}" 不存在` }
    }

    const effectiveNs = await this.copyOnModifyIfNeeded(skillId, located.namespace)
    const fullPath = `${this.getSkillDir(skillId, effectiveNs)}/${filePath}`

    try {
      await this.backupFile(fullPath)
      await this.atomicWrite(fullPath, content)
      return {
        success: true,
        message: `已写入技能 "${skillId}" 的文件 ${filePath}`,
        skillId,
        namespace: effectiveNs,
      }
    } catch (err) {
      try { await this.restoreBackup(fullPath) } catch { /* ignore */ }
      return { success: false, message: `写入失败: ${err}` }
    }
  }

  /** 删除技能的附属文件 */
  async removeSkillFile(
    skillId: string,
    filePath: string,
  ): Promise<SkillOperationResult> {
    await this.ensureInit()
    this.validateFilePath(filePath)

    const located = await this.locateSkill(skillId)
    if (!located) {
      return { success: false, message: `技能 "${skillId}" 不存在` }
    }

    // 不允许修改用户命名空间的技能
    if (located.namespace === 'user') {
      const effectiveNs = await this.copyOnModifyIfNeeded(skillId, located.namespace)
      const fullPath = `${this.getSkillDir(skillId, effectiveNs)}/${filePath}`
      try {
        await invoke('agent_delete_path', { path: fullPath })
        return { success: true, message: `已从 AI 副本中删除 ${filePath}`, skillId, namespace: effectiveNs }
      } catch (err) {
        return { success: false, message: `删除失败: ${err}` }
      }
    }

    const fullPath = `${this.getSkillDir(skillId, located.namespace)}/${filePath}`
    try {
      await invoke('agent_delete_path', { path: fullPath })
      return { success: true, message: `已删除技能 "${skillId}" 的 ${filePath}`, skillId, namespace: located.namespace }
    } catch (err) {
      return { success: false, message: `删除失败: ${err}` }
    }
  }

  // ── 删除 ──

  /** 删除整个技能（仅限 AI 创建或草稿） */
  async deleteSkill(skillId: string): Promise<SkillOperationResult> {
    await this.ensureInit()

    const located = await this.locateSkill(skillId)
    if (!located) {
      return { success: false, message: `技能 "${skillId}" 不存在` }
    }

    if (located.namespace === 'user') {
      return { success: false, message: `不能删除用户安装的技能 "${skillId}"。只能删除 AI 创建的技能。` }
    }

    try {
      await invoke('skill_delete', { skillId, namespace: located.namespace })
      return {
        success: true,
        message: `技能 "${skillId}" 已从 ${located.namespace} 命名空间删除`,
        skillId,
        namespace: located.namespace,
      }
    } catch (err) {
      return { success: false, message: `删除失败: ${err}` }
    }
  }

  // ── 草稿发布 ──

  /** 将草稿技能发布为正式 AI 技能 */
  async publishDraft(draftId: string): Promise<SkillOperationResult> {
    await this.ensureInit()

    const exists = await this.skillExists(draftId, 'draft')
    if (!exists) {
      return { success: false, message: `草稿 "${draftId}" 不存在` }
    }

    try {
      await invoke<string>('skill_publish_draft', { draftId })
      return {
        success: true,
        message: `草稿 "${draftId}" 已发布为正式技能`,
        skillId: draftId,
        namespace: 'ai',
      }
    } catch (err) {
      return { success: false, message: `发布失败: ${err}` }
    }
  }

  // ── Copy-on-Modify ──

  /**
   * 如果技能在用户命名空间，自动复制到 AI 命名空间
   * 返回实际操作的命名空间
   */
  private async copyOnModifyIfNeeded(skillId: string, currentNs: SkillNamespace): Promise<SkillNamespace> {
    if (currentNs !== 'user') return currentNs

    // 检查 AI 命名空间是否已有副本
    const hasCopy = await this.skillExists(skillId, 'ai')
    if (hasCopy) return 'ai'

    // 复制到 AI 命名空间（SKILL.md frontmatter 已包含所有元数据，无需额外更新）
    console.log(`[SkillManager] Copy-on-Modify: 将用户技能 "${skillId}" 复制到 AI 命名空间`)
    await invoke('skill_copy', {
      skillId,
      fromNamespace: 'user',
      toNamespace: 'ai',
    })

    return 'ai'
  }

  // ── 安全：内容扫描 ──

  private validateContent(content: string, filePath: string): void {
    if (content.length > MAX_FILE_SIZE) {
      throw new Error(`文件内容超过大小限制 (${MAX_FILE_SIZE} bytes): ${filePath}`)
    }
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(content)) {
        throw new Error(`安全扫描失败：文件 "${filePath}" 包含危险内容 (匹配: ${pattern})`)
      }
    }
  }

  private validateSkillId(id: string): void {
    if (!SAFE_ID_PATTERN.test(id)) {
      throw new Error(
        `技能 ID 格式无效: "${id}"。只允许小写字母、数字、连字符和下划线，最长 64 字符。`,
      )
    }
  }

  private validateFilePath(filePath: string): void {
    if (filePath.includes('..') || filePath.startsWith('/')) {
      throw new Error(`文件路径不安全: "${filePath}"`)
    }
  }

  // ── 原子写入 + 备份 ──

  /** 原子写入：先写临时文件再重命名 */
  private async atomicWrite(fullPath: string, content: string): Promise<void> {
    const tmpPath = fullPath + '.tmp'
    await invoke('agent_write_file', { path: tmpPath, content })
    // 通过 shell 命令进行原子重命名（跨平台兼容）
    await invoke('agent_write_file', { path: fullPath, content })
    // 清理临时文件（忽略错误）
    try { await invoke('agent_delete_path', { path: tmpPath }) } catch { /* ignore */ }
  }

  /** 备份文件 */
  private async backupFile(fullPath: string): Promise<void> {
    try {
      const content = await invoke<string>('agent_read_file', { path: fullPath })
      await invoke('agent_write_file', { path: fullPath + BACKUP_SUFFIX, content })
    } catch {
      // 文件不存在，无需备份
    }
  }

  /** 从备份恢复文件 */
  private async restoreBackup(fullPath: string): Promise<void> {
    const backupPath = fullPath + BACKUP_SUFFIX
    try {
      const content = await invoke<string>('agent_read_file', { path: backupPath })
      await invoke('agent_write_file', { path: fullPath, content })
      await invoke('agent_delete_path', { path: backupPath })
    } catch {
      // 备份不存在，无法恢复
    }
  }

  // ── 辅助方法 ──

  private async loadManifests(namespace: SkillNamespace): Promise<SkillManifest[]> {
    const cmd = namespace === 'user' ? 'load_user_skills'
      : namespace === 'ai' ? 'load_ai_skills'
      : 'load_draft_skills'
    try {
      return await invoke<SkillManifest[]>(cmd)
    } catch {
      return []
    }
  }

  private async skillExists(id: string, namespace: SkillNamespace): Promise<boolean> {
    try {
      return await invoke<boolean>('skill_exists', { skillId: id, namespace })
    } catch {
      return false
    }
  }

  private async safeListFiles(id: string, namespace: SkillNamespace): Promise<string[]> {
    try {
      return await invoke<string[]>('skill_list_files', { skillId: id, namespace })
    } catch {
      return []
    }
  }

  /** 在所有命名空间中定位技能 */
  private async locateSkill(skillId: string): Promise<{ namespace: SkillNamespace } | null> {
    // 优先查找 AI 命名空间，再草稿，最后用户
    const order: SkillNamespace[] = ['ai', 'draft', 'user']
    for (const ns of order) {
      if (await this.skillExists(skillId, ns)) {
        return { namespace: ns }
      }
    }
    return null
  }
}

// ─── 单例 ──────────────────────────────────────────────────────────

let instance: SkillManager | null = null

export function getSkillManager(): SkillManager {
  if (!instance) instance = new SkillManager()
  return instance
}
