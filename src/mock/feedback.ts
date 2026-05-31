/**
 * Mock — 反馈相关模拟数据
 */

import { delay } from './index'

// ======================== 类型定义（与 API 层保持一致） ========================

export interface FeedbackParams {
  text: string
  email: string
  images: string[]
}

export interface FeedbackResult {
  id: string
  status: 'received'
  message: string
}

// ======================== Mock 函数 ========================

/** 自增 ID 计数器 */
let feedbackCounter = 1000

/**
 * 模拟提交反馈
 */
export async function mockSubmitFeedback(params: FeedbackParams): Promise<FeedbackResult> {
  await delay(500) // 反馈提交稍慢一些

  // 简单校验
  if (!params.text || params.text.trim().length === 0) {
    throw new Error('反馈内容不能为空')
  }

  feedbackCounter++
  console.log('[Mock] 收到反馈:', params)

  return {
    id: `FB-${feedbackCounter}`,
    status: 'received',
    message: '感谢您的反馈！我们会尽快处理。',
  }
}
