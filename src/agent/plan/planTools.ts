/**
 * 计划管理工具 — 提供 CRUD 操作来管理执行计划。
 *
 * 这些工具在 Plan-Execute 模式下注入到 ReAct Agent 中，
 * 允许 Agent 在执行过程中更新计划项的状态。
 */

import type { ToolDefinition } from '../llm/llmClient'
import type { ToolResult } from '../core/reactAgent'
import type { PlanItem, PlanItemStatus } from '../../types/task'

// ─── 计划上下文 ──────────────────────────────────────────────

/** 计划上下文 — 持有计划项的可变引用和更新回调 */
export interface PlanContext {
  /** 当前计划项列表（可变） */
  planItems: PlanItem[]
  /** 计划项更新时触发的回调（传递被修改的单个项） */
  onUpdate: (updatedItem: PlanItem) => void
  /** 计划项被移除时的回调 */
  onRemove?: (removedItemId: string) => void
}

// ─── 工具定义 ────────────────────────────────────────────────

/** 构建计划管理工具的定义列表 */
export function buildPlanToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'update_plan_item',
        description:
          '更新计划项的状态。在开始执行某个步骤时调用，状态设为 "in_progress"；完成时设为 "completed"；失败时设为 "failed"。' +
          '\n\n支持一次性完成"结束当前项 + 开始下一项"：传入 next_item_id 参数，系统会自动将下一个计划项状态设为 next_status（默认 "in_progress"）。' +
          '这样只需一次调用即可完成切换，无需调用两次。',
        parameters: {
          type: 'object',
          properties: {
            item_id: {
              type: 'string',
              description: '要更新的计划项 ID',
            },
            status: {
              type: 'string',
              enum: ['in_progress', 'completed', 'failed'],
              description: '新的状态',
            },
            next_item_id: {
              type: 'string',
              description: '（可选）下一个要启动的计划项 ID。传入后会自动将其状态设为 next_status。支持精确 ID、序号或标题关键词匹配。',
            },
            next_status: {
              type: 'string',
              enum: ['in_progress', 'completed', 'failed'],
              description: '（可选）下一个计划项的目标状态，默认 "in_progress"。仅在传入 next_item_id 时生效。',
            },
          },
          required: ['item_id', 'status'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'add_plan_item',
        description: '向计划中添加新的步骤。当在执行过程中发现需要额外的步骤时使用。',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: '步骤标题',
            },
            description: {
              type: 'string',
              description: '步骤描述（可选）',
            },
            after_item_id: {
              type: 'string',
              description: '在此项之后插入（可选，默认追加到末尾）',
            },
          },
          required: ['title'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'remove_plan_item',
        description: '从计划中移除某个步骤。当某个步骤不再需要时使用。',
        parameters: {
          type: 'object',
          properties: {
            item_id: {
              type: 'string',
              description: '要移除的计划项 ID',
            },
          },
          required: ['item_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_plan',
        description: '获取当前的执行计划列表，包括每个步骤的 ID、标题和状态。',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
  ]
}

// ─── 工具执行 ────────────────────────────────────────────────

/**
 * 执行计划管理工具。
 * 返回 null 如果工具名不匹配（由其他执行器处理）。
 */
export function executePlanTool(
  name: string,
  args: Record<string, unknown>,
  context: PlanContext,
): ToolResult | null {
  switch (name) {
    case 'update_plan_item':
      return handleUpdatePlanItem(args, context)
    case 'add_plan_item':
      return handleAddPlanItem(args, context)
    case 'remove_plan_item':
      return handleRemovePlanItem(args, context)
    case 'get_plan':
      return handleGetPlan(context)
    default:
      return null
  }
}

// ─── 工具处理函数 ────────────────────────────────────────────

function handleUpdatePlanItem(
  args: Record<string, unknown>,
  context: PlanContext,
): ToolResult {
  const rawId = args.item_id as string
  const status = args.status as PlanItemStatus
  const nextRawId = args.next_item_id as string | undefined
  const nextStatus = (args.next_status as PlanItemStatus) || 'in_progress'

  if (!rawId) {
    return { success: false, output: '缺少 item_id 参数，请先调用 get_plan 查看计划项 ID' }
  }

  // ── 解析当前计划项 ──
  let item = context.planItems.find(i => i.id === rawId)

  // 模糊匹配：LLM 有时会传序号（如 "1"）而非真实 ID
  if (!item) {
    const numId = parseInt(rawId, 10)
    if (!isNaN(numId) && numId >= 1 && numId <= context.planItems.length) {
      item = context.planItems[numId - 1] // 序号从 1 开始
    }
  }

  // 模糊匹配：按标题关键词查找
  if (!item) {
    const lower = rawId.toLowerCase()
    item = context.planItems.find(i =>
      i.title.toLowerCase().includes(lower) || i.id.toLowerCase().includes(lower),
    )
  }

  if (!item) {
    const ids = context.planItems.map(i => `  - ${i.id}: ${i.title}`).join('\n')
    return {
      success: false,
      output: `未找到 ID 为 "${rawId}" 的计划项。当前可用的计划项:\n${ids}\n请使用上述 ID 重试。`,
    }
  }

  const validStatuses: PlanItemStatus[] = ['in_progress', 'completed', 'failed']
  if (!validStatuses.includes(status)) {
    return { success: false, output: `无效的状态: ${status}，有效值为: ${validStatuses.join(', ')}` }
  }

  // ── 更新当前计划项 ──
  item.status = status
  context.onUpdate(item)

  const statusLabel = status === 'completed' ? '已完成'
    : status === 'in_progress' ? '进行中'
    : '已失败'

  let output = `计划项 "${item.title}" 状态已更新为: ${statusLabel}`

  // ── 处理 next_item_id（一次性完成"结束当前 + 开始下一项"） ──
  if (nextRawId) {
    let nextItem = context.planItems.find(i => i.id === nextRawId)

    // 模糊匹配：序号
    if (!nextItem) {
      const numId = parseInt(nextRawId, 10)
      if (!isNaN(numId) && numId >= 1 && numId <= context.planItems.length) {
        nextItem = context.planItems[numId - 1]
      }
    }

    // 模糊匹配：标题关键词
    if (!nextItem) {
      const lower = nextRawId.toLowerCase()
      nextItem = context.planItems.find(i =>
        i.title.toLowerCase().includes(lower) || i.id.toLowerCase().includes(lower),
      )
    }

    if (nextItem) {
      if (!validStatuses.includes(nextStatus)) {
        output += `\n⚠ 无效的 next_status: ${nextStatus}，跳过下一项更新`
      } else {
        nextItem.status = nextStatus
        context.onUpdate(nextItem)
        const nextStatusLabel = nextStatus === 'completed' ? '已完成'
          : nextStatus === 'in_progress' ? '进行中'
          : '已失败'
        output += `\n计划项 "${nextItem.title}" 状态已更新为: ${nextStatusLabel}`
      }
    } else {
      const ids = context.planItems.map(i => `  - ${i.id}: ${i.title}`).join('\n')
      output += `\n⚠ 未找到 next_item_id "${nextRawId}" 对应的计划项。当前计划项:\n${ids}`
    }
  }

  return { success: true, output }
}

function handleAddPlanItem(
  args: Record<string, unknown>,
  context: PlanContext,
): ToolResult {
  const title = args.title as string
  const description = args.description as string | undefined
  const afterItemId = args.after_item_id as string | undefined

  if (!title) {
    return { success: false, output: '缺少 title 参数' }
  }

  const newItem: PlanItem = {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    description,
    status: 'pending',
    order: context.planItems.length,
  }

  if (afterItemId) {
    // 精确匹配 + 序号匹配
    let afterIndex = context.planItems.findIndex(i => i.id === afterItemId)
    if (afterIndex < 0) {
      const numId = parseInt(afterItemId, 10)
      if (!isNaN(numId) && numId >= 1 && numId <= context.planItems.length) {
        afterIndex = numId - 1
      }
    }
    if (afterIndex >= 0) {
      context.planItems.splice(afterIndex + 1, 0, newItem)
      // 重新排序
      context.planItems.forEach((item, idx) => { item.order = idx })
    } else {
      context.planItems.push(newItem)
    }
  } else {
    context.planItems.push(newItem)
  }

  context.onUpdate(newItem)

  return {
    success: true,
    output: `已添加计划项: "${title}" (ID: ${newItem.id})`,
  }
}

function handleRemovePlanItem(
  args: Record<string, unknown>,
  context: PlanContext,
): ToolResult {
  const rawId = args.item_id as string

  if (!rawId) {
    return { success: false, output: '缺少 item_id 参数，请先调用 get_plan 查看计划项 ID' }
  }

  // 精确匹配
  let index = context.planItems.findIndex(i => i.id === rawId)

  // 模糊匹配：序号
  if (index < 0) {
    const numId = parseInt(rawId, 10)
    if (!isNaN(numId) && numId >= 1 && numId <= context.planItems.length) {
      index = numId - 1
    }
  }

  // 模糊匹配：标题关键词
  if (index < 0) {
    const lower = rawId.toLowerCase()
    index = context.planItems.findIndex(i =>
      i.title.toLowerCase().includes(lower) || i.id.toLowerCase().includes(lower),
    )
  }

  if (index < 0) {
    const ids = context.planItems.map(i => `  - ${i.id}: ${i.title}`).join('\n')
    return {
      success: false,
      output: `未找到 ID 为 "${rawId}" 的计划项。当前可用的计划项:\n${ids}\n请使用上述 ID 重试。`,
    }
  }

  const removed = context.planItems.splice(index, 1)[0]
  // 重新排序
  context.planItems.forEach((item, idx) => { item.order = idx })

  // 通知移除
  if (context.onRemove) context.onRemove(removed.id)

  return {
    success: true,
    output: `已移除计划项: "${removed.title}"`,
  }
}

function handleGetPlan(context: PlanContext): ToolResult {
  if (context.planItems.length === 0) {
    return { success: true, output: '当前没有执行计划' }
  }

  const lines = context.planItems.map(item => {
    const statusIcon = item.status === 'completed' ? '[✓]'
      : item.status === 'in_progress' ? '[→]'
      : item.status === 'failed' ? '[✗]'
      : '[ ]'
    const desc = item.description ? ` - ${item.description}` : ''
    return `${item.order + 1}. ${statusIcon} ${item.title}${desc} (ID: ${item.id})`
  })

  return {
    success: true,
    output: '当前执行计划:\n' + lines.join('\n'),
  }
}
