/**
 * 工作空间路径工具 — 统一管理默认工作目录
 *
 * 默认工作目录: ~/AipWorkspace
 * 当用户未选择工作目录时，所有任务都使用此默认路径。
 *
 * 用法:
 *   import { DEFAULT_WORKSPACE_DIR, resolveWorkDir } from '@/utils/workspace'
 *   const dir = await resolveWorkDir('')  // 返回 ~/AipWorkspace 的绝对路径
 */

/** 默认工作目录名称（相对于用户 home） */
export const DEFAULT_WORKSPACE_DIR = '~/AipWorkspace'

/** 缓存的已解析路径，避免重复调用 Tauri */
let cachedResolvedPath: string | null = null

/**
 * 解析工作目录：如果传入有效路径则直接返回，否则返回默认工作空间路径。
 * 首次调用时会通过 Tauri 获取绝对路径并自动创建目录（如不存在）。
 *
 * @param dir 用户选择的工作目录，可能为空字符串或 ~/AipWorkspace
 * @returns 最终使用的绝对路径
 */
export async function resolveWorkDir(dir: string): Promise<string> {
  const trimmed = dir?.trim()
  // 空路径 或 就是默认工作空间标识 → 使用默认路径
  if (!trimmed || trimmed === DEFAULT_WORKSPACE_DIR) {
    if (cachedResolvedPath) return cachedResolvedPath

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const resolved = await invoke<string>('get_default_workspace_path')
      cachedResolvedPath = resolved
      return resolved
    } catch (e) {
      console.warn('[workspace] 获取默认工作空间失败，使用回退路径:', e)
      return DEFAULT_WORKSPACE_DIR.replace('~', getHomeFallback())
    }
  }

  // 处理 ~ 开头的路径（如 ~/Documents）
  if (trimmed.startsWith('~/')) {
    return trimmed.replace('~', getHomeFallback())
  }

  return trimmed
}

/** 清除缓存（用于测试或路径变更场景） */
export function clearWorkspaceCache() {
  cachedResolvedPath = null
}

/** 回退获取 home 目录（仅在 Tauri 不可用时使用） */
function getHomeFallback(): string {
  // 在浏览器环境中无法获取真实 home，使用占位符
  return typeof process !== 'undefined' && process.env?.HOME
    ? process.env.HOME
    : '/Users'
}
