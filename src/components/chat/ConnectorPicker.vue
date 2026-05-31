<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAgentStore } from '../../stores/agentStore'
import type { ConnectorConfig, ConnectorType } from '../../types/integration'

const emit = defineEmits<{
  'update:connectorIds': [ids: string[]]
}>()

const store = useAgentStore()

// 已启用的连接器
const enabledConnectors = computed(() =>
  store.connectors.filter(c => c.enabled)
)

const selectedConnectorIds = ref<Set<string>>(new Set())

const selectedConnectorItems = computed(() =>
  enabledConnectors.value.filter(c => selectedConnectorIds.value.has(c.id))
)

function toggleConnector(id: string) {
  const s = new Set(selectedConnectorIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedConnectorIds.value = s
  emitUpdate()
}

function isConnectorSelected(id: string) {
  return selectedConnectorIds.value.has(id)
}

function emitUpdate() {
  emit('update:connectorIds', Array.from(selectedConnectorIds.value))
}

// 按类型分组
const groupedConnectors = computed(() => {
  const groups: { type: ConnectorType; label: string; icon: string; color: string; items: ConnectorConfig[] }[] = [
    { type: 'ssh',        label: 'SSH',        icon: 'fa-solid fa-terminal', color: '#10B981', items: [] },
    { type: 'mysql',      label: 'MySQL',      icon: 'fa-solid fa-database', color: '#2563EB', items: [] },
    { type: 'postgresql', label: 'PostgreSQL', icon: 'fa-solid fa-database', color: '#7C3AED', items: [] },
  ]
  for (const c of enabledConnectors.value) {
    const g = groups.find(g => g.type === c.type)
    if (g) g.items.push(c)
  }
  return groups.filter(g => g.items.length > 0)
})

function getHostBrief(conn: ConnectorConfig): string {
  if (conn.type === 'ssh') return `${conn.ssh?.host || ''}:${conn.ssh?.port || 22}`
  return `${conn.db?.host || ''}:${conn.db?.port || 3306}`
}

// ---- popover state ----
const showPopover = ref(false)
const pickerRef = ref<HTMLElement | null>(null)

function togglePopover() {
  showPopover.value = !showPopover.value
}

function handleClickOutside(e: MouseEvent) {
  if (pickerRef.value && !pickerRef.value.contains(e.target as Node)) {
    showPopover.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))

defineExpose({ selectedConnectorItems, toggleConnector })
</script>

<template>
  <div class="conn-picker-wrapper" ref="pickerRef">
    <button class="conn-picker-trigger" title="选择连接器" @click.stop="togglePopover">
      <i class="fa-solid fa-plug"></i>
      <span v-if="selectedConnectorItems.length > 0" class="conn-count">{{ selectedConnectorItems.length }}</span>
    </button>

    <Transition name="drop">
      <div v-if="showPopover" class="conn-popover" @click.stop>
        <div class="conn-popover-header">
          <span class="conn-popover-title">选择连接器</span>
          <span class="conn-popover-count">{{ selectedConnectorItems.length }} / {{ enabledConnectors.length }}</span>
        </div>

        <div v-if="enabledConnectors.length === 0" class="conn-popover-empty">
          <i class="fa-solid fa-plug-circle-xmark"></i>
          <p>暂无已启用的连接器</p>
          <router-link to="/connectors" class="conn-add-link">去添加</router-link>
        </div>

        <div v-else class="conn-popover-list">
          <template v-for="group in groupedConnectors" :key="group.type">
            <div class="conn-group-label">
              <i :class="group.icon" :style="{ color: group.color }"></i>
              <span>{{ group.label }}</span>
            </div>
            <div
              v-for="conn in group.items"
              :key="conn.id"
              class="conn-popover-item"
              :class="{ selected: isConnectorSelected(conn.id) }"
              @click.stop="toggleConnector(conn.id)"
            >
              <div class="conn-item-icon" :style="{ background: group.color + '18', color: group.color }">
                <i :class="group.icon"></i>
              </div>
              <div class="conn-item-info">
                <span class="conn-item-name">{{ conn.name }}</span>
                <span class="conn-item-host">{{ getHostBrief(conn) }}</span>
              </div>
              <i v-if="isConnectorSelected(conn.id)" class="fa-solid fa-check conn-item-check"></i>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.conn-picker-wrapper { position: relative; }

.conn-picker-trigger {
  height: 30px;
  padding: 0 10px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: #999;
  font-size: 14px;
  font-family: inherit;
  transition: background 0.15s, color 0.15s;
}
.conn-picker-trigger:hover { background: #F0F0F0; color: #333; }

.conn-count {
  min-width: 16px; height: 16px; padding: 0 4px;
  background: #10B981; color: #FFF;
  border-radius: 8px; font-size: 11px; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
}

.conn-popover {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  min-width: 290px;
  max-width: 340px;
  background: #FFF;
  border: 1px solid #EAEAEA;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  z-index: 200;
  overflow: hidden;
}

.conn-popover-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #F0F0F0;
  background: #FAFAFA;
}
.conn-popover-title { font-size: 13px; font-weight: 600; color: #1A1A1A; }
.conn-popover-count { font-size: 12px; color: #999; }

.conn-popover-empty {
  padding: 32px 20px;
  text-align: center; color: #999;
}
.conn-popover-empty i { font-size: 32px; color: #CCC; margin-bottom: 8px; display: block; }
.conn-popover-empty p { margin: 0 0 12px 0; font-size: 13px; }
.conn-add-link { font-size: 13px; color: #2563EB; text-decoration: none; }
.conn-add-link:hover { text-decoration: underline; }

.conn-popover-list {
  max-height: 340px; overflow-y: auto; padding: 6px 0;
}

.conn-group-label {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px 4px;
  font-size: 11px; font-weight: 600; color: #888;
  letter-spacing: 0.3px;
}
.conn-group-label i { font-size: 12px; }

.conn-popover-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 14px; cursor: pointer;
  transition: background 0.12s; user-select: none;
}
.conn-popover-item:hover { background: #F5F5F5; }
.conn-popover-item.selected { background: #F0FFF4; }

.conn-item-icon {
  width: 30px; height: 30px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; flex-shrink: 0;
}
.conn-item-info {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 2px;
}
.conn-item-name {
  font-size: 13px; color: #1A1A1A; font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.conn-item-host {
  font-size: 11px; color: #AAA;
  font-family: 'SF Mono', Consolas, monospace;
}
.conn-item-check { font-size: 12px; color: #10B981; flex-shrink: 0; }

.drop-enter-active { transition: opacity 0.15s, transform 0.15s; }
.drop-leave-active { transition: opacity 0.1s, transform 0.1s; }
.drop-enter-from { opacity: 0; transform: translateY(4px); }
.drop-leave-to   { opacity: 0; transform: translateY(4px); }
</style>
