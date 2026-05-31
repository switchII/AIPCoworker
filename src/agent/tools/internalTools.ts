/**
 * 内置工具 — 定义与执行器。
 *
 * 内置工具是平台自带的基础能力，不依赖任何技能/插件，
 * 始终对 Agent 可用。包括文件系统操作、Shell 执行和网络搜索。
 *
 * 连接器工具（SSH / MySQL / PostgreSQL）仅当用户选择了对应连接器时
 * 才会被加载到工具列表中，其定义在 src/data/tool-definitions/connectorTools.ts，
 * 执行器在此文件中处理。
 *
 * 工具定义 JSON Schema 存放在 src/data/tool-definitions/ 目录下，
 * 执行器通过 Tauri 后端实现真实的文件系统 / Shell / 连接器操作。
 */

import { invoke } from '@tauri-apps/api/core'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import type { ToolDefinition } from '../llm/llmClient'
import type { ToolResult } from '../core/reactAgent'
import { buildAllInternalToolDefinitions, isConnectorToolName, parseConnectorToolName } from '../../data/tool-definitions'
import type { ConnectorConfig } from '../../types/integration'
import { DEFAULT_WORKSPACE_DIR } from '../../utils/workspace'

// ─── 工作目录安全 ────────────────────────────────────────────

/**
 * 将用户提供的路径解析为绝对路径，并确保它在工作目录内。
 * - 相对路径会相对于 workDir 解析
 * - 绝对路径会验证是否在 workDir 下
 * - 返回规范化后的绝对路径，或抛出错误
 */
function resolveInWorkDir(path: string, workDir: string): string {
  if (!path) {
    throw new Error('缺少 path 参数，请提供文件路径')
  }
  // 如果 workDir 为空，使用默认工作空间
  const effectiveWorkDir = workDir || DEFAULT_WORKSPACE_DIR
  if (!effectiveWorkDir) return path

  const normalized = path.replace(/\\/g, '/')
  const isAbsolute = /^[A-Za-z]:/.test(path) || path.startsWith('/')

  let resolved: string
  if (isAbsolute) {
    resolved = normalized
  } else {
    // 相对路径：拼接 effectiveWorkDir
    const wdNorm = effectiveWorkDir.replace(/\\/g, '/').replace(/\/$/, '')
    resolved = `${wdNorm}/${normalized}`
  }

  // 规范化路径（处理 .. 和 .）
  const parts = resolved.split('/')
  const stack: string[] = []
  let drivePrefix = ''
  for (const part of parts) {
    if (/^[A-Za-z]:$/.test(part)) {
      drivePrefix = part  // 保留 Windows 盘符
    } else if (part === '..') {
      stack.pop()
    } else if (part !== '.' && part !== '') {
      stack.push(part)
    }
  }

  // 重建路径
  resolved = drivePrefix ? `${drivePrefix}/${stack.join('/')}` : `/${stack.join('/')}`

  // 验证是否仍在 effectiveWorkDir 内
  const wdNorm = effectiveWorkDir.replace(/\\/g, '/').replace(/\/$/, '')
  const wdClean = wdNorm.toLowerCase()
  const resolvedLower = resolved.toLowerCase()

  if (!resolvedLower.startsWith(wdClean)) {
    throw new Error(
      `安全限制：路径 "${path}" 解析后超出了工作目录 "${effectiveWorkDir}"。` +
      `所有文件操作必须在工作目录内进行。`,
    )
  }

  return resolved
}

// ─── 工具定义 ──────────────────────────────────────────────

/**
 * 根据工作目录构建内置工具定义列表。
 * 这些定义会直接传递给 LLM，用于 function calling。
 *
 * 定义内容存放在 src/data/tool-definitions/ 目录下，按功能分类：
 * - fileOperations.ts: 文件操作（read_file, write_file, delete_path, copy_path, move_path）
 * - directoryTools.ts: 目录浏览（list_directory）
 * - searchTools.ts: 搜索工具（glob_search, ripgrep_search）
 * - shellTools.ts: Shell 命令（run_command）
 */
export function buildInternalToolDefinitions(workDir: string): ToolDefinition[] {
  return buildAllInternalToolDefinitions(workDir)
}

// ─── 工具执行器 ────────────────────────────────────────────

/**
 * 执行单个内置工具。
 * 通过 Tauri 后端执行真实的文件系统 / Shell 操作。
 *
 * @returns ToolResult，如果工具名称不属于内置工具则返回 null
 */
export async function executeInternalTool(
  name: string,
  args: Record<string, unknown>,
  workDir: string,
  connectorConfigs?: ConnectorConfig[],
): Promise<ToolResult | null> {
  // ─── 连接器工具（动态名称：{toolType}_{connectorId}）──────────
  if (isConnectorToolName(name)) {
    return executeConnectorTool(name, args, connectorConfigs)
  }

  switch (name) {
    case 'read_file': {
      const rawPath = args.path as string
      if (!rawPath) {
        return { success: false, output: '错误：缺少 path 参数。请提供要读取的文件路径。' }
      }
      const offset = args.offset as number | undefined
      const limit = args.limit as number | undefined
      try {
        // 将相对路径解析到工作目录下（与 write_file 保持一致）
        const path = resolveInWorkDir(rawPath, workDir)
        const content = await invoke<string>('agent_read_file', { path, offset, limit })
        return { success: true, output: content }
      } catch (e) {
        return { success: false, output: String(e) }
      }
    }
    case 'write_file': {
      const rawPath = args.path as string
      const content = args.content as string
      if (!rawPath) {
        return { success: false, output: '错误：缺少 path 参数。请提供要写入的文件路径。' }
      }
      if (content === undefined || content === null) {
        return { success: false, output: `错误：缺少 content 参数。请提供要写入文件 "${rawPath}" 的内容。` }
      }
      try {
        const path = resolveInWorkDir(rawPath, workDir)
        const result = await invoke<string>('agent_write_file', { path, content })
        return { success: true, output: result }
      } catch (e) {
        return { success: false, output: String(e) }
      }
    }
    case 'list_directory': {
      const rawPath = (args.path as string) || ''
      const path = rawPath ? resolveInWorkDir(rawPath, workDir) : (workDir || DEFAULT_WORKSPACE_DIR)
      try {
        const entries = await invoke<Array<{ name: string; type: string; size?: number }>>('agent_list_directory', { path })
        const lines = entries.map(e => {
          const sizeStr = e.size ? ` (${formatBytes(e.size)})` : ''
          const prefix = e.type === 'directory' ? '📁 ' : '📄 '
          return `${prefix}${e.name}${sizeStr}`
        })
        return { success: true, output: lines.join('\n') || '(空目录)' }
      } catch (e) {
        return { success: false, output: String(e) }
      }
    }
    case 'run_command': {
      const command = args.command as string
      try {
        const result = await invoke<{ output: string; new_files: { path: string; size: number }[] }>('agent_run_command', { command, workDir })
        return {
          success: true,
          output: result.output,
          newFiles: result.new_files,
        }
      } catch (e) {
        return { success: false, output: String(e) }
      }
    }
    case 'glob_search': {
      const pattern = args.pattern as string
      // 使用 LLM 指定的 path，如果没有则回退到 workDir
      const searchPath = (args.path as string) || workDir
      // 安全检查：禁止使用系统根目录
      if (isDangerousSearchPath(searchPath)) {
        return { success: false, output: `安全限制：禁止在系统根目录或危险路径下搜索。请使用具体的项目目录。当前路径: ${searchPath}` }
      }
      try {
        const results = await invoke<any[]>('agent_glob_search', { pattern, workDir: searchPath })
        if (results.length === 0) {
          return { success: true, output: `在 ${searchPath} 中没有找到匹配 "${pattern}" 的文件` }
        }
        const lines = results.map(r => {
          const icon = r.type === 'directory' ? '📁' : '📄'
          const size = r.size ? ` (${formatBytes(r.size)})` : ''
          return `${icon} ${r.path}${size}`
        })
        return {
          success: true,
          output: `在 ${searchPath} 中找到 ${results.length} 个匹配项：\n${lines.join('\n')}`
        }
      } catch (e) {
        return { success: false, output: String(e) }
      }
    }
    case 'ripgrep_search': {
      const pattern = args.pattern as string
      // 使用 LLM 指定的 path，如果没有则回退到 workDir
      const searchPath = (args.path as string) || workDir
      // 安全检查：禁止使用系统根目录
      if (isDangerousSearchPath(searchPath)) {
        return { success: false, output: `安全限制：禁止在系统根目录或危险路径下搜索。请使用具体的项目目录。当前路径: ${searchPath}` }
      }
      const include = args.include as string | undefined
      const caseSensitive = args.case_sensitive as boolean | undefined
      const contextLines = args.context_lines as number | undefined
      const maxResults = args.max_results as number | undefined
      try {
        const results = await invoke<any[]>('agent_ripgrep_search', {
          pattern,
          workDir: searchPath,
          include: include || undefined,
          caseSensitive: caseSensitive !== undefined ? caseSensitive : true,
          contextLines: contextLines || 2,
          maxResults: maxResults || 50,
        })
        if (results.length === 0) {
          return { success: true, output: `在 ${searchPath} 中没有找到匹配 "${pattern}" 的内容` }
        }
        const output = results.map(r => {
          let line = `${r.path}:${r.line_number}: ${r.line_content}`
          if (r.context_after && r.context_after.length > 0) {
            line += '\n' + r.context_after.map((c: string) => `  ${c}`).join('\n')
          }
          return line
        }).join('\n')
        return {
          success: true,
          output: `在 ${searchPath} 中找到 ${results.length} 个匹配项：\n${output}`
        }
      } catch (e) {
        return { success: false, output: String(e) }
      }
    }
    case 'delete_path': {
      const rawPath = args.path as string
      if (!rawPath) {
        return { success: false, output: '错误：缺少 path 参数。请提供要删除的文件或目录路径。' }
      }
      try {
        const path = resolveInWorkDir(rawPath, workDir)
        const result = await invoke<string>('agent_delete_path', { path })
        return { success: true, output: result }
      } catch (e) {
        return { success: false, output: String(e) }
      }
    }
    case 'copy_path': {
      const rawSource = args.source as string
      const rawDestination = args.destination as string
      if (!rawSource) {
        return { success: false, output: '错误：缺少 source 参数。请提供源路径。' }
      }
      if (!rawDestination) {
        return { success: false, output: '错误：缺少 destination 参数。请提供目标路径。' }
      }
      try {
        // 源可以来自任何位置，但目标必须在工作目录内
        const destination = resolveInWorkDir(rawDestination, workDir)
        const result = await invoke<string>('agent_copy_path', { source: rawSource, destination })
        return { success: true, output: result }
      } catch (e) {
        return { success: false, output: String(e) }
      }
    }
    case 'move_path': {
      const rawSource = args.source as string
      const rawDestination = args.destination as string
      if (!rawSource) {
        return { success: false, output: '错误：缺少 source 参数。请提供源路径。' }
      }
      if (!rawDestination) {
        return { success: false, output: '错误：缺少 destination 参数。请提供目标路径。' }
      }
      try {
        // 源和目标都必须在工作目录内
        const source = resolveInWorkDir(rawSource, workDir)
        const destination = resolveInWorkDir(rawDestination, workDir)
        const result = await invoke<string>('agent_move_path', { source, destination })
        return { success: true, output: result }
      } catch (e) {
        return { success: false, output: String(e) }
      }
    }
    case 'http_fetch': {
      return await executeHttpFetch(args)
    }
    default:
      return null
  }
}

// ─── 连接器工具执行器 ────────────────────────────────────────────

/**
 * 执行连接器工具调用。
 * 从工具名中解析 toolType 和 connectorId，查找对应的连接器配置，
 * 然后调用对应的 Rust 后端命令。
 */
async function executeConnectorTool(
  name: string,
  args: Record<string, unknown>,
  connectorConfigs?: ConnectorConfig[],
): Promise<ToolResult> {
  const parsed = parseConnectorToolName(name)
  if (!parsed) {
    return { success: false, output: `无法解析连接器工具名: ${name}` }
  }

  const { toolType, connectorId } = parsed

  // 查找连接器配置
  const conn = connectorConfigs?.find(c => c.id === connectorId)
  if (!conn) {
    return { success: false, output: `未找到连接器配置 (ID: ${connectorId})，请检查连接器是否已启用` }
  }

  try {
    switch (toolType) {
      case 'ssh_exec': {
        const command = args.command as string
        const ssh = conn.ssh!
        const result = await invoke<string>('agent_ssh_exec', {
          host: ssh.host,
          port: ssh.port,
          username: ssh.username,
          authType: ssh.authType,
          password: ssh.password || '',
          privateKeyPath: ssh.privateKeyPath || '',
          passphrase: ssh.passphrase || '',
          command,
        })
        return { success: true, output: result }
      }
      case 'ssh_read_file': {
        const path = args.path as string
        const lines = args.lines as number | undefined
        const ssh = conn.ssh!
        const result = await invoke<string>('agent_ssh_read_file', {
          host: ssh.host,
          port: ssh.port,
          username: ssh.username,
          authType: ssh.authType,
          password: ssh.password || '',
          privateKeyPath: ssh.privateKeyPath || '',
          passphrase: ssh.passphrase || '',
          path,
          lines: lines ?? 0,
        })
        return { success: true, output: result }
      }
      case 'mysql_query': {
        const sql = args.sql as string
        const db = conn.db!
        const result = await invoke<string>('agent_mysql_query', {
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password || '',
          database: db.database,
          useSsl: db.useSSL || false,
          sql,
        })
        return { success: true, output: result }
      }
      case 'mysql_list_tables': {
        const database = args.database as string | undefined
        const db = conn.db!
        const result = await invoke<string>('agent_mysql_list_tables', {
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password || '',
          database: database || db.database,
          useSsl: db.useSSL || false,
        })
        return { success: true, output: result }
      }
      case 'pg_query': {
        const sql = args.sql as string
        const db = conn.db!
        const result = await invoke<string>('agent_pg_query', {
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password || '',
          database: db.database,
          useSsl: db.useSSL || false,
          sql,
        })
        return { success: true, output: result }
      }
      case 'pg_list_tables': {
        const schema = args.schema as string | undefined
        const db = conn.db!
        const result = await invoke<string>('agent_pg_list_tables', {
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password || '',
          database: db.database,
          useSsl: db.useSSL || false,
          schema: schema || 'public',
        })
        return { success: true, output: result }
      }
      default:
        return { success: false, output: `未知的连接器工具类型: ${toolType}` }
    }
  } catch (e) {
    return { success: false, output: `连接器工具执行失败 [${conn.name}]: ${String(e)}` }
  }
}

/** 格式化字节数为可读字符串 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── HTTP Fetch 工具 ────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 60_000
const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024 // 10MB
const MAX_RESPONSE_LENGTH = 50000

/** 云元数据端点黑名单 — 无合法桌面使用场景 */
const CLOUD_METADATA_HOSTS = new Set([
  '169.254.169.254',        // AWS / Azure
  'metadata.google.internal', // GCP
  '100.100.100.200',        // Alibaba Cloud
])

/**
 * 执行 HTTP 请求并返回结果。
 * 支持 GET/POST/PUT/DELETE/PATCH，带安全守卫和文章提取能力。
 */
async function executeHttpFetch(args: Record<string, unknown>): Promise<ToolResult> {
  const url = args.url as string
  const method = ((args.method as string) || 'GET').toUpperCase()
  const headers = (args.headers as Record<string, string>) || {}
  const body = args.body as string | undefined
  const extract = (args.extract as string) || 'article'

  // ── Pre-flight guards ────────────────────────────────────
  if (url.length > 2000) {
    return { success: false, output: `错误：URL 过长（${url.length} 字符，最大 2000）` }
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return { success: false, output: `错误：无效的 URL：${url}` }
  }

  // 拒绝 URL 中嵌入的凭证 — 应通过 headers 传递认证信息
  if (parsedUrl.username || parsedUrl.password) {
    return {
      success: false,
      output: '错误：URL 中不允许嵌入用户名密码（如 user:pass@host），请使用 headers 参数传递认证信息',
    }
  }

  // 阻止云元数据端点
  if (CLOUD_METADATA_HOSTS.has(parsedUrl.hostname)) {
    return { success: false, output: `错误：已阻止访问云元数据端点 ${parsedUrl.hostname}` }
  }

  try {
    // 使用 Tauri HTTP 插件发起请求（绕过 CORS 限制）
    const response = await tauriFetch(url, {
      method: method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
      headers,
      body: body && ['POST', 'PUT', 'PATCH'].includes(method) ? body : undefined,
      connectTimeout: FETCH_TIMEOUT_MS,
    })

    // 预检查 Content-Length
    const contentLength = response.headers.get('content-length')
    if (contentLength) {
      const size = Number(contentLength)
      if (!isNaN(size) && size > MAX_DOWNLOAD_BYTES) {
        return { success: false, output: `错误：响应体积过大（${(size / 1024 / 1024).toFixed(1)}MB，最大 10MB）` }
      }
    }

    let responseBody = await response.text()
    const contentType = response.headers.get('content-type') || ''

    // HTML 响应时尝试提取文章正文
    if (extract === 'article' && contentType.includes('text/html')) {
      const article = extractArticleFromHtml(responseBody)
      if (article) {
        return { success: true, output: `HTTP ${response.status} ${response.statusText}\n\n${article}` }
      }
      // 提取失败则回退到原始响应
    }

    // 小体积 JSON 美化输出
    if (contentType.includes('application/json') && responseBody.length <= MAX_RESPONSE_LENGTH * 2) {
      try {
        responseBody = JSON.stringify(JSON.parse(responseBody), null, 2)
      } catch {
        // 非合法 JSON，保留原文
      }
    }

    if (responseBody.length > MAX_RESPONSE_LENGTH) {
      responseBody =
        responseBody.slice(0, MAX_RESPONSE_LENGTH) +
        `\n\n... [已截断：响应共 ${responseBody.length} 字符，仅显示前 ${MAX_RESPONSE_LENGTH} 字符]`
    }

    return { success: true, output: `HTTP ${response.status} ${response.statusText}\n\n${responseBody}` }
  } catch (err) {
    return { success: false, output: `HTTP 请求失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * 从 HTML 中提取正文内容并转换为简洁的 Markdown。
 * 优先查找 <article>、<main>、[role=main] 等语义区域，
 * 回退到 <body> 全文提取。
 */
function extractArticleFromHtml(html: string): string | null {
  // 尝试提取标题
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : ''

  // 尝试找到主要正文区域
  const mainPatterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class=["'][^"']*(?:post|article|content|entry|blog)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  ]

  let content = ''
  for (const pattern of mainPatterns) {
    const match = html.match(pattern)
    if (match) {
      content = match[1]
      break
    }
  }

  // 回退到 body
  if (!content) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    if (bodyMatch) {
      content = bodyMatch[1]
    } else {
      return null
    }
  }

  // 移除 script / style / nav / header / footer
  content = content
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')

  const markdown = htmlToSimpleMarkdown(content)
  if (!markdown.trim()) return null

  const parts: string[] = []
  if (title) parts.push(`# ${title}`)
  parts.push('')
  parts.push(markdown)
  return parts.join('\n')
}

/** 轻量级 HTML 到 Markdown 转换 */
function htmlToSimpleMarkdown(html: string): string {
  return html
    // Block elements → newlines
    .replace(/<\/?(div|section|article|aside|main)[^>]*>/gi, '\n')
    // Headings
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
    // Paragraphs
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
    // Bold / italic
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
    // Links
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    // Images
    .replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)')
    .replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)')
    // Lists
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1')
    .replace(/<\/?(ul|ol)[^>]*>/gi, '\n')
    // Code
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    // Blockquote
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n> $1\n')
    // Horizontal rule
    .replace(/<hr[^>]*\/?>/gi, '\n---\n')
    // Line breaks
    .replace(/<br[^>]*\/?>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode common entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Clean up excessive newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 检查搜索路径是否危险（系统根目录或系统关键目录）
 * 防止 LLM 错误地在整个文件系统上执行搜索
 */
function isDangerousSearchPath(path: string): boolean {
  if (!path || path.trim() === '') return true

  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')

  // 系统根目录
  const dangerousPaths = [
    '/',           // Unix 根目录
    '',            // 空路径
    'C:',          // Windows C 盘根
    'C:/',         // Windows C 盘根
    'D:', 'D:/',   // Windows D 盘根
    'E:', 'E:/',   // Windows E 盘根
    '/c', '/d', '/e', // Git Bash 风格的盘符
  ]

  // 精确匹配根目录
  if (dangerousPaths.includes(normalized.toUpperCase()) || dangerousPaths.includes(normalized)) {
    return true
  }

  // 单字母盘符（Windows: C:, D: 等）
  if (/^[A-Za-z]:$/.test(path.trim())) {
    return true
  }

  const lower = normalized.toLowerCase()

  // 用户目录：只精确拦截目录本身，不拦截子目录（用户工作区必然在 C:/Users/xxx/ 下）
  const userDirsExact = ['/users', '/home', '/root', 'c:/users']
  if (userDirsExact.includes(lower)) {
    return true
  }

  // 系统目录：拦截目录及所有子目录
  const systemDirsPrefix = [
    '/windows', '/program files', '/program files (x86)',
    '/system', 'c:/windows', 'c:/program files', 'c:/program files (x86)',
    'c:/system32',
  ]
  if (systemDirsPrefix.some(dir => lower === dir || lower.startsWith(dir + '/'))) {
    return true
  }

  return false
}
