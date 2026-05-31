/**
 * 反馈相关 API
 *
 * 用法:
 *   import { feedbackApi } from '@/api'
 *   const result = await feedbackApi.submit({ text: '...', email: '...', images: [] })
 */

import { post } from '@/utils/request'
import { USE_MOCK } from '@/mock'
import {
  mockSubmitFeedback,
  type FeedbackParams,
  type FeedbackResult,
} from '@/mock/feedback'

// ======================== 类型导出 ========================

export type { FeedbackParams, FeedbackResult }

// ======================== API ========================

const feedbackApi = {
  /** 提交问题反馈 */
  async submit(params: FeedbackParams): Promise<FeedbackResult> {
    if (USE_MOCK) {
      return mockSubmitFeedback(params)
    }
    return post<FeedbackResult>('/api/feedback', params)
  },
}

export default feedbackApi
