import { ref } from 'vue'
import type { LLMConfig, ModelCapability } from '../../types/agent'

export function useLLMConfig() {
  const llmConfig = ref<LLMConfig>({
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    maxOutputTokens: 4096,
    contextWindowSize: 128000,
    temperature: 0.7,
    enableThinking: false,
    thinkingBudget: 10000,
  })

  const modelCapabilities = ref<ModelCapability[]>([
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextWindow: 128000, maxOutput: 16384, supportsVision: true, supportsThinking: false, supportsFunctionCalling: true },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', contextWindow: 128000, maxOutput: 16384, supportsVision: true, supportsThinking: false, supportsFunctionCalling: true },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', contextWindow: 16385, maxOutput: 4096, supportsVision: false, supportsThinking: false, supportsFunctionCalling: true },
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', contextWindow: 200000, maxOutput: 16000, supportsVision: true, supportsThinking: true, supportsFunctionCalling: true },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', contextWindow: 200000, maxOutput: 8192, supportsVision: true, supportsThinking: true, supportsFunctionCalling: true },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic', contextWindow: 200000, maxOutput: 4096, supportsVision: true, supportsThinking: false, supportsFunctionCalling: true },
    { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek', contextWindow: 64000, maxOutput: 8192, supportsVision: false, supportsThinking: true, supportsFunctionCalling: true },
    { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', provider: 'deepseek', contextWindow: 64000, maxOutput: 8192, supportsVision: false, supportsThinking: true, supportsFunctionCalling: true },
    { id: 'qwen-max', name: 'Qwen Max', provider: 'qwen', contextWindow: 32000, maxOutput: 8192, supportsVision: true, supportsThinking: false, supportsFunctionCalling: true },
    { id: 'qwen-plus', name: 'Qwen Plus', provider: 'qwen', contextWindow: 131072, maxOutput: 8192, supportsVision: true, supportsThinking: false, supportsFunctionCalling: true },
    { id: 'doubao-pro-32k', name: 'Doubao Pro 32K', provider: 'doubao', contextWindow: 32000, maxOutput: 4096, supportsVision: false, supportsThinking: false, supportsFunctionCalling: true },
    { id: 'moonshot-v1-128k', name: 'Moonshot 128K', provider: 'moonshot', contextWindow: 128000, maxOutput: 4096, supportsVision: false, supportsThinking: false, supportsFunctionCalling: true },
  ])

  function saveLLMConfig(config: Partial<LLMConfig>) {
    Object.assign(llmConfig.value, config)
  }

  return { llmConfig, modelCapabilities, saveLLMConfig }
}
