/**
 * 公共 HTTP 请求工具 — 基于 @tauri-apps/plugin-http 封装
 *
 * 提供统一的请求拦截、响应处理、错误处理能力。
 *
 * 用法:
 *   import { request, get, post, put, del } from '@/utils/request'
 *
 *   // 基础请求
 *   const data = await get<UserInfo>('/api/user/info')
 *
 *   // 带参数请求
 *   const list = await post<PageResult<Task>>('/api/tasks', { page: 1, size: 20 })
 */

import { fetch, type ClientOptions } from '@tauri-apps/plugin-http'

// ======================== 类型定义 ========================

/** 后端统一响应结构（可根据实际后端调整） */
export interface ApiResponse<T = any> {
  /** 业务状态码，0 或 200 表示成功 */
  code: number
  /** 提示信息 */
  message: string
  /** 业务数据 */
  data: T
}

/** 请求配置（扩展标准 RequestInit + Tauri ClientOptions） */
export interface RequestConfig extends RequestInit, ClientOptions {
  /** 是否在请求中自动携带 token（默认 true） */
  withToken?: boolean
  /** 请求超时时间（毫秒），默认 30s */
  timeout?: number
}

/** 业务错误 */
export class ApiError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: any,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ======================== 配置 ========================

/** 基础 URL — 根据环境自动切换 */
let baseURL = ''

/** 设置基础 URL */
export function setBaseURL(url: string) {
  baseURL = url.replace(/\/+$/, '') // 去除末尾斜杠
}

/** 获取当前基础 URL */
export function getBaseURL(): string {
  return baseURL
}

/** Token 获取器 — 可外部注入 */
let tokenGetter: (() => string | Promise<string>) | null = null

/** 设置 token 获取函数 */
export function setTokenGetter(getter: () => string | Promise<string>) {
  tokenGetter = getter
}

/** 全局请求拦截器（可选） */
let requestInterceptor: ((config: RequestConfig) => RequestConfig | Promise<RequestConfig>) | null =
  null

export function setRequestInterceptor(
  interceptor: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>,
) {
  requestInterceptor = interceptor
}

/** 全局响应拦截器（可选） */
let responseInterceptor: ((response: ApiResponse) => ApiResponse | Promise<ApiResponse>) | null =
  null

export function setResponseInterceptor(
  interceptor: (response: ApiResponse) => ApiResponse | Promise<ApiResponse>,
) {
  responseInterceptor = interceptor
}

// ======================== 核心请求 ========================

/**
 * 通用请求方法
 */
export async function request<T = any>(
  url: string,
  config: RequestConfig = {},
): Promise<T> {
  // 拼接完整 URL
  const fullURL = url.startsWith('http') ? url : `${baseURL}${url}`

  const { withToken = true, timeout = 30_000, headers: customHeaders, ...restConfig } = config

  // 构建 headers — 统一使用 Record<string, string>
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // 合并自定义 headers
  if (customHeaders) {
    if (customHeaders instanceof Headers) {
      customHeaders.forEach((value, key) => { headers[key] = value })
    } else if (Array.isArray(customHeaders)) {
      customHeaders.forEach(([key, value]) => { headers[key] = value })
    } else {
      Object.assign(headers, customHeaders)
    }
  }

  // 注入 token
  if (withToken && tokenGetter) {
    const token = await tokenGetter()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
  }

  // 构建最终 fetch 配置（去掉自定义字段，只保留 RequestInit + ClientOptions）
  let fetchInit: RequestInit & ClientOptions = {
    ...restConfig,
    headers,
    connectTimeout: timeout,
  }

  // 请求拦截
  if (requestInterceptor) {
    const intercepted = await requestInterceptor({ ...fetchInit, withToken, timeout })
    const { withToken: _w, timeout: _t, ...stripped } = intercepted
    fetchInit = stripped as RequestInit & ClientOptions
  }

  try {
    const response = await fetch(fullURL, fetchInit)

    // HTTP 层错误
    if (!response.ok) {
      throw new ApiError(
        response.status,
        `HTTP Error: ${response.status} ${response.statusText}`,
      )
    }

    // 解析 JSON
    const json: ApiResponse<T> = await response.json()

    // 响应拦截
    if (responseInterceptor) {
      const intercepted = await responseInterceptor(json)
      if (intercepted && 'code' in intercepted) {
        return extractData(intercepted as ApiResponse<T>)
      }
    }

    return extractData(json)
  } catch (error) {
    if (error instanceof ApiError) throw error

    // 网络错误 / 超时等
    const message = error instanceof Error ? error.message : 'Unknown network error'
    throw new ApiError(-1, message)
  }
}

/** 从统一响应结构中提取 data，业务码异常时抛出 ApiError */
function extractData<T>(json: ApiResponse<T>): T {
  // code 为 0 或 200 均视为成功
  if (json.code === 0 || json.code === 200) {
    return json.data
  }
  throw new ApiError(json.code, json.message || 'Business error', json.data)
}

// ======================== 快捷方法 ========================

export function get<T = any>(url: string, params?: Record<string, any>, config?: RequestConfig) {
  // 拼接 query string
  let queryString = ''
  if (params) {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value))
      }
    })
    queryString = `?${searchParams.toString()}`
  }
  return request<T>(`${url}${queryString}`, { ...config, method: 'GET' })
}

export function post<T = any>(url: string, data?: any, config?: RequestConfig) {
  return request<T>(url, {
    ...config,
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  })
}

export function put<T = any>(url: string, data?: any, config?: RequestConfig) {
  return request<T>(url, {
    ...config,
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  })
}

export function del<T = any>(url: string, config?: RequestConfig) {
  return request<T>(url, { ...config, method: 'DELETE' })
}

export function patch<T = any>(url: string, data?: any, config?: RequestConfig) {
  return request<T>(url, {
    ...config,
    method: 'PATCH',
    body: data ? JSON.stringify(data) : undefined,
  })
}

// ======================== 文件上传 ========================

/**
 * 上传文件（multipart/form-data）
 */
export function upload<T = any>(url: string, formData: FormData, config?: RequestConfig) {
  const { headers: customHeaders = {}, ...rest } = config || {}
  // 上传时不设置 Content-Type，让浏览器自动设置 boundary
  return request<T>(url, {
    ...rest,
    method: 'POST',
    body: formData as any,
    headers: {
      ...customHeaders,
      // 不传 Content-Type，由浏览器自动设置 multipart boundary
    },
  })
}

export default request
