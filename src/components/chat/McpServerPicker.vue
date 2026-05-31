<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAgentStore } from '../../stores/agentStore'
import { usePopoverManager } from '../../utils/popoverManager'

const emit = defineEmits<{
  'update:mcpServerIds': [ids: string[]]
}>()

const store = useAgentStore()

// 获取已启用的 MCP 服务器
const enabledMCPServers = computed(() => 
  store.mcpServers.filter(s => s.enabled)
)

const selectedMCPServerIds = ref<Set<string>>(new Set())

const selectedMCPServerItems = computed(() =>
  enabledMCPServers.value.filter(s => selectedMCPServerIds.value.has(s.id))
)

function toggleMCPServer(id: string) {
  const s = new Set(selectedMCPServerIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedMCPServerIds.value = s
  emitUpdate()
}

function isMCPServerSelected(id: string) {
  return selectedMCPServerIds.value.has(id)
}

function emitUpdate() {
  emit('update:mcpServerIds', Array.from(selectedMCPServerIds.value))
}

// ---- popover state ----
const showPopover = ref(false)
const pickerRef = ref<HTMLElement | null>(null)

const { openPopover: notifyOtherPopovers } = usePopoverManager('mcp-picker', showPopover)

function togglePopover() {
  if (!showPopover.value) {
    notifyOtherPopovers()
  }
  showPopover.value = !showPopover.value
}

function handleClickOutside(e: MouseEvent) {
  if (pickerRef.value && !pickerRef.value.contains(e.target as Node)) {
    showPopover.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))

defineExpose({ selectedMCPServerItems, toggleMCPServer })
</script>

<template>
  <div class="mcp-picker-wrapper" ref="pickerRef">
    <button class="mcp-picker-trigger" title="选择 MCP 服务器" @click.stop="togglePopover">
      <i class="fa-solid fa-plug"></i>
      <span v-if="selectedMCPServerItems.length > 0" class="mcp-count">{{ selectedMCPServerItems.length }}</span>
    </button>

    <Transition name="drop">
      <div v-if="showPopover" class="mcp-popover" @click.stop>
        <div class="mcp-popover-header">
          <span class="mcp-popover-title">选择 MCP 服务器</span>
          <span class="mcp-popover-count">{{ selectedMCPServerItems.length }} / {{ enabledMCPServers.length }}</span>
        </div>

        <div v-if="enabledMCPServers.length === 0" class="mcp-popover-empty">
          <i class="fa-solid fa-server"></i>
          <p>暂无已启用的 MCP 服务器</p>
          <router-link to="/settings?tab=connectors" class="mcp-add-link">
            去添加
          </router-link>
        </div>

        <div v-else class="mcp-popover-list">
          <div
            v-for="server in enabledMCPServers"
            :key="server.id"
            class="mcp-popover-item"
            :class="{ selected: isMCPServerSelected(server.id) }"
            @click.stop="toggleMCPServer(server.id)"
          >
            <div class="mcp-item-icon">
              <i class="fa-solid fa-server"></i>
            </div>
            <div class="mcp-item-info">
              <span class="mcp-item-name">{{ server.name }}</span>
              <span class="mcp-item-transport">{{ server.transport.toUpperCase() }}</span>
            </div>
            <i v-if="isMCPServerSelected(server.id)" class="fa-solid fa-check mcp-item-check"></i>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.mcp-picker-wrapper { position: relative; }

.mcp-picker-trigger {
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

.mcp-picker-trigger:hover {
  background: #F0F0F0;
  color: #333;
}

.mcp-count {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background: #2563EB;
  color: #FFF;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mcp-popover {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  min-width: 280px;
  max-width: 320px;
  background: #FFF;
  border: 1px solid #EAEAEA;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  z-index: 200;
  overflow: hidden;
}

.mcp-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #F0F0F0;
  background: #FAFAFA;
}

.mcp-popover-title {
  font-size: 13px;
  font-weight: 600;
  color: #1A1A1A;
}

.mcp-popover-count {
  font-size: 12px;
  color: #999;
}

.mcp-popover-empty {
  padding: 32px 20px;
  text-align: center;
  color: #999;
}

.mcp-popover-empty i {
  font-size: 32px;
  color: #CCC;
  margin-bottom: 8px;
  display: block;
}

.mcp-popover-empty p {
  margin: 0 0 12px 0;
  font-size: 13px;
}

.mcp-add-link {
  font-size: 13px;
  color: #2563EB;
  text-decoration: none;
}

.mcp-add-link:hover {
  text-decoration: underline;
}

.mcp-popover-list {
  max-height: 300px;
  overflow-y: auto;
  padding: 6px 0;
}

.mcp-popover-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.12s;
  user-select: none;
}

.mcp-popover-item:hover {
  background: #F5F5F5;
}

.mcp-popover-item.selected {
  background: #F0F7FF;
}

.mcp-item-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #F5F5F5;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #555;
  flex-shrink: 0;
}

.mcp-popover-item.selected .mcp-item-icon {
  background: #E0F2FE;
  color: #2563EB;
}

.mcp-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mcp-item-name {
  font-size: 13px;
  color: #1A1A1A;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mcp-item-transport {
  font-size: 11px;
  color: #999;
  padding: 1px 6px;
  background: #F0F0F0;
  border-radius: 4px;
  display: inline-block;
  width: fit-content;
}

.mcp-item-check {
  font-size: 12px;
  color: #2563EB;
  flex-shrink: 0;
}

.drop-enter-active {
  transition: opacity 0.15s, transform 0.15s;
}

.drop-leave-active {
  transition: opacity 0.1s, transform 0.1s;
}

.drop-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.drop-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
