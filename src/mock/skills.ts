/**
 * Mock — 技能市场模拟数据
 */

import { delay } from './index'

// ======================== 类型定义（与 API 层保持一致） ========================

export interface SkillManifest {
  id: string
  name: string
  description: string
  icon?: string
  version?: string
  author?: string
  license?: string
  homepage?: string
  tags?: string[]
  platforms?: string[]
  category?: string
  /** SKILL.md body content (for create API) */
  content?: string
}

// ======================== Mock 数据 ========================

/** 内置技能 */
const mockBuiltinSkills: SkillManifest[] = [
  {
    id: 'web-search',
    name: '网页搜索',
    description: '通过网络搜索获取实时信息，支持 Google、Bing、DuckDuckGo 等搜索引擎',
    icon: 'fa-solid fa-magnifying-glass',
    version: '1.0.0',
    author: 'AIPCowork',
    license: 'MIT',
    tags: ['搜索', '网络'],
    category: '搜索',
  },
  {
    id: 'file-manager',
    name: '文件管理',
    description: '读取、写入、搜索、复制、移动、删除本地文件，支持文本和二进制文件',
    icon: 'fa-solid fa-folder-open',
    version: '1.0.0',
    author: 'AIPCowork',
    license: 'MIT',
    tags: ['文件', '本地'],
    category: '工具',
  },
  {
    id: 'code-executor',
    name: '代码执行',
    description: '在本地运行 Python、Node.js、Shell 脚本，支持多语言代码执行和结果捕获',
    icon: 'fa-solid fa-terminal',
    version: '1.0.0',
    author: 'AIPCowork',
    license: 'MIT',
    tags: ['代码', '执行'],
    category: '开发',
  },
  {
    id: 'html-page-generator',
    name: 'HTML 页面生成',
    description: '生成完整的 HTML 页面，支持响应式布局、Tailwind CSS 和交互组件',
    icon: 'fa-solid fa-code',
    version: '1.0.0',
    author: 'AIPCowork',
    license: 'MIT',
    tags: ['生成', 'HTML'],
    category: '生成',
  },
  {
    id: 'document-generator',
    name: '文档生成',
    description: '生成 Markdown、TXT、PDF 等格式的专业文档，支持模板和自定义样式',
    icon: 'fa-solid fa-file-lines',
    version: '1.0.0',
    author: 'AIPCowork',
    license: 'MIT',
    tags: ['生成', '文档'],
    category: '生成',
  },
  {
    id: 'mcp-integration',
    name: 'MCP 集成',
    description: '通过 Model Context Protocol 连接外部工具服务器，扩展 AI 的能力边界',
    icon: 'fa-solid fa-plug',
    version: '1.0.0',
    author: 'AIPCowork',
    license: 'MIT',
    tags: ['集成', '协议'],
    category: '集成',
  },
  {
    id: 'plan-execute',
    name: 'Plan-Execute 规划',
    description: '将复杂任务自动拆解为多步骤计划，实时追踪执行进度并可视化展示',
    icon: 'fa-solid fa-list-check',
    version: '1.0.0',
    author: 'AIPCowork',
    license: 'MIT',
    tags: ['规划', '执行'],
    category: '规划',
  },
  {
    id: 'context-compressor',
    name: '上下文压缩',
    description: '智能压缩超长对话历史，保持关键信息不丢失，支持多轮长对话',
    icon: 'fa-solid fa-compress',
    version: '1.0.0',
    author: 'AIPCowork',
    license: 'MIT',
    tags: ['优化', '上下文'],
    category: '工具',
  },
]

/** 技能商店（API 返回的未安装技能列表） */
const mockMarketplaceSkills: SkillManifest[] = [
  {
    id: 'data-analysis',
    name: '数据分析助手',
    description: '自动分析 CSV、Excel、JSON 数据，生成统计报表和可视化图表',
    icon: 'fa-solid fa-chart-pie',
    version: '2.1.0',
    author: 'community',
    license: 'Apache-2.0',
    tags: ['数据', '分析'],
    category: '数据',
  },
  {
    id: 'git-workflow',
    name: 'Git 工作流助手',
    description: '自动化 Git 操作：分支管理、PR 创建、代码审查、合并冲突解决',
    icon: 'fa-brands fa-git-alt',
    version: '1.3.2',
    author: 'devtools',
    license: 'MIT',
    tags: ['Git', '开发'],
    category: '开发',
  },
  {
    id: 'email-drafter',
    name: '邮件撰写助手',
    description: '根据场景快速撰写专业邮件，支持中英文、正式/非正式等多种风格',
    icon: 'fa-solid fa-envelope',
    version: '1.0.5',
    author: 'office-tools',
    license: 'MIT',
    tags: ['邮件', '办公'],
    category: '办公',
  },
  {
    id: 'ppt-generator',
    name: 'PPT 生成器',
    description: '根据主题自动生成专业 PPT，支持多种模板、配色方案和内容布局',
    icon: 'fa-solid fa-file-powerpoint',
    version: '1.2.0',
    author: 'office-tools',
    license: 'MIT',
    tags: ['PPT', '办公'],
    category: '办公',
  },
  {
    id: 'image-search',
    name: '图片搜索',
    description: '搜索网络图片资源，支持关键词搜索、尺寸筛选和版权过滤',
    icon: 'fa-solid fa-image',
    version: '1.0.0',
    author: 'community',
    license: 'MIT',
    tags: ['图片', '搜索'],
    category: '搜索',
  },
  {
    id: 'infographic-maker',
    name: '信息图生成',
    description: '将数据可视化为精美的信息图、仪表盘和图表',
    icon: 'fa-solid fa-chart-bar',
    version: '1.0.0',
    author: 'community',
    license: 'MIT',
    tags: ['图表', '可视化'],
    category: '生成',
  },
  {
    id: 'api-tester',
    name: 'API 测试助手',
    description: '快速测试 REST/GraphQL API，自动生成文档和测试用例',
    icon: 'fa-solid fa-vial',
    version: '1.1.0',
    author: 'devtools',
    license: 'MIT',
    tags: ['API', '测试'],
    category: '开发',
  },
]

/** AI 创建的技能 */
const mockAiSkills: SkillManifest[] = [
  {
    id: 'ai-report-writer',
    name: '周报自动生成',
    description: '根据本周的工作记录自动生成周报，包含完成事项、进行中任务和下周计划',
    icon: 'fa-solid fa-robot',
    version: '1.0.0',
    author: 'AI Generated',
    tags: ['周报', '自动化'],
    category: '办公',
  },
  {
    id: 'ai-code-reviewer',
    name: '代码审查助手',
    description: '自动审查代码质量，检查潜在 Bug、安全漏洞、性能问题和代码规范',
    icon: 'fa-solid fa-robot',
    version: '1.0.0',
    author: 'AI Generated',
    tags: ['代码', '审查'],
    category: '开发',
  },
  {
    id: 'ai-meeting-summary',
    name: '会议纪要生成',
    description: '将会议录音或文本转录自动生成结构化会议纪要，包含决策、行动项和责任人',
    icon: 'fa-solid fa-robot',
    version: '1.0.0',
    author: 'AI Generated',
    tags: ['会议', '纪要'],
    category: '办公',
  },
]

// ======================== Mock 函数 ========================

/** 获取本地内置技能列表（模拟 ~/.aipcowork/skills/builtin） */
export async function mockGetLocalBuiltinSkills(): Promise<SkillManifest[]> {
  await delay(200)
  return JSON.parse(JSON.stringify(mockBuiltinSkills))
}

/** 获取本地用户已安装技能列表（模拟 ~/.aipcowork/skills/user） */
export async function mockGetLocalUserSkills(): Promise<SkillManifest[]> {
  await delay(150)
  // 用户安装的技能：模拟从本地文件系统读取
  // 这里返回 marketplace 中的部分技能（模拟已安装的）
  return JSON.parse(JSON.stringify(mockMarketplaceSkills.slice(0, 3)))
}

/** 获取本地 AI 创建的技能列表（模拟 ~/.aipcowork/skills/ai） */
export async function mockGetLocalAiSkills(): Promise<SkillManifest[]> {
  await delay(100)
  return JSON.parse(JSON.stringify(mockAiSkills))
}

/** 获取技能商店列表（模拟 API 接口返回的所有可用技能） */
export async function mockGetMarketplaceSkills(): Promise<SkillManifest[]> {
  await delay(300)
  return JSON.parse(JSON.stringify(mockMarketplaceSkills))
}

/** 创建技能 */
export async function mockCreateSkill(data: SkillManifest): Promise<{ success: boolean; message: string }> {
  await delay(500)
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(data.id)) {
    return { success: false, message: `技能 ID 格式无效: "${data.id}"` }
  }
  const exists = [...mockBuiltinSkills, ...mockMarketplaceSkills, ...mockAiSkills].some(s => s.id === data.id)
  if (exists) {
    return { success: false, message: `技能 "${data.id}" 已存在` }
  }
  mockAiSkills.push({ ...data })
  console.log(`[Mock] 创建技能: ${data.name} (${data.id})`)
  return { success: true, message: `技能 "${data.name}" 创建成功` }
}

/** 安装技能（从商店安装到 ~/.aipcowork/skills/user） */
export async function mockInstallSkill(skillId: string): Promise<void> {
  await delay(400)
  console.log(`[Mock] 安装技能: ${skillId}`)
}

/** 卸载技能（从 ~/.aipcowork/skills/user 删除） */
export async function mockUninstallSkill(skillId: string): Promise<void> {
  await delay(400)
  console.log(`[Mock] 卸载技能: ${skillId}`)
}
