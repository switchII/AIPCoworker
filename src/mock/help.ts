/**
 * Mock — 帮助信息模拟数据
 */

import { delay } from './index'

// ======================== 类型定义 ========================

export interface HelpFeature {
  icon: string
  label: string
  desc: string
}

export interface HelpLink {
  label: string
  url: string
  icon: string
}

export interface HelpInfo {
  title: string
  desc: string
  features: HelpFeature[]
  links: HelpLink[]
  version: string
}

// ======================== Mock 数据 ========================

const mockHelpData: HelpInfo = {
  title: 'AIPCowork 帮助',
  desc: 'AIPCowork 是一款 AI 驱动的协同办公助手，可帮助您自动化日常工作任务、分析数据并生成报告。',
  features: [
    { icon: 'fa-solid fa-bolt', label: '智能任务执行', desc: '自然语言描述即可完成复杂操作' },
    { icon: 'fa-solid fa-brain', label: '深度思考', desc: '多步推理，逐步拆解任务' },
    { icon: 'fa-solid fa-file-export', label: '成果输出', desc: '自动生成文件、报告、脚本等' },
  ],
  links: [
    { label: '使用文档', url: 'https://docs.aipcowork.com', icon: 'fa-solid fa-book' },
    { label: '常见问题', url: 'https://docs.aipcowork.com/faq', icon: 'fa-solid fa-circle-question' },
    { label: '快捷键一览', url: 'https://docs.aipcowork.com/shortcuts', icon: 'fa-solid fa-keyboard' },
    { label: '联系支持', url: 'https://support.aipcowork.com', icon: 'fa-solid fa-headset' },
  ],
  version: 'v1.6.0 Lite',
}

// ======================== Mock 函数 ========================

/**
 * 模拟获取帮助信息
 */
export async function mockGetHelpInfo(): Promise<HelpInfo> {
  await delay()
  return JSON.parse(JSON.stringify(mockHelpData))
}
