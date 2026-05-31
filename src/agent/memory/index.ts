/**
 * 记忆模块 — 统一导出
 *
 * 提供 Agent 运行时的记忆能力：
 *   - MemoryManager: 核心管理器（CRUD、搜索、提示词注入）
 *   - 记忆工具: memory_search / memory_add / memory_update / memory_delete
 *
 * 使用方式：
 *   import { getMemoryManager, buildMemoryToolDefinitions, executeMemoryTool } from '@/agent/memory'
 */

export { MemoryManager, getMemoryManager } from './memoryManager'
export type { DynamicMemoryEntry } from './memoryManager'
export { buildMemoryToolDefinitions, executeMemoryTool } from './memoryTools'
