import type { ApiFormat } from './providerConfigs'

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export function resolveOpenAIBaseUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl)
  if (normalized.endsWith('/v1')) return normalized
  return normalized + '/v1'
}

export function buildFullChatUrl(baseUrl: string, format: ApiFormat): string {
  const normalized = normalizeBaseUrl(baseUrl)
  if (format === 'anthropic') {
    return normalized.endsWith('/messages')
      ? normalized
      : normalized + '/messages'
  }
  const resolved = resolveOpenAIBaseUrl(normalized)
  return resolved.endsWith('/chat/completions')
    ? resolved
    : resolved + '/chat/completions'
}
