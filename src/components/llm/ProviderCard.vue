<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import type { ProviderInstance } from '../../types/agent'
import { useAgentStore } from '../../stores/agentStore'
import { checkProviderHealth } from '../../agent/llm/healthCheck'
import { fetchProviderModels } from '../../agent/llm/modelFetcher'

const props = defineProps<{
  provider: ProviderInstance
}>()

const store = useAgentStore()

const isEditing = ref(false)
const showApiKey = ref(false)
const isChecking = ref(false)
const isFetchingModels = ref(false)
const fetchModelsError = ref('')
const newModelInput = ref('')

const form = reactive({
  name: '',
  apiKey: '',
  baseUrl: '',
  models: [] as { id: string; label: string }[],
})

function initForm() {
  form.name = props.provider.name
  form.apiKey = props.provider.apiKey
  form.baseUrl = props.provider.baseUrl
  form.models = [...props.provider.models]
}

watch(() => props.provider, () => {
  if (!isEditing.value) {
    initForm()
  }
}, { deep: true })

function startEditing() {
  initForm()
  isEditing.value = true
}

function cancelEditing() {
  isEditing.value = false
}

function saveEditing() {
  store.updateProvider(props.provider.id, {
    name: form.name,
    apiKey: form.apiKey,
    baseUrl: form.baseUrl,
    models: form.models,
  })
  isEditing.value = false
}

async function handleValidate() {
  if (isChecking.value) return
  isChecking.value = true
  store.setProviderStatus(props.provider.id, 'checking')
  try {
    const modelId = props.provider.models[0]?.id
    const result = await checkProviderHealth(
      props.provider.baseUrl,
      props.provider.apiKey,
      props.provider.apiFormat,
      modelId,
    )
    if (result.success) {
      store.setProviderStatus(props.provider.id, 'verified', undefined, result.latencyMs)
    } else {
      store.setProviderStatus(props.provider.id, 'failed', result.error, result.latencyMs)
    }
  } catch (e: any) {
    store.setProviderStatus(props.provider.id, 'failed', e.message || '检查失败')
  } finally {
    isChecking.value = false
  }
}

async function handleFetchModels() {
  if (isFetchingModels.value) return
  isFetchingModels.value = true
  fetchModelsError.value = ''
  try {
    const result = await fetchProviderModels(
      form.baseUrl || props.provider.baseUrl,
      form.apiKey || props.provider.apiKey,
      props.provider.apiFormat,
    )
    if (result.success) {
      const existingIds = new Set(form.models.map(m => m.id))
      for (const m of result.models) {
        if (!existingIds.has(m.id)) {
          form.models.push(m)
        }
      }
    } else {
      fetchModelsError.value = result.error || '获取模型列表失败'
    }
  } catch (e: any) {
    fetchModelsError.value = e.message || '获取模型列表失败'
  } finally {
    isFetchingModels.value = false
  }
}

function removeModel(index: number) {
  form.models.splice(index, 1)
}

function addModel() {
  const val = newModelInput.value.trim()
  if (!val) return
  const id = val
  const label = val
  if (!form.models.some(m => m.id === id)) {
    form.models.push({ id, label })
  }
  newModelInput.value = ''
}

function getStatusIcon() {
  switch (props.provider.status) {
    case 'verified': return 'fa-solid fa-circle-check'
    case 'failed': return 'fa-solid fa-xmark'
    case 'checking': return 'fa-solid fa-spinner fa-spin'
    case 'unchecked': return 'fa-solid fa-triangle-exclamation'
    default: return 'fa-solid fa-circle-question'
  }
}

function getStatusColor() {
  switch (props.provider.status) {
    case 'verified': return '#10b981'
    case 'failed': return '#ef4444'
    case 'checking': return '#4285F4'
    case 'unchecked': return '#f59e0b'
    default: return '#999'
  }
}

/** 格式化上下文窗口为可读字符串 */
function formatCtx(tokens?: number): string {
  if (!tokens) return ''
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`
  return String(tokens)
}

function getStatusLabel() {
  switch (props.provider.status) {
    case 'verified': return '已验证'
    case 'failed': return '失败'
    case 'checking': return '检查中'
    case 'unchecked': return '未检查'
    default: return '未知'
  }
}

function handleToggle() {
  store.toggleProvider(props.provider.id)
}

function handleDelete() {
  store.removeProvider(props.provider.id)
}
</script>

<template>
  <div class="provider-card" :class="{ editing: isEditing }">
    <!-- ========== 折叠视图 ========== -->
    <template v-if="!isEditing">
      <div class="card-body">
        <!-- Row 1: 名称 + 状态 + 开关 -->
        <div class="card-row-1">
          <div class="provider-name-section">
            <span class="provider-name">{{ provider.name }}</span>
            <span class="status-badge" :style="{ color: getStatusColor() }">
              <i :class="getStatusIcon() + ' status-icon'"></i>
              <span class="status-text">{{ getStatusLabel() }}</span>
              <span v-if="provider.status === 'verified' && provider.statusLatency" class="status-latency">
                {{ provider.statusLatency }}ms
              </span>
            </span>
          </div>
          <div
            class="toggle-switch"
            :class="{ on: provider.enabled }"
            @click.stop="handleToggle"
          >
            <div class="toggle-thumb"></div>
          </div>
        </div>

        <!-- Row 2: 模型摘要 + 操作 -->
        <div class="card-row-2">
          <div class="model-summary">
            <template v-if="provider.models.length > 0">
              <span
                v-for="m in provider.models.slice(0, 2)"
                :key="m.id"
                class="model-tag"
                :title="(m as any).contextWindow ? `上下文: ${(m as any).contextWindow.toLocaleString()} tokens` : ''"
              >
                {{ m.label }}
                <span v-if="(m as any).contextWindow" class="model-tag-ctx">{{ formatCtx((m as any).contextWindow) }}</span>
              </span>
              <span v-if="provider.models.length > 2" class="model-overflow">
                +{{ provider.models.length - 2 }}
              </span>
            </template>
            <span v-else class="model-empty">暂无模型</span>
          </div>
          <div class="card-actions">
            <button class="action-icon-btn" title="编辑" @click.stop="startEditing">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button
              class="action-icon-btn"
              title="验证"
              :disabled="isChecking"
              @click.stop="handleValidate"
            >
              <i :class="isChecking ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-rotate'"></i>
            </button>
            <button class="action-icon-btn danger" title="删除" @click.stop="handleDelete">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>

        <!-- 状态消息 -->
        <div v-if="provider.status === 'failed' && provider.statusMessage" class="status-error">
          {{ provider.statusMessage }}
        </div>
      </div>
    </template>

    <!-- ========== 编辑视图 ========== -->
    <template v-else>
      <div class="edit-body">
        <div class="form-group">
          <label>名称</label>
          <input v-model="form.name" class="form-input" placeholder="提供商名称" />
        </div>

        <div class="form-group">
          <label>API Key</label>
          <div class="input-with-action">
            <input
              :type="showApiKey ? 'text' : 'password'"
              v-model="form.apiKey"
              class="form-input"
              placeholder="输入 API Key"
            />
            <button class="input-action-btn" @click="showApiKey = !showApiKey">
              <i :class="showApiKey ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"></i>
            </button>
          </div>
        </div>

        <div class="form-group">
          <label>Base URL</label>
          <input v-model="form.baseUrl" class="form-input" placeholder="API 基地址" />
        </div>

        <div class="form-group">
          <label>模型管理</label>
          <div class="model-manage-section">
            <button
              class="action-btn small"
              :disabled="isFetchingModels"
              @click="handleFetchModels"
            >
              <i :class="isFetchingModels ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-cloud-arrow-down'"></i>
              获取模型列表
            </button>
            <span v-if="fetchModelsError" class="fetch-error">{{ fetchModelsError }}</span>

            <div v-if="form.models.length > 0" class="model-list">
              <div v-for="(m, idx) in form.models" :key="m.id + '-' + idx" class="model-item">
                <span class="model-item-label">
                  {{ m.label }}
                  <span v-if="(m as any).contextWindow" class="model-item-ctx">{{ formatCtx((m as any).contextWindow) }}</span>
                </span>
                <button class="model-remove-btn" @click="removeModel(idx)">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>
            <div v-else class="model-empty-hint">暂无模型，请获取或手动添加</div>

            <div class="model-add-row">
              <input
                v-model="newModelInput"
                class="form-input model-add-input"
                placeholder="手动添加模型 ID"
                @keyup.enter="addModel"
              />
              <button class="action-btn small" @click="addModel">
                <i class="fa-solid fa-plus"></i>
              </button>
            </div>
          </div>
        </div>

        <div class="edit-actions">
          <button class="action-btn" @click="cancelEditing">取消</button>
          <button class="action-btn primary" @click="saveEditing">保存</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/settings/provider-card';
</style>
