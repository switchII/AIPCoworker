<script setup lang="ts">
import { ref } from 'vue'
import { useAgentStore } from '../../stores/agentStore'
import type { MCPServerConfig } from '../../types/integration'
import MCPDialog from './MCPDialog.vue'

const store = useAgentStore()

const showMCPDialog = ref(false)
const editingMCP = ref<Partial<MCPServerConfig>>({})
const isEditingMCP = ref(false)
const mcpTestStatus = ref<'idle' | 'testing' | 'success' | 'error'>('idle')
const mcpTestMessage = ref('')

function openCreateMCP() {
  editingMCP.value = {
    name: '',
    transport: 'stdio',
    command: '',
    args: [],
    env: {},
    authType: 'none',
    apiKey: '',
    apiKeyHeader: 'Authorization',
    enabled: true,
    timeout: 30000,
  }
  isEditingMCP.value = false
  mcpTestStatus.value = 'idle'
  mcpTestMessage.value = ''
  showMCPDialog.value = true
}

function openEditMCP(server: MCPServerConfig) {
  editingMCP.value = { ...server }
  isEditingMCP.value = true
  mcpTestStatus.value = 'idle'
  mcpTestMessage.value = ''
  showMCPDialog.value = true
}

function deleteMCP(server: MCPServerConfig) {
  if (confirm(`确定要删除 MCP 服务器 "${server.name}" 吗？`)) {
    store.removeMCPServer(server.id)
  }
}

function toggleMCP(server: MCPServerConfig) {
  store.toggleMCPServer(server.id)
}
</script>

<template>
  <div class="content-section">
    <h1>连接器与 MCP</h1>
    <p class="section-desc">管理 MCP 服务器的连接和配置。</p>

    <div class="mcp-header">
      <h2>MCP 服务器</h2>
      <button class="add-mcp-btn" @click="openCreateMCP">
        <i class="fa-solid fa-plus"></i> 添加 MCP 服务器
      </button>
    </div>

    <div v-if="store.mcpServers.length === 0" class="mcp-empty">
      <i class="fa-solid fa-server"></i>
      <p>暂无 MCP 服务器，点击添加按钮添加</p>
    </div>

    <div v-else class="mcp-list">
      <div v-for="server in store.mcpServers" :key="server.id" class="mcp-card">
        <div class="mcp-card-info">
          <div class="mcp-icon">
            <i class="fa-solid fa-server"></i>
          </div>
          <div class="mcp-details">
            <div class="mcp-name">{{ server.name }}</div>
            <div class="mcp-meta">
              <span class="mcp-transport">{{ server.transport.toUpperCase() }}</span>
              <span v-if="server.command" class="mcp-command">{{ server.command }}</span>
              <span v-if="server.url" class="mcp-url">{{ server.url }}</span>
            </div>
          </div>
        </div>
        <div class="mcp-card-actions">
          <button class="test-btn" @click="openEditMCP(server)" title="编辑">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="delete-btn" @click="deleteMCP(server)" title="删除">
            <i class="fa-solid fa-trash"></i>
          </button>
          <div class="toggle-switch" :class="{ on: server.enabled }" @click="toggleMCP(server)">
            <div class="toggle-thumb"></div>
          </div>
        </div>
      </div>
    </div>

    <MCPDialog
      v-model:show="showMCPDialog"
      v-model:editing="editingMCP"
      :is-editing="isEditingMCP"
      :test-status="mcpTestStatus"
      :test-message="mcpTestMessage"
      @update:test-status="mcpTestStatus = $event"
      @update:test-message="mcpTestMessage = $event"
    />
  </div>
</template>
