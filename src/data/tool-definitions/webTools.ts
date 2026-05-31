/**
 * 网络操作类工具定义
 * 包含：HTTP 请求（http_fetch）
 * 
 * 提供网络请求能力，支持 GET/POST/PUT/DELETE/PATCH 方法，
 * 可自动将 HTML 页面正文提取为干净的 Markdown 格式。
 */
import type { ToolDefinition } from '../../agent/llm/llmClient'

export const httpFetchTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'http_fetch',
    description:
      '发送 HTTP 请求到任意 URL。支持 GET/POST/PUT/DELETE/PATCH 方法。' +
      '比通过 run_command 执行 curl 更可靠且跨平台。返回 HTTP 状态码和响应内容。' +
      '当读取网页文章时，使用 extract="article" 自动提取正文，大幅减少噪音和 token 消耗。',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '要请求的 URL',
        },
        method: {
          type: 'string',
          description: 'HTTP 方法：GET, POST, PUT, DELETE, PATCH（默认 GET）',
        },
        headers: {
          type: 'object',
          description: '可选的 HTTP 请求头，键值对形式',
        },
        body: {
          type: 'string',
          description: '可选的请求体（用于 POST/PUT/PATCH）',
        },
        extract: {
          type: 'string',
          enum: ['raw', 'article'],
          description:
            '响应提取模式。"article"：提取主要内容为干净的 Markdown（推荐用于网页/文章）。' +
            '"raw"：返回原始响应（用于 API、数据或需要完整页面结构时）。HTML 响应默认为 "article"。',
        },
      },
      required: ['url'],
    },
  },
}

export const webTools = [httpFetchTool]
