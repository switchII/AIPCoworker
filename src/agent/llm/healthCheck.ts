import type { ApiFormat } from './providerConfigs'
import { buildFullChatUrl } from './urlUtils'

export interface HealthCheckResult {
  success: boolean
  latencyMs?: number
  error?: string
}

export async function checkProviderHealth(
  baseUrl: string,
  apiKey: string,
  format: ApiFormat,
  modelId?: string,
): Promise<HealthCheckResult> {
  if (!baseUrl.trim()) {
    return { success: false, error: '未填写 API 地址' }
  }

  const url = buildFullChatUrl(baseUrl, format)
  const testModel = modelId || 'gpt-3.5-turbo'

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const body: any = {
      model: testModel,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
    }

    const start = Date.now()
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const latencyMs = Date.now() - start

    if (res.ok) {
      return { success: true, latencyMs }
    }

    const errorText = await res.text().catch(() => '')
    if (res.status === 401 || res.status === 403) {
      return { success: false, error: 'API Key 无效', latencyMs }
    }
    if (res.status === 429) {
      return { success: false, error: '请求频率过高', latencyMs }
    }
    return { success: false, error: `HTTP ${res.status}: ${errorText.slice(0, 100)}`, latencyMs }
  } catch (e: any) {
    return { success: false, error: e.message || '网络错误' }
  }
}
