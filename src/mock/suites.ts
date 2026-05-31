/**
 * Mock — 专家套件模拟数据
 */

import { delay } from './index'

// ======================== 类型定义（与 API 层保持一致） ========================

export interface ExpertSuiteManifest {
  id: string
  name: string
  description: string
  icon: string
  /** 套件包含的技能 ID 列表 */
  skillIds: string[]
  installed: boolean
  createdAt: number
}

// ======================== Mock 数据 ========================

const mockSuites: ExpertSuiteManifest[] = [
  {
    id: 'fullstack-dev',
    name: '全栈开发助手',
    description: '集成代码编写、执行、版本控制和文档生成能力，一站式支持前端、后端和数据库开发全流程',
    icon: 'fa-solid fa-laptop-code',
    skillIds: ['code-executor', 'file-manager', 'git-workflow', 'html-page-generator'],
    installed: true,
    createdAt: Date.now() - 86400000 * 30, // 30 天前
  },
  {
    id: 'data-analyst',
    name: '数据分析专家',
    description: '自动读取数据文件，执行统计分析，生成可视化图表和分析报告，支持 Python/R 脚本',
    icon: 'fa-solid fa-chart-line',
    skillIds: ['data-analysis', 'code-executor', 'file-manager', 'document-generator'],
    installed: true,
    createdAt: Date.now() - 86400000 * 20, // 20 天前
  },
  {
    id: 'content-creator',
    name: '内容创作套件',
    description: '从调研到撰写到排版，支持文章、报告、PPT 等多种内容形式的全流程创作',
    icon: 'fa-solid fa-pen-nib',
    skillIds: ['web-search', 'document-generator', 'ppt-generator', 'image-search'],
    installed: false,
    createdAt: Date.now() - 86400000 * 15, // 15 天前
  },
  {
    id: 'devops-toolkit',
    name: 'DevOps 工具箱',
    description: '服务器管理、日志分析、自动化脚本执行，配合 MCP 连接生产环境进行运维操作',
    icon: 'fa-solid fa-server',
    skillIds: ['code-executor', 'file-manager', 'mcp-integration', 'git-workflow'],
    installed: false,
    createdAt: Date.now() - 86400000 * 10, // 10 天前
  },
  {
    id: 'office-productivity',
    name: '办公效率套件',
    description: '快速生成周报、会议纪要、邮件和 PPT，自动整理工作内容，提升日常办公效率',
    icon: 'fa-solid fa-briefcase',
    skillIds: ['ai-report-writer', 'ai-meeting-summary', 'email-drafter', 'ppt-generator'],
    installed: true,
    createdAt: Date.now() - 86400000 * 7, // 7 天前
  },
  {
    id: 'research-assistant',
    name: '学术研究助手',
    description: '文献检索、资料整理、论文撰写辅助，支持多语言学术资源搜索和引用管理',
    icon: 'fa-solid fa-graduation-cap',
    skillIds: ['web-search', 'document-generator', 'file-manager', 'data-analysis'],
    installed: false,
    createdAt: Date.now() - 86400000 * 3, // 3 天前
  },
]

// ======================== Mock 函数 ========================

/** 获取所有专家套件 */
export async function mockGetSuites(): Promise<ExpertSuiteManifest[]> {
  await delay(250)
  return JSON.parse(JSON.stringify(mockSuites))
}

/** 安装/卸载套件 */
export async function mockToggleSuiteInstall(suiteId: string, install: boolean): Promise<void> {
  await delay(300)
  const suite = mockSuites.find(s => s.id === suiteId)
  if (suite) {
    suite.installed = install
  }
  console.log(`[Mock] ${install ? '安装' : '卸载'}套件: ${suiteId}`)
}

/** 删除套件 */
export async function mockDeleteSuite(suiteId: string): Promise<void> {
  await delay(200)
  const idx = mockSuites.findIndex(s => s.id === suiteId)
  if (idx !== -1) mockSuites.splice(idx, 1)
  console.log(`[Mock] 删除套件: ${suiteId}`)
}
