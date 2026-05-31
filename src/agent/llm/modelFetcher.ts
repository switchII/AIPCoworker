import type { ApiFormat } from './providerConfigs'

export interface ModelInfo {
  id: string
  label: string
  /** 模型上下文窗口大小（token 数），如果 API 返回了该字段 */
  contextWindow?: number
}

interface FetchModelsResult {
  success: boolean
  models: ModelInfo[]
  error?: string
}

/** 已知的模型上下文窗口映射（用于 API 不返回 context_window 的情况） */
const KNOWN_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-3.5-turbo': 16385,
  'o3-mini': 200000,
  'deepseek-chat': 64000,
  'deepseek-reasoner': 64000,
  'qwen-max': 32000,
  'qwen-plus': 131072,
  'qwen-turbo': 131072,
  'glm-4-flash': 128000,
  'glm-4-plus': 128000,
  'glm-4-air': 128000,
  'glm-4-long': 1000000,
}

export async function fetchProviderModels(
  baseUrl: string,
  apiKey: string,
  format: ApiFormat,
): Promise<FetchModelsResult> {
  if (!baseUrl.trim()) {
    return { success: false, models: [], error: '未填写 API 地址' }
  }

  if (format === 'anthropic') {
    return { success: false, models: [], error: 'Anthropic API 不支持获取模型列表' }
  }

  try {
    const apiUrl = baseUrl.trim().replace(/\/+$/, '') + '/models'
    const headers: Record<string, string> = {}
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const res = await fetch(apiUrl, { headers })
    if (!res.ok) {
      return { success: false, models: [], error: `HTTP ${res.status}` }
    }

    const data = await res.json()
    const models: ModelInfo[] = (data.data || [])
      .filter((m: any) => {
        const id = (m.id || '').toLowerCase()
        if (id.includes('embedding') || id.includes('whisper')
          || id.includes('tts') || id.includes('dall-e')
          || id.includes('moderation')) {
          return false
        }
        return true
      })
      .map((m: any) => {
        const id = m.id
        const info: ModelInfo = { id, label: id }
        // 优先使用 API 返回的 context_window，否则查已知映射表
        if (typeof m.context_window === 'number' && m.context_window > 0) {
          info.contextWindow = m.context_window
        } else if (KNOWN_CONTEXT_WINDOWS[id]) {
          info.contextWindow = KNOWN_CONTEXT_WINDOWS[id]
        }
        return info
      })

    return { success: true, models }
  } catch (e: any) {
    return { success: false, models: [], error: e.message || '获取失败' }
  }
}
