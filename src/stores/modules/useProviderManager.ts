import { ref } from 'vue'
import type { ProviderInstance, ActiveModel } from '../../types/agent'

export function useProviderManager(persistState: () => void) {
  const providers = ref<ProviderInstance[]>([])
  const activeModel = ref<ActiveModel>({ providerId: '', modelId: '' })

  function addProvider(config: Omit<ProviderInstance, 'id' | 'status' | 'sortOrder'>): string {
    const id = `provider-${Date.now()}`
    providers.value.push({
      ...config,
      id,
      status: 'unchecked',
      sortOrder: providers.value.length,
    })
    persistState()
    if (!activeModel.value.providerId) {
      activeModel.value = { providerId: id, modelId: config.models[0]?.id || '' }
    }
    return id
  }

  function updateProvider(id: string, patch: Partial<ProviderInstance>) {
    const idx = providers.value.findIndex(p => p.id === id)
    if (idx >= 0) Object.assign(providers.value[idx], patch)
    persistState()
  }

  function removeProvider(id: string) {
    providers.value = providers.value.filter(p => p.id !== id)
    if (activeModel.value.providerId === id) {
      const next = providers.value.find(p => p.enabled)
      if (next?.models.length) {
        activeModel.value = { providerId: next.id, modelId: next.models[0].id }
      } else {
        activeModel.value = { providerId: '', modelId: '' }
      }
    }
    persistState()
  }

  function toggleProvider(id: string) {
    const p = providers.value.find(p => p.id === id)
    if (p) {
      p.enabled = !p.enabled
      persistState()
    }
  }

  function selectModel(providerId: string, modelId: string) {
    activeModel.value = { providerId, modelId }
  }

  function setProviderStatus(id: string, status: ProviderInstance['status'], message?: string, latency?: number) {
    const p = providers.value.find(p => p.id === id)
    if (p) {
      p.status = status
      if (message !== undefined) p.statusMessage = message
      if (latency !== undefined) p.statusLatency = latency
    }
  }

  function addModelToProvider(providerId: string, model: { id: string; label: string }) {
    const p = providers.value.find(p => p.id === providerId)
    if (p && !p.models.some(m => m.id === model.id)) {
      p.models.push(model)
      persistState()
    }
  }

  function removeModelFromProvider(providerId: string, modelId: string) {
    const p = providers.value.find(p => p.id === providerId)
    if (p) {
      p.models = p.models.filter(m => m.id !== modelId)
      persistState()
    }
  }

  function setProviderModels(providerId: string, models: { id: string; label: string }[]) {
    const p = providers.value.find(p => p.id === providerId)
    if (p) {
      p.models = models
      persistState()
    }
  }

  return {
    providers, activeModel,
    addProvider, updateProvider, removeProvider, toggleProvider,
    selectModel, setProviderStatus, addModelToProvider, removeModelFromProvider, setProviderModels
  }
}
