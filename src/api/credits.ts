/**
 * 积分相关 API
 *
 * 用法:
 *   import { creditsApi } from '@/api'
 *   const rows = await creditsApi.getCredits()
 */

import { get } from '@/utils/request'
import { USE_MOCK } from '@/mock'
import { mockGetCredits, type CreditsRow } from '@/mock/credits'

// ======================== 类型导出 ========================

export type { CreditsRow }

// ======================== API ========================

const creditsApi = {
  /** 获取积分列表 */
  async getCredits(): Promise<CreditsRow[]> {
    if (USE_MOCK) {
      return mockGetCredits()
    }
    return get<CreditsRow[]>('/api/credits')
  },
}

export default creditsApi
