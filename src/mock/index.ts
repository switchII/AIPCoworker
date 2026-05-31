/**
 * Mock 拦截器 — 统一管理 mock 开关
 *
 * 在开发阶段，将 USE_MOCK 设为 true，所有 API 调用会走 mock 逻辑。
 * 接入真实后端后，设为 false 即可。
 */

/** 是否启用 mock（true = 使用模拟数据，false = 调用真实后端） */
export const USE_MOCK = true

/** 模拟网络延迟（毫秒） */
export const MOCK_DELAY = 300

/**
 * 模拟延迟的辅助函数
 */
export function delay(ms: number = MOCK_DELAY): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
