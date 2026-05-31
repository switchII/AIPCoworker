export type ApiFormat = 'openai-compatible' | 'anthropic'

export interface ProviderConfig {
  name: string
  baseUrl: string
  format: ApiFormat
  models: { id: string; label: string; contextWindow?: number }[]
}

export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    format: 'openai-compatible',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o', contextWindow: 128000 },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini', contextWindow: 128000 },
      { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', contextWindow: 16385 },
      { id: 'o3-mini', label: 'o3-mini', contextWindow: 200000 },
    ],
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    format: 'anthropic',
    models: [
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', contextWindow: 200000 },
      { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', contextWindow: 200000 },
      { id: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku', contextWindow: 200000 },
    ],
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    format: 'openai-compatible',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek-V3', contextWindow: 64000 },
      { id: 'deepseek-reasoner', label: 'DeepSeek-R1', contextWindow: 64000 },
    ],
  },
  moonshot: {
    name: '月之暗面',
    baseUrl: 'https://api.moonshot.cn',
    format: 'openai-compatible',
    models: [
      { id: 'moonshot-v1-8k', label: 'Moonshot v1-8k', contextWindow: 8192 },
      { id: 'moonshot-v1-32k', label: 'Moonshot v1-32k', contextWindow: 32768 },
      { id: 'moonshot-v1-128k', label: 'Moonshot v1-128k', contextWindow: 128000 },
    ],
  },
  zhipu: {
    name: '智谱 AI',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    format: 'openai-compatible',
    models: [
      { id: 'glm-4-flash', label: 'GLM-4 Flash', contextWindow: 128000 },
      { id: 'glm-4-plus', label: 'GLM-4 Plus', contextWindow: 128000 },
      { id: 'glm-4-air', label: 'GLM-4 Air', contextWindow: 128000 },
      { id: 'glm-4-long', label: 'GLM-4 Long', contextWindow: 1000000 },
    ],
  },
  qwen: {
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    format: 'openai-compatible',
    models: [
      { id: 'qwen-max', label: 'Qwen Max', contextWindow: 32000 },
      { id: 'qwen-plus', label: 'Qwen Plus', contextWindow: 131072 },
      { id: 'qwen-turbo', label: 'Qwen Turbo', contextWindow: 131072 },
    ],
  },
  minimax: {
    name: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    format: 'openai-compatible',
    models: [
      { id: 'abab6.5s-chat', label: 'abab6.5s', contextWindow: 32768 },
      { id: 'abab7-chat-preview', label: 'abab7 Preview', contextWindow: 32768 },
    ],
  },
  siliconflow: {
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn',
    format: 'openai-compatible',
    models: [
      { id: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen2.5 7B', contextWindow: 32768 },
      { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen2.5 72B', contextWindow: 32768 },
      { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek-V3', contextWindow: 64000 },
    ],
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    format: 'openai-compatible',
    models: [
      { id: 'openai/gpt-4o', label: 'GPT-4o', contextWindow: 128000 },
      { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4', contextWindow: 200000 },
      { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', contextWindow: 1000000 },
    ],
  },
  ollama: {
    name: 'Ollama',
    baseUrl: 'http://127.0.0.1:11434',
    format: 'openai-compatible',
    models: [],
  },
  lmstudio: {
    name: 'LM Studio',
    baseUrl: 'http://127.0.0.1:1234/v1',
    format: 'openai-compatible',
    models: [],
  },
  custom: {
    name: '自定义 OpenAI 兼容',
    baseUrl: '',
    format: 'openai-compatible',
    models: [],
  },
}

export const PROVIDER_LIST = Object.entries(PROVIDER_CONFIGS)
  .filter(([k]) => k !== 'custom' && k !== 'ollama' && k !== 'lmstudio')
  .map(([id, cfg]) => ({ id, name: cfg.name, format: cfg.format }))
