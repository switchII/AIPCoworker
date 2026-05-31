/**
 * 连接器工具定义
 *
 * 这些工具仅在用户选择了对应的连接器时才会加载到 prompt 中。
 * 按连接器类型分组：
 * - SSH: ssh_exec（远程执行命令）, ssh_read_file（远程读取文件）
 * - MySQL: mysql_query（执行 SQL）, mysql_list_tables（列出表）
 * - PostgreSQL: pg_query（执行 SQL）, pg_list_tables（列出表）
 *
 * 每个工具名都带有 connectorId 后缀（如 ssh_exec_abc123），
 * 以支持同一类型多个连接器的场景。
 */
import type { ToolDefinition } from '../../agent/llm/llmClient'
import type { ConnectorConfig } from '../../types/integration'

/** 获取连接器的人类可读标签 */
function getConnLabel(conn: ConnectorConfig): string {
  const host = conn.type === 'ssh'
    ? `${conn.ssh?.host || '?'}:${conn.ssh?.port || 22}`
    : `${conn.db?.host || '?'}:${conn.db?.port || 3306}/${conn.db?.database || ''}`
  return `${conn.name} (${host})`
}

// ─── SSH 工具 ──────────────────────────────────────────────

function buildSSHExecTool(conn: ConnectorConfig): ToolDefinition {
  const label = getConnLabel(conn)
  return {
    type: 'function',
    function: {
      name: `ssh_exec_${conn.id}`,
      description:
        `通过 SSH 在远程服务器「${label}」上执行命令并返回输出。` +
        `适用于管理服务器、查看日志、安装软件包、启停服务等运维操作。` +
        `注意：命令会在远程服务器的 shell 中执行，不是本地。`,
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: '要在远程服务器上执行的 shell 命令',
          },
        },
        required: ['command'],
      },
    },
  }
}

function buildSSHReadFileTool(conn: ConnectorConfig): ToolDefinition {
  const label = getConnLabel(conn)
  return {
    type: 'function',
    function: {
      name: `ssh_read_file_${conn.id}`,
      description:
        `通过 SSH 读取远程服务器「${label}」上的文件内容。` +
        `适用于查看配置文件、日志片段等。`,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '远程服务器上的文件绝对路径',
          },
          lines: {
            type: 'number',
            description: '读取的行数（从文件开头），默认读取全部内容。设为负数则从文件尾部读取',
          },
        },
        required: ['path'],
      },
    },
  }
}

// ─── MySQL 工具 ────────────────────────────────────────────

function buildMySQLQueryTool(conn: ConnectorConfig): ToolDefinition {
  const label = getConnLabel(conn)
  return {
    type: 'function',
    function: {
      name: `mysql_query_${conn.id}`,
      description:
        `在 MySQL 数据库「${label}」上执行 SQL 查询并返回结果。` +
        `支持 SELECT、INSERT、UPDATE、DELETE、SHOW、DESCRIBE 等所有 SQL 语句。` +
        `对于 SELECT 查询返回结果集，对于 DML 返回影响行数。`,
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: '要执行的 SQL 语句',
          },
        },
        required: ['sql'],
      },
    },
  }
}

function buildMySQLListTablesTool(conn: ConnectorConfig): ToolDefinition {
  const label = getConnLabel(conn)
  return {
    type: 'function',
    function: {
      name: `mysql_list_tables_${conn.id}`,
      description:
        `列出 MySQL 数据库「${label}」中当前数据库的所有表名。` +
        `返回表名及其行数估计。`,
      parameters: {
        type: 'object',
        properties: {
          database: {
            type: 'string',
            description: '要列出表的数据库名（留空则使用连接器配置的默认数据库）',
          },
        },
        required: [],
      },
    },
  }
}

// ─── PostgreSQL 工具 ──────────────────────────────────────

function buildPgQueryTool(conn: ConnectorConfig): ToolDefinition {
  const label = getConnLabel(conn)
  return {
    type: 'function',
    function: {
      name: `pg_query_${conn.id}`,
      description:
        `在 PostgreSQL 数据库「${label}」上执行 SQL 查询并返回结果。` +
        `支持 SELECT、INSERT、UPDATE、DELETE 等所有 SQL 语句。` +
        `对于 SELECT 查询返回结果集，对于 DML 返回影响行数。`,
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: '要执行的 SQL 语句',
          },
        },
        required: ['sql'],
      },
    },
  }
}

function buildPgListTablesTool(conn: ConnectorConfig): ToolDefinition {
  const label = getConnLabel(conn)
  return {
    type: 'function',
    function: {
      name: `pg_list_tables_${conn.id}`,
      description:
        `列出 PostgreSQL 数据库「${label}」中当前 schema（默认 public）的所有用户表。` +
        `返回表名、行数估计和大小。`,
      parameters: {
        type: 'object',
        properties: {
          schema: {
            type: 'string',
            description: '要列出表的 schema 名（留空则默认使用 public）',
          },
        },
        required: [],
      },
    },
  }
}

// ─── 汇总构建 ──────────────────────────────────────────────

/**
 * 根据选中的连接器配置列表，构建所有可用的连接器工具定义。
 * 仅为用户选中的连接器生成工具，未选中的不会出现在 LLM 工具列表中。
 */
export function buildConnectorToolDefinitions(connectors: ConnectorConfig[]): ToolDefinition[] {
  const tools: ToolDefinition[] = []

  for (const conn of connectors) {
    if (!conn.enabled) continue

    switch (conn.type) {
      case 'ssh':
        tools.push(buildSSHExecTool(conn))
        tools.push(buildSSHReadFileTool(conn))
        break
      case 'mysql':
        tools.push(buildMySQLQueryTool(conn))
        tools.push(buildMySQLListTablesTool(conn))
        break
      case 'postgresql':
        tools.push(buildPgQueryTool(conn))
        tools.push(buildPgListTablesTool(conn))
        break
    }
  }

  return tools
}

/**
 * 判断工具名是否是连接器工具（以已知前缀开头）
 */
export function isConnectorToolName(name: string): boolean {
  return /^(?:ssh_exec|ssh_read_file|mysql_query|mysql_list_tables|pg_query|pg_list_tables)_/.test(name)
}

/**
 * 从连接器工具名中解析出工具类型和 connectorId。
 * 例如 "ssh_exec_conn-1234" → { toolType: 'ssh_exec', connectorId: 'conn-1234' }
 */
export function parseConnectorToolName(name: string): { toolType: string; connectorId: string } | null {
  const prefixes = [
    'ssh_exec', 'ssh_read_file',
    'mysql_query', 'mysql_list_tables',
    'pg_query', 'pg_list_tables',
  ]
  for (const prefix of prefixes) {
    if (name.startsWith(prefix + '_')) {
      return {
        toolType: prefix,
        connectorId: name.slice(prefix.length + 1),
      }
    }
  }
  return null
}

/** 将连接器工具名格式化为可读名称：SSH | 连接器名 | 执行命令 */
export function formatConnectorToolName(name: string, connName?: string): string {
  const prefixes = [
    { prefix: 'ssh_exec', label: 'SSH', action: '执行命令' },
    { prefix: 'ssh_read_file', label: 'SSH', action: '读取文件' },
    { prefix: 'mysql_query', label: 'MySQL', action: '执行 SQL' },
    { prefix: 'mysql_list_tables', label: 'MySQL', action: '列出表' },
    { prefix: 'pg_query', label: 'PostgreSQL', action: '执行 SQL' },
    { prefix: 'pg_list_tables', label: 'PostgreSQL', action: '列出表' },
  ]
  for (const { prefix, label, action } of prefixes) {
    if (name.startsWith(prefix + '_')) {
      return connName ? `${label} | ${connName} | ${action}` : `${label} | ${action}`
    }
  }
  return name
}

/** 将 MCP 工具名格式化为可读名称：MCP | 服务名称 | 方法名 */
export function formatMCPToolName(name: string): string {
  if (!name.startsWith('mcp_')) return name
  const parts = name.substring(4).split('_')
  if (parts.length >= 2) {
    return `MCP | ${parts[0]} | ${parts.slice(1).join('_')}`
  }
  return name
}

/** 内置工具名称映射（不含参数） */
const BUILTIN_TOOL_LABELS: Record<string, string> = {
  read_file: '读取文件', write_file: '写入文件', list_directory: '列出目录',
  run_command: '执行命令', glob_search: '搜索文件', ripgrep_search: '全文搜索',
  delete_path: '删除', copy_path: '复制', move_path: '移动文件',
  http_fetch: 'HTTP 请求', ask_user: '询问用户',
  memory_search: '搜索记忆', memory_add: '添加记忆', memory_update: '更新记忆', memory_delete: '删除记忆',
}

/**
 * 将任意工具名格式化为人类可读标签（统一入口）。
 *
 * @param name 原始工具名
 * @param resolveConnName 可选的连接器名称解析函数，不传时回退到无名称格式
 */
export function formatToolName(
  name: string,
  resolveConnName?: (toolName: string) => string | undefined,
): string {
  if (name.startsWith('mcp_')) return formatMCPToolName(name)
  if (isConnectorToolName(name)) return formatConnectorToolName(name, resolveConnName?.(name))
  return BUILTIN_TOOL_LABELS[name] ?? name
}

/**
 * 构建工具的完整显示标签（含参数信息）。
 * 用于 UI 中显示如「执行命令: ls -la」「读取文件: /path/to/file」。
 *
 * @param name 原始工具名
 * @param args 工具调用参数
 * @param connName 可选的连接器名称
 */
export function buildToolDisplayLabel(
  name: string,
  args: Record<string, unknown>,
  connName?: string,
): string {
  // MCP 工具
  if (name.startsWith('mcp_')) return formatMCPToolName(name)

  // 连接器工具
  if (isConnectorToolName(name)) {
    const friendly = formatConnectorToolName(name, connName)
    if (name.startsWith('ssh_exec_')) return `${friendly}: ${(args.command as string) || ''}`
    if (name.startsWith('ssh_read_file_')) return `${friendly}: ${(args.path as string) || ''}`
    if (name.startsWith('mysql_query_') || name.startsWith('pg_query_'))
      return `${friendly}: ${((args.sql as string) || '').slice(0, 60)}`
    if (name.startsWith('mysql_list_tables_'))
      return `${friendly}${args.database ? ` (${args.database})` : ''}`
    if (name.startsWith('pg_list_tables_'))
      return `${friendly}${args.schema ? ` (${args.schema})` : ''}`
    return friendly
  }

  // 内置工具
  const map: Record<string, string> = {
    read_file: `读取文件: ${(args.path as string) || ''}`,
    write_file: `写入文件: ${(args.path as string) || ''}`,
    list_directory: `列出目录: ${(args.path as string) || '.'}`,
    run_command: `执行命令: ${(args.command as string) || ''}`,
    glob_search: `搜索文件: ${(args.pattern as string) || ''}`,
    ripgrep_search: `全文搜索: ${(args.pattern as string) || ''}`,
    delete_path: `删除: ${(args.path as string) || ''}`,
    copy_path: `复制: ${(args.source as string) || ''} → ${(args.destination as string) || ''}`,
    move_path: `移动: ${(args.source as string) || ''} → ${(args.destination as string) || ''}`,
    web_search: `搜索: ${(args.query as string) || ''}`,
    http_fetch: `请求: ${(args.url as string) || ''}`,
    ask_user: '向用户提问',
    memory_search: `搜索记忆: ${(args.query as string) || ''}`,
    memory_add: `添加记忆: ${((args.content as string) || '').slice(0, 30)}`,
    memory_update: `更新记忆`,
    memory_delete: `删除记忆`,
  }
  return map[name] || `${name}(...)`
}
