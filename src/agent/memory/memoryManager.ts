/**
 * MemoryManager — 记忆模块核心管理器
 *
 * 架构设计：
 *   - SOUL.md: 身份设定文件（只读，注入提示词）
 *   - memories.json: 所有动态记忆存储在单个 JSON 文件中
 *
 * 功能：
 *   1. 加载 SOUL.md 作为身份设定
 *   2. 从 memories.json 加载/保存动态记忆
 *   3. 提供记忆的增删改查（CRUD）能力
 *   4. 根据日期、关键词相关性排序记忆
 *   5. 将记忆格式化为系统提示词注入 LLM 上下文
 */

import { invoke } from '@tauri-apps/api/core'
import type { MemoryType } from '../../types/system'

// ─── 类型 ──────────────────────────────────────────────────────

export interface DynamicMemoryEntry {
  id: string
  title: string
  content: string
  type: MemoryType
  tags: string[]
  source: string
  created: string
  updated: string
  relevance: number
}

interface MemoryStore {
  version: number
  entries: DynamicMemoryEntry[]
}

// ─── 常量 ──────────────────────────────────────────────────────

const MEMORIES_FILE = '/memories.json'
const TYPE_PRIORITY: Record<MemoryType, number> = { user: 4, feedback: 3, project: 2, reference: 1 }
const MAX_PROMPT_MEMORIES = 8

const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  user: '用户偏好', feedback: '反馈', project: '项目知识', reference: '参考资料',
}

// ─── 工具函数 ──────────────────────────────────────────────────

function escapeRegex(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function formatDate(iso: string): string {
  try {
    const d = new Date(iso), now = new Date()
    const days = Math.floor((now.getTime() - d.getTime()) / 86400000)
    if (days === 0) return '今天'
    if (days === 1) return '昨天'
    if (days < 7) return `${days}天前`
    if (days < 30) return `${Math.floor(days / 7)}周前`
    return d.toLocaleDateString('zh-CN')
  } catch { return iso }
}

function isPlaceholder(content: string): boolean {
  const P = ['等待加载...', '# SOUL.md\n\n等待加载...']
  return P.some((p) => content.trim() === p.trim())
}

const STOP_WORDS = new Set([
  '的','了','在','是','我','有','和','就','不','人','都','一','一个','上','也','很','到','说','要','去',
  '你','会','着','没','看','好','自己','这','他','她','它','们','那','被','从','把','帮','请','可以',
  '能','用','做','为','对','以','而','或','但','the','a','an','is','are','was','were','be','been',
  'have','has','had','do','does','did','will','would','could','should','may','might','can','shall',
  'to','of','in','for','on','with','at','by','from','as','and','but','or','not','this','that','it',
])

// ─── MemoryManager ─────────────────────────────────────────────

export class MemoryManager {
  private initialized = false
  private soulContent = ''
  private entries: DynamicMemoryEntry[] = []

  async init(): Promise<void> {
    if (this.initialized) return
    try {
      await this.loadSOUL()
      await this.loadMemories()
      this.initialized = true
      console.log(`[MemoryManager] 初始化完成，动态记忆数: ${this.entries.length}`)
    } catch (err) {
      console.warn('[MemoryManager] 初始化失败:', err)
      this.initialized = true
    }
  }

  async reload(): Promise<void> { this.initialized = false; await this.init() }

  // ── 加载 ──

  private async loadSOUL(): Promise<void> {
    try {
      this.soulContent = await invoke<string>('read_memory_file', { path: '/core/SOUL.md' })
    } catch {
      this.soulContent = ''
    }
  }

  private async loadMemories(): Promise<void> {
    try {
      const raw = await invoke<string>('read_memory_file', { path: MEMORIES_FILE })
      if (raw) {
        const store: MemoryStore = JSON.parse(raw)
        this.entries = store.entries || []
      } else {
        this.entries = []
      }
    } catch {
      this.entries = []
    }
  }

  private async saveMemories(): Promise<void> {
    const store: MemoryStore = { version: 1, entries: this.entries }
    try {
      await invoke('write_memory_file', { path: MEMORIES_FILE, content: JSON.stringify(store, null, 2) })
    } catch (err) {
      console.error('[MemoryManager] 保存记忆失败:', err)
    }
  }

  // ── CRUD ──

  async addMemory(input: { title: string; content: string; type: MemoryType; tags?: string[]; source?: string }): Promise<DynamicMemoryEntry> {
    await this.ensureInit()
    const now = new Date().toISOString()
    const entry: DynamicMemoryEntry = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: input.title, content: input.content, type: input.type,
      tags: input.tags ?? [], source: input.source ?? 'agent',
      created: now, updated: now, relevance: 0,
    }
    this.entries.push(entry)
    await this.saveMemories()
    console.log(`[MemoryManager] 添加记忆: ${entry.id}`)
    return entry
  }

  async updateMemory(id: string, patch: Partial<Pick<DynamicMemoryEntry, 'title' | 'content' | 'type' | 'tags' | 'source'>>): Promise<DynamicMemoryEntry | null> {
    await this.ensureInit()
    const entry = this.entries.find((e) => e.id === id)
    if (!entry) { console.warn(`[MemoryManager] 未找到记忆: ${id}`); return null }

    if (patch.title !== undefined) entry.title = patch.title
    if (patch.content !== undefined) entry.content = patch.content
    if (patch.tags !== undefined) entry.tags = patch.tags
    if (patch.source !== undefined) entry.source = patch.source
    if (patch.type !== undefined) entry.type = patch.type
    entry.updated = new Date().toISOString()

    await this.saveMemories()
    console.log(`[MemoryManager] 更新记忆: ${id}`)
    return entry
  }

  async deleteMemory(id: string): Promise<boolean> {
    await this.ensureInit()
    const idx = this.entries.findIndex((e) => e.id === id)
    if (idx === -1) { console.warn(`[MemoryManager] 未找到记忆: ${id}`); return false }
    this.entries.splice(idx, 1)
    await this.saveMemories()
    console.log(`[MemoryManager] 删除记忆: ${id}`)
    return true
  }

  getAllMemories(): DynamicMemoryEntry[] { return [...this.entries] }
  getMemoryById(id: string): DynamicMemoryEntry | null { return this.entries.find((e) => e.id === id) ?? null }

  // ── 搜索 ──

  searchMemories(query: string, opts?: { type?: MemoryType; tags?: string[]; limit?: number }): DynamicMemoryEntry[] {
    const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 0)
    let entries = [...this.entries]
    if (opts?.type) entries = entries.filter((e) => e.type === opts.type)
    if (opts?.tags?.length) entries = entries.filter((e) => opts.tags!.some((t) => e.tags.includes(t)))

    const now = Date.now()
    const DAY = 86400000

    const scored = entries.map((entry) => {
      const tL = entry.title.toLowerCase(), cL = entry.content.toLowerCase(), tgL = entry.tags.join(' ').toLowerCase()
      let kw = 0
      for (const k of keywords) {
        const re = new RegExp(escapeRegex(k), 'g')
        kw += (tL.match(re) || []).length * 3 + (tgL.match(re) || []).length * 2 + (cL.match(re) || []).length
      }
      if (keywords.length > 0 && kw === 0) return { entry, score: -1 }
      const recency = Math.max(0, 1 - (now - new Date(entry.updated).getTime()) / (30 * DAY))
      const typeScore = (TYPE_PRIORITY[entry.type] ?? 1) / 4
      const score = kw * 0.5 + recency * 0.3 + typeScore * 0.2
      return { entry: { ...entry, relevance: Math.round(score * 100) / 100 }, score }
    })

    return scored.filter((s) => s.score >= 0).sort((a, b) => b.score - a.score).slice(0, opts?.limit ?? 20).map((s) => s.entry)
  }

  // ── 提示词 ──

  getMemoryContextForPrompt(userMessage?: string): string {
    const sections: string[] = []

    if (this.soulContent && !isPlaceholder(this.soulContent)) {
      sections.push('## 身份设定', this.soulContent.slice(0, 1000))
    }

    const relevant = this.getRelevantMemories(userMessage, MAX_PROMPT_MEMORIES)
    if (relevant.length > 0) {
      const lines = relevant.map((m) => {
        const tl = MEMORY_TYPE_LABELS[m.type] ?? m.type
        const tags = m.tags.length ? ` [${m.tags.join(', ')}]` : ''
        return `- **${m.title}** (${tl}, ${formatDate(m.updated)})${tags}: ${m.content.slice(0, 200)}`
      })
      sections.push('## 相关记忆', lines.join('\n'))
    }

    if (sections.length === 0) return ''
    return ['# 记忆上下文', '', sections.join('\n\n'), '', '---', '以上是你的记忆信息，请在回答时参考相关内容。'].join('\n')
  }

  private getRelevantMemories(userMessage: string | undefined, limit: number): DynamicMemoryEntry[] {
    if (this.entries.length === 0) return []
    if (userMessage) {
      const kws = userMessage.replace(/[，。？！、；：""''（）\s]+/g, ' ').split(/\s+/)
        .filter((w) => w.length >= 2 && !STOP_WORDS.has(w)).slice(0, 5)
      if (kws.length > 0) {
        const results = this.searchMemories(kws.join(' '), { limit })
        if (results.length > 0) return results
      }
    }
    return [...this.entries].sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
      .slice(0, limit).map((e) => ({ ...e, relevance: 0 }))
  }

  private async ensureInit(): Promise<void> { if (!this.initialized) await this.init() }
}

// ─── 单例 ──────────────────────────────────────────────────────

let instance: MemoryManager | null = null
export function getMemoryManager(): MemoryManager {
  if (!instance) instance = new MemoryManager()
  return instance
}
