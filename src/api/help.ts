/**
 * 帮助信息 API
 *
 * 用法:
 *   import { helpApi } from '@/api'
 *   const info = await helpApi.getInfo()
 */

import { get } from '@/utils/request'
import { USE_MOCK } from '@/mock'
import { mockGetHelpInfo, type HelpInfo } from '@/mock/help'

// ======================== 类型导出 ========================

export type { HelpInfo, HelpFeature, HelpLink } from '@/mock/help'

// ======================== API ========================

const helpApi = {
  /** 获取帮助信息 */
  async getInfo(): Promise<HelpInfo> {
    if (USE_MOCK) {
      return mockGetHelpInfo()
    }
    return get<HelpInfo>('/api/help/info')
  },
}

export default helpApi
