/**
 * 记忆工具定义与执行器
 *
 * 为 Agent 提供 4 个记忆操作工具：
 *   - memory_search: 搜索记忆
 *   - memory_add:    添加新记忆
 *   - memory_update: 更新已有记忆
 *   - memory_delete: 删除记忆
 *
 * 工具定义遵循 src/data/tool-definitions/ 的模式，
 * 执行器委托给 MemoryManager 单例。
 */

import type { ToolDefinition } from '../llm/llmClient'
import type { ToolResult } from '../core/reactAgent'
import type { MemoryType } from '../../types/system'
import { getMemoryManager } from './memoryManager'

// ─── 工具定义 ──────────────────────────────────────────────────

const memorySearchTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'memory_search',
    description:
      '搜索记忆库中的记忆条目。根据关键词查询相关记忆，返回按相关度排序的结果。' +
      '当你需要回忆过去的对话、查找之前保存的知识或了解用户偏好时使用此工具。' +
      '支持按类型和标签过滤。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词（空格分隔多个关键词）',
        },
        type: {
          type: 'string',
          enum: ['user', 'feedback', 'project', 'reference'],
          description: '按记忆类型过滤（可选）：user=用户偏好, feedback=反馈, project=项目知识, reference=参考资料',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '按标签过滤（可选，任意匹配）',
        },
        limit: {
          type: 'number',
          description: '返回结果数量上限（默认 10，最大 20）',
        },
      },
      required: ['query'],
    },
  },
}

const memoryAddTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'memory_add',
    description:
      '向记忆库添加一条新记忆。当你从对话中获取到重要信息、用户偏好、项目知识或需要长期记住的内容时使用。' +
      '记忆会在后续对话中自动被检索和引用。',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: '记忆标题（简明扼要，10-50字）',
        },
        content: {
          type: 'string',
          description: '记忆正文内容（详细记录关键信息）',
        },
        type: {
          type: 'string',
          enum: ['user', 'feedback', 'project', 'reference'],
          description: '记忆类型：user=用户偏好/习惯, feedback=用户反馈/纠正, project=项目相关知识, reference=参考资料/链接',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '标签列表（用于分类和检索，如 ["前端", "React", "偏好"]）',
        },
        source: {
          type: 'string',
          description: '来源说明（可选，如 "对话#2024-01-15"）',
        },
      },
      required: ['title', 'content', 'type'],
    },
  },
}

const memoryUpdateTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'memory_update',
    description:
      '更新已有的记忆条目。当记忆内容过时、需要补充或修正时使用。' +
      '支持部分更新（只修改指定字段）。请先用 memory_search 找到目标记忆的 ID。',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '要更新的记忆 ID（从 memory_search 结果获取）',
        },
        title: {
          type: 'string',
          description: '新标题（可选）',
        },
        content: {
          type: 'string',
          description: '新内容（可选）',
        },
        type: {
          type: 'string',
          enum: ['user', 'feedback', 'project', 'reference'],
          description: '新类型（可选）',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '新标签列表（可选，会完全替换原标签）',
        },
      },
      required: ['id'],
    },
  },
}

const memoryDeleteTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'memory_delete',
    description:
      '删除一条记忆。当记忆完全过时、错误或用户要求删除时使用。' +
      '删除操作不可恢复，请谨慎使用。先用 memory_search 找到目标记忆的 ID。',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '要删除的记忆 ID（从 memory_search 结果获取）',
        },
      },
      required: ['id'],
    },
  },
}

/** 所有记忆工具定义列表 */
export function buildMemoryToolDefinitions(): ToolDefinition[] {
  return [memorySearchTool, memoryAddTool, memoryUpdateTool, memoryDeleteTool]
}

// ─── 工具执行器 ────────────────────────────────────────────────

/**
 * 执行记忆工具调用。
 * @returns ToolResult，如果工具名不匹配则返回 null
 */
export async function executeMemoryTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult | null> {
  const mm = getMemoryManager()

  switch (name) {
    case 'memory_search': {
      const query = args.query as string
      const type = args.type as MemoryType | undefined
      const tags = args.tags as string[] | undefined
      const limit = Math.min((args.limit as number) ?? 10, 20)

      // 确保已初始化
      await mm.init()

      const results = mm.searchMemories(query, { type, tags, limit })

      if (results.length === 0) {
        return { success: true, output: `未找到与 "${query}" 相关的记忆` }
      }

      const lines = results.map((m, i) => {
        const typeLabel = TYPE_LABELS[m.type] ?? m.type
        const tagsStr = m.tags.length > 0 ? ` [${m.tags.join(', ')}]` : ''
        const dateStr = m.updated.slice(0, 10)
        return `${i + 1}. **${m.title}** (ID: ${m.id})\n   类型: ${typeLabel} | 更新: ${dateStr} | 相关度: ${m.relevance}${tagsStr}\n   ${m.content.slice(0, 150)}`
      })

      return {
        success: true,
        output: `找到 ${results.length} 条相关记忆：\n\n${lines.join('\n\n')}`,
      }
    }

    case 'memory_add': {
      const title = args.title as string
      const content = args.content as string
      const type = (args.type as MemoryType) || 'project'
      const tags = (args.tags as string[]) ?? []
      const source = (args.source as string) ?? 'agent'

      if (!title || !content) {
        return { success: false, output: '添加记忆需要提供 title 和 content' }
      }

      const entry = await mm.addMemory({ title, content, type, tags, source })
      return {
        success: true,
        output: `记忆已添加成功。\nID: ${entry.id}\n标题: ${entry.title}\n类型: ${TYPE_LABELS[entry.type] ?? entry.type}`,
      }
    }

    case 'memory_update': {
      const id = args.id as string
      if (!id) {
        return { success: false, output: '更新记忆需要提供 id' }
      }

      const patch: Record<string, unknown> = {}
      if (args.title !== undefined) patch.title = args.title
      if (args.content !== undefined) patch.content = args.content
      if (args.type !== undefined) patch.type = args.type
      if (args.tags !== undefined) patch.tags = args.tags

      const updated = await mm.updateMemory(id, patch)
      if (!updated) {
        return { success: false, output: `未找到 ID 为 ${id} 的记忆` }
      }

      return {
        success: true,
        output: `记忆已更新成功。\nID: ${updated.id}\n标题: ${updated.title}\n更新时间: ${updated.updated}`,
      }
    }

    case 'memory_delete': {
      const id = args.id as string
      if (!id) {
        return { success: false, output: '删除记忆需要提供 id' }
      }

      const ok = await mm.deleteMemory(id)
      if (!ok) {
        return { success: false, output: `未找到 ID 为 ${id} 的记忆` }
      }

      return { success: true, output: `记忆 ${id} 已删除` }
    }

    default:
      return null
  }
}

// ─── 常量 ──────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  user: '用户偏好',
  feedback: '反馈',
  project: '项目知识',
  reference: '参考资料',
}
