<script setup lang="ts">
import { useAgentStore } from '../../stores/agentStore'
import type { MCPServerConfig } from '../../types/integration'
import { mcpManager } from '../../agent/mcp/client'

const props = defineProps<{
  show: boolean
  editing: Partial<MCPServerConfig>
  isEditing: boolean
  testStatus: 'idle' | 'testing' | 'success' | 'error'
  testMessage: string
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  'update:editing': [value: Partial<MCPServerConfig>]
  'update:testStatus': [value: 'idle' | 'testing' | 'success' | 'error']
  'update:testMessage': [value: string]
}>()

const store = useAgentStore()

async function testMCPConnection() {
  if (!props.editing.name) {
    emit('update:testStatus', 'error')
    emit('update:testMessage', '请先填写服务器名称')
    return
  }

  emit('update:testStatus', 'testing')
  emit('update:testMessage', '')

  try {
    const result = await mcpManager.testConnection(props.editing as MCPServerConfig)
    emit('update:testStatus', result.success ? 'success' : 'error')
    emit('update:testMessage', result.message)
  } catch (err) {
    emit('update:testStatus', 'error')
    emit('update:testMessage', err instanceof Error ? err.message : String(err))
  }
}

function saveMCP() {
  if (!props.editing.name) {
    alert('请填写服务器名称')
    return
  }

  if (props.isEditing && props.editing.id) {
    store.updateMCPServer(props.editing.id, props.editing)
  } else {
    const newMCP: MCPServerConfig = {
      ...props.editing as MCPServerConfig,
      id: `mcp-${Date.now()}`,
    }
    store.addMCPServer(newMCP)
  }

  emit('update:show', false)
}

function updateField(field: string, value: any) {
  emit('update:editing', { ...props.editing, [field]: value })
}
</script>

<template>
  <Transition name="dialog">
    <div v-if="show" class="dialog-mask" @click.self="emit('update:show', false)">
      <div class="dialog-content mcp-dialog">
        <div class="dialog-header">
          <h3>{{ isEditing ? '编辑 MCP 服务器' : '添加 MCP 服务器' }}</h3>
          <button class="dialog-close" @click="emit('update:show', false)">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="dialog-body">
          <div class="form-group">
            <label>服务器名称 *</label>
            <input :value="editing.name" @input="updateField('name', ($event.target as HTMLInputElement).value)" class="form-input" placeholder="例如：GitHub MCP" />
          </div>

          <div class="form-group">
            <label>传输类型</label>
            <select :value="editing.transport" @change="updateField('transport', ($event.target as HTMLSelectElement).value)" class="form-select">
              <option value="stdio">stdio (标准输入输出)</option>
              <option value="http">HTTP (Streamable HTTP)</option>
              <option value="sse">SSE (Server-Sent Events)</option>
            </select>
          </div>

          <template v-if="editing.transport === 'stdio'">
            <div class="form-group">
              <label>命令 *</label>
              <input :value="editing.command" @input="updateField('command', ($event.target as HTMLInputElement).value)" class="form-input" placeholder="npx @modelcontextprotocol/server-..." />
            </div>
            <div class="form-group">
              <label>参数</label>
              <input
                class="form-input"
                placeholder="用逗号分隔参数，例如：arg1,arg2"
                @change="updateField('args', ($event.target as HTMLInputElement).value.split(',').map((s: string) => s.trim()).filter((s: string) => s))"
              />
            </div>
          </template>

          <template v-if="editing.transport === 'http' || editing.transport === 'sse'">
            <div class="form-group">
              <label>URL *</label>
              <input :value="editing.url" @input="updateField('url', ($event.target as HTMLInputElement).value)" class="form-input" :placeholder="editing.transport === 'sse' ? 'https://example.com/mcps/xxx/sse' : 'http://localhost:3000/mcp'" />
            </div>

            <div class="form-group">
              <label>认证方式</label>
              <select :value="editing.authType" @change="updateField('authType', ($event.target as HTMLSelectElement).value)" class="form-select">
                <option value="none">无</option>
                <option value="bearer">Bearer Token</option>
                <option value="apikey">API Key</option>
                <option value="basic">Basic Auth</option>
              </select>
            </div>

            <div v-if="editing.authType === 'bearer'" class="form-group">
              <label>API Key / Token</label>
              <input
                :value="editing.apiKey"
                @input="updateField('apiKey', ($event.target as HTMLInputElement).value)"
                class="form-input"
                type="password"
                placeholder="输入你的 API Key 或 Token"
              />
              <div class="form-hint">将以 "Bearer {token}" 格式添加到 Authorization 头</div>
            </div>

            <div v-if="editing.authType === 'apikey'" class="form-group">
              <div class="form-row">
                <div class="form-group half">
                  <label>Header 名称</label>
                  <input
                    :value="editing.apiKeyHeader"
                    @input="updateField('apiKeyHeader', ($event.target as HTMLInputElement).value)"
                    class="form-input"
                    placeholder="例如：X-API-Key"
                  />
                </div>
                <div class="form-group half">
                  <label>API Key</label>
                  <input
                    :value="editing.apiKey"
                    @input="updateField('apiKey', ($event.target as HTMLInputElement).value)"
                    class="form-input"
                    type="password"
                    placeholder="输入 API Key"
                  />
                </div>
              </div>
            </div>
          </template>

          <div class="form-group">
            <label>超时 (毫秒)</label>
            <input type="number" :value="editing.timeout" @input="updateField('timeout', Number(($event.target as HTMLInputElement).value))" class="form-input" />
          </div>

          <div class="form-group">
            <div class="test-row">
              <button class="test-connection-btn" @click="testMCPConnection" :disabled="testStatus === 'testing'">
                <i v-if="testStatus === 'testing'" class="fa-solid fa-spinner fa-spin"></i>
                <i v-else class="fa-solid fa-plug"></i>
                {{ testStatus === 'testing' ? '测试中...' : '测试连接' }}
              </button>
              <span v-if="testStatus === 'success'" class="test-status success">
                <i class="fa-solid fa-check-circle"></i> {{ testMessage }}
              </span>
              <span v-if="testStatus === 'error'" class="test-status error">
                <i class="fa-solid fa-exclamation-circle"></i> {{ testMessage }}
              </span>
            </div>
          </div>
        </div>

        <div class="dialog-footer">
          <button class="dialog-btn" @click="emit('update:show', false)">取消</button>
          <button class="dialog-btn primary" @click="saveMCP">
            {{ isEditing ? '保存' : '添加' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
