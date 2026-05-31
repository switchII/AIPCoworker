/**
 * MCP 客户端实现
 * 
 * 实现 MCP (Model Context Protocol) 客户端，支持：
 * - stdio 传输（通过 Tauri 后端）
 * - HTTP 传输（通过 fetch API）
 * - JSON-RPC 2.0 通信
 * - 连接管理和错误处理
 */

import type { MCPServerConfig } from '../../types/integration'
import type {
  MCPConnection,
  MCPConnectionStatus,
  MCPTool,
  MCPToolCallResponse,
  JSONRPCRequest,
  JSONRPCResponse,
  MCPInitializeRequest,
} from './types'

// ─── MCP 连接基类 ──────────────────────────────────────────

abstract class MCPConnectionBase implements MCPConnection {
  serverConfig: MCPServerConfig
  status: MCPConnectionStatus = 'disconnected'
  error?: string
  
  protected requestId = 0
  protected initialized = false
  
  constructor(serverConfig: MCPServerConfig) {
    this.serverConfig = serverConfig
  }
  
  abstract connect(): Promise<void>
  abstract disconnect(): Promise<void>
  abstract testConnection(): Promise<{ success: boolean; message: string }>
  abstract sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown>
  
  async listTools(): Promise<MCPTool[]> {
    if (!this.initialized) {
      try {
        await this.initialize()
      } catch (err) {
        console.warn(`[MCP] 初始化失败，尝试直接获取工具列表:`, err)
        // 某些服务器可能不需要初始化
        this.initialized = true
      }
    }
    
    try {
      const response = await this.sendRequest('tools/list') as any
      return response.tools || []
    } catch (err) {
      console.error(`[MCP] 获取工具列表失败:`, err)
      throw err
    }
  }
  
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResponse> {
    if (!this.initialized) {
      await this.initialize()
    }
    
    const response = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    }) as any
    
    return {
      content: response.content || [],
      isError: response.isError || false,
    }
  }
  
  getStatus(): MCPConnectionStatus {
    return this.status
  }
  
  getError(): string | undefined {
    return this.error
  }
  
  protected async initialize(): Promise<void> {
    if (this.initialized) return
    
    console.log(`[MCP] 正在初始化服务器: ${this.serverConfig.name}`)
    
    const initRequest: MCPInitializeRequest = {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: {
          listChanged: false,
        },
      },
      clientInfo: {
        name: 'AIPCowork',
        version: '0.1.0',
      },
    }
    
    try {
      // 尝试发送 initialize 请求
      await this.sendRequest('initialize', initRequest as any)
      console.log(`[MCP] 服务器 ${this.serverConfig.name} initialize 成功`)
      
      // 发送 initialized 通知
      await this.sendRequest('notifications/initialized')
      console.log(`[MCP] 服务器 ${this.serverConfig.name} notifications/initialized 发送成功`)
      
      this.initialized = true
      console.log(`[MCP] ✓ 服务器 ${this.serverConfig.name} 初始化完成`)
    } catch (err) {
      console.warn(`[MCP] ✗ 服务器 ${this.serverConfig.name} 初始化失败:`, err)
      // 重新抛出错误，让调用者决定如何处理
      throw err
    }
  }
  
  protected getNextRequestId(): number | string {
    return ++this.requestId
  }
}

// ─── HTTP 传输实现 ─────────────────────────────────────────

class HTTPMCPConnection extends MCPConnectionBase {
  private abortController?: AbortController
  
  constructor(serverConfig: MCPServerConfig) {
    super(serverConfig)
    if (!serverConfig.url) {
      throw new Error('HTTP 传输需要 URL 配置')
    }
  }
  
  async connect(): Promise<void> {
    this.status = 'connecting'
    this.error = undefined
    
    try {
      // 尝试初始化，但如果失败也不阻止连接
      try {
        await this.initialize()
      } catch (initErr) {
        console.warn(`[MCP] 服务器 ${this.serverConfig.name} 初始化失败，但继续尝试连接:`, initErr)
        // 某些 MCP 服务器可能不支持标准初始化流程
        // 标记为已初始化，允许后续操作
        this.initialized = true
      }
      
      this.status = 'connected'
      console.log(`[MCP] HTTP 服务器已连接: ${this.serverConfig.url}`)
    } catch (err) {
      this.status = 'error'
      this.error = err instanceof Error ? err.message : String(err)
      throw err
    }
  }
  
  async disconnect(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = undefined
    }
    this.status = 'disconnected'
    this.initialized = false
    console.log(`[MCP] HTTP 服务器已断开: ${this.serverConfig.name}`)
  }
  
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      this.status = 'connecting'
      
      // 尝试发送 ping 请求
      await this.sendRequest('ping')
      
      this.status = 'connected'
      return {
        success: true,
        message: '连接成功',
      }
    } catch (err) {
      this.status = 'error'
      const message = err instanceof Error ? err.message : String(err)
      this.error = message
      return {
        success: false,
        message: `连接失败: ${message}`,
      }
    }
  }
  
  async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.serverConfig.url) {
      throw new Error('URL 未配置')
    }
    
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.getNextRequestId(),
    }
    
    this.abortController = new AbortController()
    
    // 构建请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    
    // 添加认证头
    if (this.serverConfig.authType === 'bearer' && this.serverConfig.apiKey) {
      headers['Authorization'] = `Bearer ${this.serverConfig.apiKey}`
    } else if (this.serverConfig.authType === 'apikey' && this.serverConfig.apiKey) {
      const headerName = this.serverConfig.apiKeyHeader || 'X-API-Key'
      headers[headerName] = this.serverConfig.apiKey
    } else if (this.serverConfig.authType === 'basic' && this.serverConfig.apiKey) {
      // 假设 apiKey 格式为 "username:password"
      const encoded = btoa(this.serverConfig.apiKey)
      headers['Authorization'] = `Basic ${encoded}`
    }
    
    // 合并自定义 headers
    if (this.serverConfig.headers) {
      Object.assign(headers, this.serverConfig.headers)
    }
    
    console.log(`[MCP] 发送请求: ${method} -> ${this.serverConfig.url}`)
    console.log(`[MCP] 请求体:`, JSON.stringify(request, null, 2))
    
    try {
      const response = await fetch(this.serverConfig.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: this.abortController.signal,
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[MCP] HTTP 错误响应 (${response.status}):`, errorText)
        throw new Error(`HTTP 错误: ${response.status} ${response.statusText}\n响应: ${errorText}`)
      }
      
      const data: JSONRPCResponse = await response.json()
      
      if (data.error) {
        console.error(`[MCP] JSON-RPC 错误:`, data.error)
        throw new Error(`JSON-RPC 错误: ${data.error.message} (code: ${data.error.code})`)
      }
      
      console.log(`[MCP] 响应成功: ${method}`)
      return data.result
    } catch (err) {
      console.error(`[MCP] 请求失败: ${method}`, err)
      throw err
    }
  }
}

// ─── SSE 传输实现 ──────────────────────────────────────────
// SSE MCP 协议流程:
// 1. Client GET → SSE endpoint → 建立长连接
// 2. Server 发送 endpoint 事件，包含 POST URL
// 3. Client POST JSON-RPC → endpoint URL
// 4. Server 通过 SSE 流返回 JSON-RPC 响应

class SSEMCPConnection extends MCPConnectionBase {
  private sseAbortController?: AbortController
  private messageEndpoint: string = ''
  private pendingRequests = new Map<number | string, {
    resolve: (value: unknown) => void
    reject: (reason: unknown) => void
  }>()
  private sseReady: Promise<void> | null = null
  
  constructor(serverConfig: MCPServerConfig) {
    super(serverConfig)
    if (!serverConfig.url) {
      throw new Error('SSE 传输需要 URL 配置')
    }
  }
  
  /** 构建请求头 */
  private async buildHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {}
    
    // 添加认证头
    if (this.serverConfig.authType === 'bearer' && this.serverConfig.apiKey) {
      headers['Authorization'] = `Bearer ${await this.interpolateEnvVarsAsync(this.serverConfig.apiKey)}`
    } else if (this.serverConfig.authType === 'apikey' && this.serverConfig.apiKey) {
      const headerName = this.serverConfig.apiKeyHeader || 'X-API-Key'
      headers[headerName] = await this.interpolateEnvVarsAsync(this.serverConfig.apiKey)
    } else if (this.serverConfig.authType === 'basic' && this.serverConfig.apiKey) {
      const encoded = btoa(await this.interpolateEnvVarsAsync(this.serverConfig.apiKey))
      headers['Authorization'] = `Basic ${encoded}`
    }
    
    // 合并自定义 headers，并处理环境变量插值
    if (this.serverConfig.headers) {
      for (const [key, value] of Object.entries(this.serverConfig.headers)) {
        headers[key] = await this.interpolateEnvVarsAsync(value)
      }
    }
    
    return headers
  }
  
  /** 异步处理 ${VAR_NAME} 格式的环境变量插值 */
  private async interpolateEnvVarsAsync(value: string): Promise<string> {
    const { invoke } = await import('@tauri-apps/api/core')
    const matches = value.matchAll(/\$\{([^}]+)\}/g)
    let result = value
    for (const match of matches) {
      const varName = match[1]
      // 优先从 localStorage 获取
      const localValue = localStorage.getItem(varName)
      if (localValue) {
        result = result.replace(match[0], localValue)
        continue
      }
      // 尝试从 Tauri 后端获取 OS 环境变量
      try {
        const envValue = await invoke<string>('get_env_var', { name: varName })
        result = result.replace(match[0], envValue)
      } catch {
        console.warn(`[MCP-SSE] 环境变量 ${varName} 未找到`)
      }
    }
    return result
  }
  
  /** 建立 SSE 连接并等待 endpoint */
  private async openSSEStream(): Promise<void> {
    this.sseAbortController = new AbortController()
    const url = this.serverConfig.url!
    const headers = await this.buildHeaders()
    headers['Accept'] = 'text/event-stream'
    
    console.log(`[MCP-SSE] 建立 SSE 连接: ${url}`)
    
    this.sseReady = new Promise<void>((resolve, reject) => {
      fetch(url, {
        method: 'GET',
        headers,
        signal: this.sseAbortController!.signal,
      }).then(response => {
        if (!response.ok) {
          reject(new Error(`SSE 连接失败: HTTP ${response.status} ${response.statusText}`))
          return
        }
        
        const reader = response.body?.getReader()
        if (!reader) {
          reject(new Error('SSE 响应体不可读'))
          return
        }
        
        console.log(`[MCP-SSE] SSE 流已建立，等待 endpoint 事件...`)
        
        // 异步读取 SSE 流
        this.readSSEStream(reader).catch(err => {
          console.error(`[MCP-SSE] SSE 流读取错误:`, err)
          // 拒绝所有 pending 请求
          for (const [, pending] of this.pendingRequests) {
            pending.reject(err)
          }
          this.pendingRequests.clear()
        })
        
        // 等待 endpoint 事件（通过轮询）
        const checkEndpoint = () => {
          if (this.messageEndpoint) {
            console.log(`[MCP-SSE] 收到 message endpoint: ${this.messageEndpoint}`)
            resolve()
          } else if (this.sseAbortController?.signal.aborted) {
            reject(new Error('SSE 连接已取消'))
          } else {
            setTimeout(checkEndpoint, 50)
          }
        }
        checkEndpoint()
        
        // 超时
        setTimeout(() => {
          if (!this.messageEndpoint) {
            reject(new Error('SSE 连接超时：未收到 endpoint 事件'))
          }
        }, this.serverConfig.timeout || 30000)
      }).catch(reject)
    })
    
    return this.sseReady
  }
  
  /** 读取 SSE 流并解析事件 */
  private async readSSEStream(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder()
    let buffer = ''
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      buffer += decoder.decode(value, { stream: true })
      
      // 按双换行分割事件
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || '' // 保留不完整的部分
      
      for (const part of parts) {
        if (!part.trim()) continue
        this.parseSSEEvent(part)
      }
    }
  }
  
  /** 解析单个 SSE 事件 */
  private parseSSEEvent(eventText: string): void {
    let eventType = ''
    let data = ''
    
    for (const line of eventText.split('\n')) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        data += (data ? '\n' : '') + line.slice(5).trim()
      }
    }
    
    if (!eventType && !data) return
    
    console.log(`[MCP-SSE] 收到事件: type=${eventType || '(default)'}, data=${data.substring(0, 200)}`)
    
    if (eventType === 'endpoint') {
      // endpoint 可能是相对路径或绝对 URL
      const baseUrl = new URL(this.serverConfig.url!)
      try {
        this.messageEndpoint = new URL(data, baseUrl.origin).href
      } catch {
        this.messageEndpoint = data
      }
    } else if (eventType === 'message' || eventType === '') {
      // JSON-RPC 响应
      try {
        const response: JSONRPCResponse = JSON.parse(data)
        const pending = this.pendingRequests.get(response.id)
        if (pending) {
          this.pendingRequests.delete(response.id)
          if (response.error) {
            pending.reject(new Error(`JSON-RPC 错误: ${response.error.message} (code: ${response.error.code})`))
          } else {
            pending.resolve(response.result)
          }
        } else {
          console.warn(`[MCP-SSE] 收到未匹配的响应: id=${response.id}`)
        }
      } catch (err) {
        console.error(`[MCP-SSE] 解析 JSON-RPC 响应失败:`, err, 'data:', data)
      }
    }
  }
  
  async connect(): Promise<void> {
    this.status = 'connecting'
    this.error = undefined
    
    try {
      // 先建立 SSE 流，获取 message endpoint
      await this.openSSEStream()
      
      // 尝试初始化
      try {
        await this.initialize()
      } catch (initErr) {
        console.warn(`[MCP-SSE] 服务器 ${this.serverConfig.name} 初始化失败，继续尝试连接:`, initErr)
        this.initialized = true
      }
      
      this.status = 'connected'
      console.log(`[MCP-SSE] 服务器已连接: ${this.serverConfig.url}`)
    } catch (err) {
      this.status = 'error'
      this.error = err instanceof Error ? err.message : String(err)
      throw err
    }
  }
  
  async disconnect(): Promise<void> {
    if (this.sseAbortController) {
      this.sseAbortController.abort()
      this.sseAbortController = undefined
    }
    // 拒绝所有 pending 请求
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error('连接已断开'))
    }
    this.pendingRequests.clear()
    this.sseReady = null
    this.messageEndpoint = ''
    this.status = 'disconnected'
    this.initialized = false
    console.log(`[MCP-SSE] 服务器已断开: ${this.serverConfig.name}`)
  }
  
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      this.status = 'connecting'
      
      // 建立 SSE 连接
      await this.openSSEStream()
      
      // 发送 ping
      await this.sendRequest('ping')
      
      this.status = 'connected'
      
      // 清理测试连接
      await this.disconnect()
      
      return { success: true, message: 'SSE 连接成功' }
    } catch (err) {
      this.status = 'error'
      const message = err instanceof Error ? err.message : String(err)
      this.error = message
      await this.disconnect().catch(() => {})
      return { success: false, message: `SSE 连接失败: ${message}` }
    }
  }
  
  async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    // 确保 SSE 流已建立
    if (this.sseReady) {
      await this.sseReady
    }
    
    if (!this.messageEndpoint) {
      throw new Error('SSE message endpoint 未就绪')
    }
    
    const id = this.getNextRequestId()
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    }
    
    // 创建响应 Promise
    const responsePromise = new Promise<unknown>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      
      // 请求超时
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`请求超时: ${method}`))
        }
      }, this.serverConfig.timeout || 30000)
    })
    
    // POST JSON-RPC 请求到 message endpoint
    const builtHeaders = await this.buildHeaders()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...builtHeaders,
    }
    
    console.log(`[MCP-SSE] POST ${method} -> ${this.messageEndpoint}`)
    
    try {
      const postResponse = await fetch(this.messageEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      })
      
      if (!postResponse.ok) {
        // POST 失败时从 pending 中移除并拒绝
        this.pendingRequests.delete(id)
        const errorText = await postResponse.text()
        throw new Error(`SSE POST 失败: HTTP ${postResponse.status}\n响应: ${errorText}`)
      }
      
      // 某些服务器可能直接在 POST 响应中返回结果（非标准 SSE）
      const contentType = postResponse.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const data: JSONRPCResponse = await postResponse.json()
        this.pendingRequests.delete(id)
        if (data.error) {
          throw new Error(`JSON-RPC 错误: ${data.error.message} (code: ${data.error.code})`)
        }
        return data.result
      }
      
      // 标准 SSE：等待通过 SSE 流返回的响应
      return await responsePromise
    } catch (err) {
      this.pendingRequests.delete(id)
      console.error(`[MCP-SSE] 请求失败: ${method}`, err)
      throw err
    }
  }
}

// ─── stdio 传输实现 ────────────────────────────────────────
// 注意：stdio 传输需要通过 Tauri 后端实现
// 这里提供一个前端接口，实际执行需要调用后端命令

class StdioMCPConnection extends MCPConnectionBase {
  constructor(serverConfig: MCPServerConfig) {
    super(serverConfig)
    if (!serverConfig.command) {
      throw new Error('stdio 传输需要 command 配置')
    }
  }
  
  async connect(): Promise<void> {
    this.status = 'connecting'
    this.error = undefined
    
    try {
      // 通过 Tauri 后端启动 stdio 进程
      const { invoke } = await import('@tauri-apps/api/core')
      
      await invoke('mcp_stdio_connect', {
        serverId: this.serverConfig.id,
        command: this.serverConfig.command,
        args: this.serverConfig.args || [],
        env: this.serverConfig.env || {},
        timeout: this.serverConfig.timeout,
      })
      
      await this.initialize()
      this.status = 'connected'
      console.log(`[MCP] stdio 服务器已连接: ${this.serverConfig.command}`)
    } catch (err) {
      this.status = 'error'
      this.error = err instanceof Error ? err.message : String(err)
      throw err
    }
  }
  
  async disconnect(): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('mcp_stdio_disconnect', {
        serverId: this.serverConfig.id,
      })
    } catch (err) {
      console.warn('[MCP] 断开 stdio 连接失败:', err)
    }
    
    this.status = 'disconnected'
    this.initialized = false
    console.log(`[MCP] stdio 服务器已断开: ${this.serverConfig.name}`)
  }
  
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      this.status = 'connecting'
      
      // 尝试通过 Tauri 后端测试连接
      const { invoke } = await import('@tauri-apps/api/core')
      
      const result = await invoke<{ success: boolean; message: string }>('mcp_stdio_test', {
        serverId: this.serverConfig.id,
        command: this.serverConfig.command,
        args: this.serverConfig.args || [],
        env: this.serverConfig.env || {},
        timeout: this.serverConfig.timeout,
      })
      
      if (result.success) {
        this.status = 'connected'
      } else {
        this.status = 'error'
        this.error = result.message
      }
      
      return result
    } catch (err) {
      this.status = 'error'
      const message = err instanceof Error ? err.message : String(err)
      this.error = message
      return {
        success: false,
        message: `连接失败: ${message}`,
      }
    }
  }
  
  async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const { invoke } = await import('@tauri-apps/api/core')
    
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.getNextRequestId(),
    }
    
    const response = await invoke<JSONRPCResponse>('mcp_stdio_send', {
      serverId: this.serverConfig.id,
      request: JSON.stringify(request),
      timeout: this.serverConfig.timeout,
    })
    
    if (response.error) {
      throw new Error(`JSON-RPC 错误: ${response.error.message}`)
    }
    
    return response.result
  }
}

// ─── 连接工厂 ──────────────────────────────────────────────

/**
 * 创建 MCP 连接实例
 */
export function createMCPConnection(serverConfig: MCPServerConfig): MCPConnection {
  // 确定传输类型
  let transport = serverConfig.transport
  
  // 自动检测：URL 以 /sse 结尾时使用 SSE 传输
  if ((!transport || transport === 'http') && serverConfig.url && serverConfig.url.endsWith('/sse')) {
    console.log(`[MCP] URL 以 /sse 结尾，自动切换为 SSE 传输: ${serverConfig.url}`)
    transport = 'sse'
  }
  
  // 如果 transport 未设置，根据配置内容推断
  if (!transport) {
    if (serverConfig.command) {
      transport = 'stdio'
    } else if (serverConfig.url) {
      transport = 'http'
    }
  }
  
  switch (transport) {
    case 'http':
      return new HTTPMCPConnection(serverConfig)
    case 'sse':
      return new SSEMCPConnection(serverConfig)
    case 'stdio':
      return new StdioMCPConnection(serverConfig)
    default:
      throw new Error(`不支持的传输类型: ${(serverConfig as any).transport}`)
  }
}

// ─── 连接管理器 ────────────────────────────────────────────

/**
 * MCP 连接管理器
 * 管理所有 MCP 服务器的连接状态
 */
class MCPConnectionManager {
  private connections = new Map<string, MCPConnection>()
  private connectionStates = new Map<string, {
    status: MCPConnectionStatus
    error?: string
    tools: MCPTool[]
    lastConnected?: string
  }>()
  
  /**
   * 连接到 MCP 服务器
   */
  async connect(serverConfig: MCPServerConfig): Promise<MCPConnection> {
    if (this.connections.has(serverConfig.id)) {
      return this.connections.get(serverConfig.id)!
    }
    
    const connection = createMCPConnection(serverConfig)
    this.connections.set(serverConfig.id, connection)
    
    // 初始化连接状态
    this.connectionStates.set(serverConfig.id, {
      status: 'disconnected',
      tools: [],
    })
    
    await connection.connect()
    
    // 更新状态
    this.connectionStates.set(serverConfig.id, {
      status: connection.getStatus(),
      error: connection.getError(),
      tools: await connection.listTools(),
      lastConnected: new Date().toISOString(),
    })
    
    return connection
  }
  
  /**
   * 断开 MCP 服务器连接
   */
  async disconnect(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId)
    if (!connection) return
    
    await connection.disconnect()
    this.connections.delete(serverId)
    
    this.connectionStates.set(serverId, {
      status: 'disconnected',
      tools: [],
    })
  }
  
  /**
   * 测试连接
   */
  async testConnection(serverConfig: MCPServerConfig): Promise<{ success: boolean; message: string }> {
    const tempConnection = createMCPConnection(serverConfig)
    return await tempConnection.testConnection()
  }
  
  /**
   * 获取连接
   */
  getConnection(serverId: string): MCPConnection | undefined {
    return this.connections.get(serverId)
  }
  
  /**
   * 获取连接状态
   */
  getConnectionState(serverId: string) {
    return this.connectionStates.get(serverId)
  }
  
  /**
   * 获取所有已连接的服务器的工具列表
   */
  async getAllTools(): Promise<Map<string, MCPTool[]>> {
    const toolsMap = new Map<string, MCPTool[]>()
    
    for (const [serverId, connection] of this.connections) {
      if (connection.getStatus() === 'connected') {
        try {
          const tools = await connection.listTools()
          toolsMap.set(serverId, tools)
        } catch (err) {
          console.warn(`[MCP] 获取服务器 ${serverId} 的工具列表失败:`, err)
        }
      }
    }
    
    return toolsMap
  }
  
  /**
   * 断开所有连接
   */
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.connections.keys()).map(id => this.disconnect(id))
    await Promise.allSettled(promises)
  }
}

// 导出单例
export const mcpManager = new MCPConnectionManager()
