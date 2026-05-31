<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useAgentStore } from '../../stores/agentStore'
import { usePopoverManager } from '../../utils/popoverManager'

const store = useAgentStore()

const emit = defineEmits<{
  'update:modelId': [id: string]
}>()

const SELECTED_MODEL_KEY = 'aipcowork_selected_model'

const showPopover = ref(false)
const pickerRef = ref<HTMLElement | null>(null)
const searchQuery = ref('')
const selectedId = ref('')
const recentIds = ref<string[]>([])

/** 从 localStorage 恢复上次选中的模型 */
function loadSavedModel(): string {
  try {
    return localStorage.getItem(SELECTED_MODEL_KEY) || ''
  } catch { return '' }
}

/** 将选中的模型 ID 持久化到 localStorage */
function saveSelectedModel(id: string) {
  try {
    localStorage.setItem(SELECTED_MODEL_KEY, id)
  } catch { /* ignore */ }
}
const { openPopover: notifyOtherPopovers } = usePopoverManager('model-picker', showPopover)

interface ModelOption {
  id: string
  label: string
  providerName: string
  /** 模型上下文窗口大小（token 数） */
  contextWindow?: number
}

/** 格式化上下文窗口为可读字符串 */
function formatContextWindow(tokens?: number): string {
  if (!tokens) return ''
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`
  return String(tokens)
}

const allModels = computed<ModelOption[]>(() => {
  const models: ModelOption[] = []
  for (const p of store.providers) {
    if (!p.enabled) continue
    for (const m of p.models) {
      if (!models.some(existing => existing.id === m.id)) {
        models.push({
          id: m.id,
          label: m.label || m.id,
          providerName: p.name,
          contextWindow: (m as any).contextWindow,
        })
      }
    }
  }
  return models
})

const recentModels = computed<ModelOption[]>(() => {
  return recentIds.value
    .map(id => allModels.value.find(m => m.id === id))
    .filter((m): m is ModelOption => !!m)
})

const filteredModels = computed<ModelOption[]>(() => {
  const q = searchQuery.value.toLowerCase()
  if (!q) return allModels.value
  return allModels.value.filter(m =>
    m.label.toLowerCase().includes(q) ||
    m.id.toLowerCase().includes(q) ||
    m.providerName.toLowerCase().includes(q)
  )
})

const displayLabel = computed(() => {
  if (!selectedId.value) return '选择模型'
  const found = allModels.value.find(m => m.id === selectedId.value)
  return found?.label || selectedId.value
})

function selectModel(model: ModelOption) {
  selectedId.value = model.id
  saveSelectedModel(model.id)
  if (!recentIds.value.includes(model.id)) {
    recentIds.value.unshift(model.id)
    if (recentIds.value.length > 10) recentIds.value.pop()
  } else {
    recentIds.value = recentIds.value.filter(id => id !== model.id)
    recentIds.value.unshift(model.id)
  }
  showPopover.value = false
  emit('update:modelId', model.id)
}

function togglePopover() {
  if (!showPopover.value) {
    notifyOtherPopovers()
  }
  showPopover.value = !showPopover.value
  if (showPopover.value) {
    searchQuery.value = ''
  }
}

function handleClickOutside(e: MouseEvent) {
  if (pickerRef.value && !pickerRef.value.contains(e.target as Node)) {
    showPopover.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  // 优先恢复上次选中的模型，否则自动选择第一个
  const saved = loadSavedModel()
  if (saved && allModels.value.some(m => m.id === saved)) {
    selectedId.value = saved
    emit('update:modelId', saved)
  } else if (!selectedId.value && allModels.value.length > 0) {
    selectModel(allModels.value[0])
  }
})

// 监听模型列表变化，当模型加载后自动选择
watch(allModels, (models) => {
  if (selectedId.value) return  // 已有选中项，不自动切换
  const saved = loadSavedModel()
  if (saved && models.some(m => m.id === saved)) {
    selectedId.value = saved
    emit('update:modelId', saved)
  } else if (models.length > 0) {
    selectModel(models[0])
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="model-picker" ref="pickerRef">
    <button class="mp-chip" @click.stop="togglePopover">
      <span class="mp-chip-label">{{ displayLabel }}</span>
      <i class="fa-solid fa-chevron-down mp-chevron" :class="{ rotated: showPopover }"></i>
    </button>

    <Transition name="drop">
      <div v-if="showPopover" class="mp-popover" @click.stop>
        <div class="mp-search-bar">
          <i class="fa-solid fa-magnifying-glass mp-search-icon"></i>
          <input
            v-model="searchQuery"
            class="mp-search-input"
            placeholder="搜索…"
            autofocus
          />
        </div>

        <div v-if="!searchQuery && recentModels.length > 0" class="mp-group">
          <div class="mp-group-header">
            <i class="fa-solid fa-clock mp-group-icon"></i>
            <span>RECENT</span>
          </div>
          <div
            v-for="m in recentModels"
            :key="'recent-' + m.id"
            class="mp-item"
            :class="{ selected: selectedId === m.id }"
            @click="selectModel(m)"
          >
            <div class="mp-item-info">
              <span class="mp-item-name">{{ m.label }}</span>
              <span class="mp-item-provider">
                {{ m.providerName }}
                <span v-if="m.contextWindow" class="mp-item-context" :title="`上下文窗口: ${m.contextWindow.toLocaleString()} tokens`">
                  · {{ formatContextWindow(m.contextWindow) }}
                </span>
              </span>
            </div>
            <i v-if="selectedId === m.id" class="fa-solid fa-check mp-item-check"></i>
          </div>
        </div>

        <div class="mp-group">
          <div class="mp-group-header">
            <span>{{ searchQuery ? '搜索结果' : '全部模型' }}</span>
          </div>
          <div v-if="filteredModels.length === 0" class="mp-empty">
            暂无匹配模型
          </div>
          <div
            v-for="m in filteredModels"
            :key="m.id"
            class="mp-item"
            :class="{ selected: selectedId === m.id }"
            @click="selectModel(m)"
          >
            <div class="mp-item-info">
              <span class="mp-item-name">{{ m.label }}</span>
              <span class="mp-item-provider">
                {{ m.providerName }}
                <span v-if="m.contextWindow" class="mp-item-context" :title="`上下文窗口: ${m.contextWindow.toLocaleString()} tokens`">
                  · {{ formatContextWindow(m.contextWindow) }}
                </span>
              </span>
            </div>
            <i v-if="selectedId === m.id" class="fa-solid fa-check mp-item-check"></i>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.model-picker {
  position: relative;
}

.mp-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  background: #F7F7F7;
  border: 1px solid #EAEAEA;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  transition: background 0.15s, border-color 0.15s;
  user-select: none;
  white-space: nowrap;
}
.mp-chip:hover {
  background: #EFEFEF;
  border-color: #D5D5D5;
}
.mp-chip-label {
  color: #1A1A1A;
  font-weight: 500;
}
.mp-chevron {
  font-size: 9px;
  color: #999;
  transition: transform 0.2s;
  flex-shrink: 0;
}
.mp-chevron.rotated {
  transform: rotate(180deg);
}

.mp-popover {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  width: 320px;
  max-height: 400px;
  overflow-y: auto;
  background: #FFF;
  border: 1px solid #EAEAEA;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  z-index: 200;
  padding: 0;
}

.mp-search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid #F0F0F0;
}
.mp-search-icon {
  font-size: 15px;
  color: #BBB;
  flex-shrink: 0;
}
.mp-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  font-family: inherit;
  color: #1A1A1A;
}
.mp-search-input::placeholder {
  color: #BBB;
}

.mp-group {
  padding: 4px 0;
}
.mp-group + .mp-group {
  border-top: 1px solid #F0F0F0;
}
.mp-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px 6px;
  font-size: 11px;
  font-weight: 600;
  color: #999;
  letter-spacing: 0.5px;
}
.mp-group-icon {
  font-size: 12px;
  color: #CCC;
}

.mp-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.12s;
}
.mp-item:hover {
  background: #F5F5F5;
}
.mp-item.selected {
  background: #F0F7FF;
}
.mp-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.mp-item-name {
  font-size: 13px;
  color: #1A1A1A;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mp-item-provider {
  font-size: 11px;
  color: #AAA;
}
.mp-item-context {
  color: #2563EB;
  font-weight: 500;
}
.mp-item-check {
  font-size: 14px;
  color: #2563EB;
  flex-shrink: 0;
  margin-left: 10px;
}

.mp-empty {
  padding: 20px 16px;
  text-align: center;
  font-size: 13px;
  color: #BBB;
}

.drop-enter-active { transition: opacity 0.15s, transform 0.15s; }
.drop-leave-active { transition: opacity 0.1s, transform 0.1s; }
.drop-enter-from { opacity: 0; transform: translateY(4px); }
.drop-leave-to   { opacity: 0; transform: translateY(4px); }
</style>
