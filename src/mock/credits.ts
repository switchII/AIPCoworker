/**
 * Mock — 积分相关模拟数据
 */

import { delay } from './index'

// ======================== 类型定义（与 API 层保持一致） ========================

export interface CreditsRow {
  name: string
  total: number
  used: number
  renew?: string
}

// ======================== Mock 数据 ========================

const mockCreditsData: CreditsRow[] = [
  { name: '套餐内 Credits', total: 6000, used: 4137, renew: '2026年6月22日 续期' },
  { name: '附加 Credits', total: 1000, used: 1000 },
]

// ======================== Mock 函数 ========================

/**
 * 模拟获取积分列表
 */
export async function mockGetCredits(): Promise<CreditsRow[]> {
  await delay()
  // 返回一份拷贝，避免外部修改影响 mock 数据
  return JSON.parse(JSON.stringify(mockCreditsData))
}
