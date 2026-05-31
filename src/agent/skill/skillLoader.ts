/**
 * SkillLoader — 从文件系统加载已安装技能的 SKILL.md 内容
 *
 * 遵循社区 SKILL.md 规范（agentskills.io）：
 *   - 元数据存储在 SKILL.md 文件的 YAML frontmatter 中
 *   - 不再使用 manifest.json
 *
 * 职责：
 *   1. 扫描所有命名空间下的已安装技能（builtin / user / ai）
 *   2. 读取每个技能的 SKILL.md，解析 frontmatter
 *   3. 根据技能名称/ID 匹配并返回内容，供 Agent 注入系统提示
 *
 * 技能存储路径（统一在 ~/.aipcowork/skills/ 下）：
 *   ~/.aipcowork/skills/builtin/{id}/SKILL.md  → 内置技能
 *   ~/.aipcowork/skills/user/{id}/SKILL.md     → 用户安装的技能
 *   ~/.aipcowork/skills/ai/{id}/SKILL.md       → AI 创建的技能
 */

import { invoke } from '@tauri-apps/api/core'
import yaml from 'js-yaml'

// ─── 类型定义 ──────────────────────────────────────────────────────

export interface LoadedSkill {
  /** 技能 ID（目录名，遵循 kebab-case 规范） */
  id: string
  /** 技能显示名称 (frontmatter: name) */
  name: string
  /** 技能描述 (frontmatter: description) */
  description: string
  /** 许可证 (frontmatter: license) */
  license?: string
  /** 版本号 (frontmatter: version) */
  version?: string
  /** 作者 (frontmatter: author) */
  author?: string
  /** 主页链接 (frontmatter: homepage) */
  homepage?: string
  /** 分类标签 (frontmatter: tags) */
  tags?: string[]
  /** 支持平台 (frontmatter: platforms) */
  platforms?: string[]
  /** 依赖的其他技能 (frontmatter: requires) */
  requires?: string[]
  /** SKILL.md 正文内容（去除 frontmatter） */
  content: string
  /** 来源命名空间 */
  namespace: 'builtin' | 'user' | 'ai'
  /** 技能目录的绝对路径（用于解析技能内的脚本和附属文件） */
  dirPath: string
}

// ─── 内部缓存 ──────────────────────────────────────────────────────

let cachedSkills: LoadedSkill[] | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 5_000 // 5 秒缓存

// ─── Frontmatter 解析 ────────────────────────────────────────────────

/** frontmatter 解析结果 */
export interface FrontmatterResult {
  /** YAML 元数据对象 */
  metadata: Record<string, unknown>
  /** 去除 frontmatter 后的正文内容 */
  content: string
}

/**
 * 解析 Markdown 文件开头的 YAML frontmatter
 *
 * @param text 原始文件内容
 * @returns 解析结果，如果没有 frontmatter 则返回 null
 */
export function parseFrontmatter(text: string): FrontmatterResult | null {
  const trimmed = text.trimStart()
  if (!trimmed.startsWith('---')) return null

  // 找到第二个 ---
  const afterFirst = trimmed.slice(3)
  const secondDelimIdx = afterFirst.indexOf('\n---')
  if (secondDelimIdx === -1) return null

  const yamlBlock = afterFirst.slice(0, secondDelimIdx)
  const contentStart = 3 + secondDelimIdx + 4 // ---\n + yaml + \n---

  let metadata: Record<string, unknown>
  try {
    metadata = (yaml.load(yamlBlock) as Record<string, unknown>) || {}
  } catch {
    return null
  }

  // 去除 frontmatter 后的内容（跳过可能的换行）
  let content = trimmed.slice(contentStart)
  if (content.startsWith('\n')) content = content.slice(1)

  return { metadata, content }
}

// ─── 核心加载函数 ──────────────────────────────────────────────────

/**
 * 获取 ~/.aipcowork 基础路径
 */
async function getBasePath(): Promise<string> {
  return invoke<string>('get_aipcowork_base')
}

/**
 * 从指定命名空间加载所有已安装技能
 *
 * 每个技能目录必须包含 SKILL.md 文件，其 YAML frontmatter 包含元数据。
 */
async function loadSkillsFromNamespace(namespace: 'builtin' | 'user' | 'ai'): Promise<LoadedSkill[]> {
  const base = await getBasePath()
  const dirName = namespace  // 'builtin' | 'user' | 'ai'
  const baseDir = `${base}/skills/${dirName}`

  const skills: LoadedSkill[] = []

  // 1. 列出 base 目录下所有子目录（每个子目录是一个技能）
  let entries: Array<{ name: string; type: string }>
  try {
    entries = await invoke<Array<{ name: string; type: string }>>('agent_list_directory', { path: baseDir })
  } catch {
    // 目录不存在或无权限
    return skills
  }

  // 2. 遍历每个技能目录，读取 SKILL.md 并解析 frontmatter
  for (const entry of entries) {
    if (entry.type !== 'directory') continue
    const skillId = entry.name
    const skillDir = `${baseDir}/${skillId}`

    // 读取 SKILL.md
    let rawContent: string
    try {
      rawContent = await invoke<string>('agent_read_file', { path: `${skillDir}/SKILL.md` })
    } catch {
      // SKILL.md 不存在，跳过
      continue
    }

    // 解析 frontmatter
    const parsed = parseFrontmatter(rawContent)
    if (!parsed) {
      console.warn(`[SkillLoader] 技能 "${skillId}" 的 SKILL.md 缺少有效 frontmatter，跳过`)
      continue
    }

    const m = parsed.metadata
    skills.push({
      id: skillId,
      name: (m.name as string) || skillId,
      description: (m.description as string) || '',
      license: m.license as string | undefined,
      version: m.version as string | undefined,
      author: m.author as string | undefined,
      homepage: m.homepage as string | undefined,
      tags: m.tags as string[] | undefined,
      platforms: m.platforms as string[] | undefined,
      requires: m.requires as string[] | undefined,
      content: parsed.content,
      namespace,
      dirPath: skillDir,
    })
  }

  return skills
}

/**
 * 加载所有已安装的技能（builtin + user + ai），带 5 秒缓存。
 *
 * 优先级：ai > user > builtin（后面的覆盖前面的同名技能）
 */
export async function loadAllInstalledSkills(): Promise<LoadedSkill[]> {
  const now = Date.now()
  if (cachedSkills && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedSkills
  }

  const [builtinSkills, userSkills, aiSkills] = await Promise.all([
    loadSkillsFromNamespace('builtin'),
    loadSkillsFromNamespace('user'),
    loadSkillsFromNamespace('ai'),
  ])

  // 优先级：ai > user > builtin（后面的覆盖前面的同名技能）
  const merged = new Map<string, LoadedSkill>()
  for (const s of builtinSkills) merged.set(s.id, s)
  for (const s of userSkills) merged.set(s.id, s)
  for (const s of aiSkills) merged.set(s.id, s)

  cachedSkills = Array.from(merged.values())
  cacheTimestamp = now
  return cachedSkills
}

/** 清除缓存，强制下次重新加载 */
export function clearSkillCache(): void {
  cachedSkills = null
  cacheTimestamp = 0
}

// ─── 按名称/ID 匹配 ───────────────────────────────────────────────

/**
 * 根据技能名称列表，加载对应的 SKILL.md 内容。
 *
 * 匹配策略：
 *   1. 先按 ID 精确匹配
 *   2. 再按 name 匹配
 *
 * @param skillIdentifiers 用户在 UI 中选中的技能名称或 ID 列表
 * @returns 匹配到的技能列表（包含 SKILL.md 内容）
 */
export async function loadSkillsByIdentifiers(skillIdentifiers: string[]): Promise<LoadedSkill[]> {
  if (skillIdentifiers.length === 0) return []

  const all = await loadAllInstalledSkills()
  const matched: LoadedSkill[] = []
  const usedIds = new Set<string>()

  for (const identifier of skillIdentifiers) {
    // 1. 按 ID 精确匹配
    let skill = all.find(s => s.id === identifier && !usedIds.has(s.id))
    // 2. 按 name 匹配
    if (!skill) {
      skill = all.find(s => s.name === identifier && !usedIds.has(s.id))
    }
    if (skill) {
      matched.push(skill)
      usedIds.add(skill.id)
    }
  }

  return matched
}

// ─── 系统提示注入格式化 ────────────────────────────────────────────

/**
 * 生成已安装技能的轻量级索引（仅名称 + 描述）。
 *
 * 用于让 Agent 感知有哪些技能可用，但不注入完整 SKILL.md 内容，
 * 避免消耗大量 token。
 *
 * 输出示例：
 *   # 可用技能索引
 *
 *   - **PDF 处理**: 解析、合并、拆分 PDF 文件
 *   - **数据分析**: 对 CSV / JSON 数据进行统计分析
 */
export function formatSkillIndex(skills: LoadedSkill[]): string {
  if (skills.length === 0) return ''

  const sections: string[] = ['# 可用技能索引', '']
  sections.push('以下是本地已安装的技能。在执行任务前，请先浏览此列表，')
  sections.push('如果发现有与当前任务相关的技能，务必通过 skill_load 工具加载完整指令后再执行。')
  sections.push('这能让你的输出更专业、更符合用户预期。')
  sections.push('')
  sections.push('常见场景提示：')
  sections.push('- 生成报告、图表、仪表盘、信息图之前，检查是否有 infographic、chart、report 等相关技能')
  sections.push('- 处理特定文件格式前，检查是否有对应的文件处理技能')
  sections.push('- 执行数据分析前，检查是否有 analysis、data 等相关技能')
  sections.push('')

  for (const skill of skills) {
    const desc = skill.description ? `: ${skill.description}` : ''
    const tags = skill.tags?.length ? ` [${skill.tags.join(', ')}]` : ''
    sections.push(`- **${skill.name}** (${skill.id})${desc}${tags}`)
  }

  return sections.join('\n')
}

/**
 * 将已加载的技能内容格式化为系统提示片段（完整内容注入）。
 *
 * 仅用于用户**显式选中**的技能，将 SKILL.md 正文注入系统提示。
 *
 * 输出示例：
 *   # 已启用技能
 *
 *   ## PDF 处理
 *   (SKILL.md 内容...)
 *
 *   ## 数据分析
 *   (SKILL.md 内容...)
 */
export function formatSkillsForPrompt(skills: LoadedSkill[]): string {
  const withContent = skills.filter(s => s.content.trim().length > 0)
  if (withContent.length === 0) return ''

  const sections: string[] = ['# 已启用技能', '']
  sections.push('以下是用户启用的技能，请严格按照技能指令执行任务：')
  sections.push('')

  for (const skill of withContent) {
    sections.push(`## ${skill.name}`)
    if (skill.description) {
      sections.push(`> ${skill.description}`)
    }
    sections.push(`> 技能目录: ${skill.dirPath}`)
    sections.push(`> 注意：技能中引用的脚本和文件路径均相对于此目录`)
    sections.push('')
    sections.push(skill.content.trim())
    sections.push('')
  }

  return sections.join('\n')
}
