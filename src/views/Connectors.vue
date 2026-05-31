<script setup lang="ts">
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useAgentStore } from '../stores/agentStore'
import type { ConnectorConfig, ConnectorType } from '../types/integration'

const store = useAgentStore()

// 类型配置
const connectorTypes = [
  { type: 'ssh',        label: 'SSH 服务器',  icon: 'fa-solid fa-terminal',       color: '#10B981', defaultPort: 22 },
  { type: 'mysql',      label: 'MySQL',       icon: 'fa-solid fa-database',       color: '#2563EB', defaultPort: 3306 },
  { type: 'postgresql', label: 'PostgreSQL',  icon: 'fa-solid fa-database',       color: '#7C3AED', defaultPort: 5432 },
] as const

function getTypeConfig(type: ConnectorType) {
  return connectorTypes.find(t => t.type === type) || connectorTypes[0]
}

// ---- 对话框 ----
const showDialog = ref(false)
const isEditing = ref(false)
const formType = ref<ConnectorType>('ssh')

// 连接测试状态
const testStatus = ref<'idle' | 'testing' | 'success' | 'error'>('idle')
const testMessage = ref('')
const testDetails = ref('')

const form = ref({
  id: '',
  name: '',
  description: '',
  host: '',
  port: 22,
  username: '',
  password: '',
  database: '',
  authType: 'password' as 'password' | 'private_key',
  privateKeyPath: '',
  passphrase: '',
  useSSL: false,
  enabled: true,
})

function openCreate(type: ConnectorType) {
  isEditing.value = false
  formType.value = type
  const defaultPort = type === 'ssh' ? 22 : type === 'mysql' ? 3306 : 5432
  form.value = {
    id: '', name: '', description: '',
    host: '', port: defaultPort,
    username: '', password: '', database: '',
    authType: 'password', privateKeyPath: '', passphrase: '',
    useSSL: false, enabled: true,
  }
  testStatus.value = 'idle'
  testMessage.value = ''
  testDetails.value = ''
  showDialog.value = true
}

function openEdit(conn: ConnectorConfig) {
  isEditing.value = true
  formType.value = conn.type
  const isSSH = conn.type === 'ssh'
  form.value = {
    id: conn.id,
    name: conn.name,
    description: conn.description || '',
    host: isSSH ? (conn.ssh?.host || '') : (conn.db?.host || ''),
    port: isSSH ? (conn.ssh?.port || 22) : (conn.db?.port || 3306),
    username: isSSH ? (conn.ssh?.username || '') : (conn.db?.username || ''),
    password: isSSH ? (conn.ssh?.password || '') : (conn.db?.password || ''),
    database: isSSH ? '' : (conn.db?.database || ''),
    authType: (conn.ssh?.authType as 'password' | 'private_key') || 'password',
    privateKeyPath: conn.ssh?.privateKeyPath || '',
    passphrase: conn.ssh?.passphrase || '',
    useSSL: conn.db?.useSSL || false,
    enabled: conn.enabled,
  }
  testStatus.value = 'idle'
  testMessage.value = ''
  testDetails.value = ''
  showDialog.value = true
}

async function testConnection() {
  if (!form.value.host.trim()) {
    testStatus.value = 'error'
    testMessage.value = '请先填写主机地址'
    return
  }

  testStatus.value = 'testing'
  testMessage.value = '正在测试连接...'
  testDetails.value = ''

  try {
    // 构建测试参数（SSH 需要传递认证信息）
    const params: Record<string, unknown> = {
      connType: formType.value,
      host: form.value.host.trim(),
      port: form.value.port,
    }

    // SSH 类型：传递认证参数以进行真实认证测试
    if (formType.value === 'ssh') {
      params.username = form.value.username || undefined
      params.password = form.value.password || undefined
      params.authType = form.value.authType
      params.privateKeyPath = form.value.privateKeyPath || undefined
      params.passphrase = form.value.passphrase || undefined
    }

    const result = await invoke<{ success: boolean; message: string; latency_ms: number; details?: string }>(
      'test_connector',
      params
    )
    if (result.success) {
      testStatus.value = 'success'
      testMessage.value = result.message
      testDetails.value = result.details || ''
    } else {
      testStatus.value = 'error'
      testMessage.value = result.message
    }
  } catch (e: any) {
    testStatus.value = 'error'
    testMessage.value = typeof e === 'string' ? e : (e?.message || String(e))
  }
}

async function saveConnector() {
  if (!form.value.name.trim()) return

  // 如果还没测试过，先测试
  if (testStatus.value !== 'success') {
    await testConnection()
    if ((testStatus.value as string) !== 'success') return
  }

  const f = form.value
  const isSSH = formType.value === 'ssh'

  const conn: ConnectorConfig = {
    id: isEditing.value ? f.id : `conn-${Date.now()}`,
    name: f.name.trim(),
    type: formType.value,
    description: f.description.trim() || undefined,
    enabled: f.enabled,
    createdAt: isEditing.value ? (store.getConnector(f.id)?.createdAt || Date.now()) : Date.now(),
    ssh: isSSH ? {
      host: f.host, port: f.port, username: f.username,
      authType: f.authType,
      password: f.authType === 'password' ? f.password : undefined,
      privateKeyPath: f.authType === 'private_key' ? f.privateKeyPath : undefined,
      passphrase: f.authType === 'private_key' ? f.passphrase : undefined,
    } : undefined,
    db: !isSSH ? {
      host: f.host, port: f.port, username: f.username,
      password: f.password, database: f.database,
      useSSL: f.useSSL,
    } : undefined,
  }

  if (isEditing.value) {
    store.updateConnector(conn.id, conn)
  } else {
    store.addConnector(conn)
  }
  showDialog.value = false
}

function deleteConnector(conn: ConnectorConfig) {
  if (confirm(`确定要删除连接器 "${conn.name}" 吗？`)) {
    store.removeConnector(conn.id)
  }
}

function toggleConnector(conn: ConnectorConfig) {
  store.toggleConnector(conn.id)
}

function getHostInfo(conn: ConnectorConfig): string {
  if (conn.type === 'ssh') {
    return `${conn.ssh?.username || ''}@${conn.ssh?.host || ''}:${conn.ssh?.port || 22}`
  }
  return `${conn.db?.host || ''}:${conn.db?.port || 3306}/${conn.db?.database || ''}`
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>连接器</h1>
      <p class="subtitle">管理远程服务器、数据库连接，让 AI 代理能够直接操作你的中间件</p>
    </div>

    <!-- 快速添加 -->
    <div class="add-section">
      <span class="add-label">添加连接器：</span>
      <button
        v-for="t in connectorTypes"
        :key="t.type"
        class="add-type-btn"
        :style="{ '--btn-color': t.color }"
        @click="openCreate(t.type)"
      >
        <i :class="t.icon"></i>
        <span>{{ t.label }}</span>
      </button>
    </div>

    <!-- 空状态 -->
    <div v-if="store.connectors.length === 0" class="empty-state">
      <i class="fa-solid fa-plug-circle-xmark empty-icon"></i>
      <p class="empty-text">暂无连接器，点击上方按钮添加</p>
      <p class="empty-hint">支持 SSH 远程服务器、MySQL 和 PostgreSQL 数据库</p>
    </div>

    <!-- 连接器卡片网格 -->
    <div class="connectors-grid">
      <div
        v-for="conn in store.connectors"
        :key="conn.id"
        class="connector-card"
        :class="{ enabled: conn.enabled }"
      >
        <!-- 顶部 -->
        <div class="card-top">
          <div class="type-icon" :style="{ background: getTypeConfig(conn.type).color + '18', color: getTypeConfig(conn.type).color }">
            <i :class="getTypeConfig(conn.type).icon"></i>
          </div>
          <span class="type-badge" :style="{ background: getTypeConfig(conn.type).color + '18', color: getTypeConfig(conn.type).color }">
            {{ getTypeConfig(conn.type).label }}
          </span>
        </div>

        <!-- 信息 -->
        <div class="card-info">
          <div class="conn-name-row">
            <span class="conn-name">{{ conn.name }}</span>
          </div>
          <div class="conn-host">{{ getHostInfo(conn) }}</div>
          <div v-if="conn.description" class="conn-desc">{{ conn.description }}</div>
        </div>

        <!-- 操作栏 -->
        <div class="card-actions">
          <button class="action-btn" title="编辑" @click="openEdit(conn)">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="action-btn danger" title="删除" @click="deleteConnector(conn)">
            <i class="fa-solid fa-trash"></i>
          </button>
          <div class="toggle-switch" :class="{ on: conn.enabled }" @click="toggleConnector(conn)">
            <div class="toggle-thumb"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ===== 新建/编辑对话框 ===== -->
  <Transition name="modal">
    <div v-if="showDialog" class="modal-overlay" @click.self="showDialog = false">
      <div class="modal-card">
        <div class="modal-header">
          <i :class="getTypeConfig(formType).icon" :style="{ color: getTypeConfig(formType).color }"></i>
          <span>{{ isEditing ? '编辑' : '新建' }} {{ getTypeConfig(formType).label }}</span>
          <button class="modal-close" @click="showDialog = false">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="modal-body">
          <!-- 名称 -->
          <label class="field-label">名称</label>
          <input v-model="form.name" class="field-input" placeholder="例如：生产服务器 / 测试数据库" />

          <!-- 描述 -->
          <label class="field-label">描述（可选）</label>
          <input v-model="form.description" class="field-input" placeholder="简要说明用途" />

          <div class="field-row">
            <div class="field-group flex-2">
              <label class="field-label">主机地址</label>
              <input v-model="form.host" class="field-input" placeholder="例如：192.168.1.100 / db.example.com" />
            </div>
            <div class="field-group flex-1">
              <label class="field-label">端口</label>
              <input v-model.number="form.port" type="number" class="field-input" />
            </div>
          </div>

          <div class="field-row">
            <div class="field-group flex-1">
              <label class="field-label">用户名</label>
              <input v-model="form.username" class="field-input" placeholder="root / admin" />
            </div>
            <div class="field-group flex-1">
              <label class="field-label">密码</label>
              <input v-model="form.password" type="password" class="field-input" placeholder="留空则每次连接时输入" />
            </div>
          </div>

          <!-- SSH 特有字段 -->
          <template v-if="formType === 'ssh'">
            <div class="field-row">
              <div class="field-group flex-1">
                <label class="field-label">认证方式</label>
                <select v-model="form.authType" class="field-input">
                  <option value="password">密码</option>
                  <option value="private_key">私钥文件</option>
                </select>
              </div>
            </div>
            <template v-if="form.authType === 'private_key'">
              <div class="field-row">
                <div class="field-group flex-2">
                  <label class="field-label">私钥路径</label>
                  <input v-model="form.privateKeyPath" class="field-input" placeholder="~/.ssh/id_rsa" />
                </div>
                <div class="field-group flex-1">
                  <label class="field-label">密钥密码（可选）</label>
                  <input v-model="form.passphrase" type="password" class="field-input" />
                </div>
              </div>
            </template>
          </template>

          <!-- 数据库特有字段 -->
          <template v-if="formType !== 'ssh'">
            <div class="field-row">
              <div class="field-group flex-2">
                <label class="field-label">数据库名</label>
                <input v-model="form.database" class="field-input" placeholder="数据库名称" />
              </div>
              <div class="field-group flex-1">
                <label class="field-label">SSL</label>
                <select v-model="form.useSSL" class="field-input">
                  <option :value="false">关闭</option>
                  <option :value="true">启用</option>
                </select>
              </div>
            </div>
          </template>

          <!-- 连接测试结果 -->
          <div v-if="testStatus !== 'idle'" class="test-result" :class="testStatus">
            <div class="test-result-icon">
              <i v-if="testStatus === 'testing'" class="fa-solid fa-spinner fa-spin"></i>
              <i v-else-if="testStatus === 'success'" class="fa-solid fa-circle-check"></i>
              <i v-else-if="testStatus === 'error'" class="fa-solid fa-xmark"></i>
            </div>
            <div class="test-result-text">
              <span class="test-result-msg">{{ testMessage }}</span>
              <span v-if="testDetails" class="test-result-details">{{ testDetails }}</span>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-cancel" @click="showDialog = false">取消</button>
          <button
            class="btn-test"
            :disabled="!form.host.trim() || testStatus === 'testing'"
            @click="testConnection"
          >
            <i v-if="testStatus === 'testing'" class="fa-solid fa-spinner fa-spin"></i>
            <i v-else class="fa-solid fa-plug"></i>
            {{ testStatus === 'testing' ? '测试中...' : '测试连接' }}
          </button>
          <button
            class="btn-save"
            :disabled="!form.name.trim() || !form.host.trim() || testStatus === 'testing'"
            @click="saveConnector"
          >
            {{ isEditing ? '保存' : '添加' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.page-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 32px 40px;
  color: #1A1A1A;
  overflow-y: auto;
}

.page-header h1 { font-size: 24px; font-weight: 600; margin: 0 0 8px 0; }
.subtitle { color: #999; font-size: 14px; margin: 0 0 28px 0; }

/* 快速添加区 */
.add-section {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}
.add-label { font-size: 13px; color: #666; font-weight: 500; }
.add-type-btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 16px; border-radius: 10px;
  border: 1px solid #E0E0E0; background: #FFF;
  font-size: 13px; color: #333; cursor: pointer;
  transition: all 0.15s; font-family: inherit;
}
.add-type-btn:hover {
  border-color: var(--btn-color);
  color: var(--btn-color);
  background: color-mix(in srgb, var(--btn-color) 8%, white);
}
.add-type-btn i { font-size: 14px; }

/* 空状态 */
.empty-state {
  display: flex; flex-direction: column; align-items: center;
  padding: 80px 20px; color: #999; text-align: center;
}
.empty-icon { font-size: 48px; color: #DDD; margin-bottom: 16px; }
.empty-text { font-size: 15px; color: #999; margin: 0 0 8px; }
.empty-hint { font-size: 13px; color: #BBB; margin: 0; }

/* 卡片网格 */
.connectors-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.connector-card {
  padding: 18px 20px;
  background: #FFF;
  border: 1px solid #EAEAEA;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.connector-card:hover {
  border-color: #D0D0D0;
  box-shadow: 0 2px 12px rgba(0,0,0,0.05);
}
.connector-card.enabled { border-color: #d1fae5; }

.card-top { display: flex; align-items: center; justify-content: space-between; }
.type-icon {
  width: 42px; height: 42px; border-radius: 11px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
}
.type-badge {
  padding: 3px 10px; border-radius: 10px;
  font-size: 11px; font-weight: 500;
}

.card-info { display: flex; flex-direction: column; gap: 4px; }
.conn-name { font-size: 15px; font-weight: 600; color: #1A1A1A; }
.conn-host { font-size: 12px; color: #888; font-family: 'SF Mono', Consolas, monospace; }
.conn-desc { font-size: 12px; color: #AAA; margin-top: 2px; }

.card-actions {
  display: flex; align-items: center; gap: 8px;
  padding-top: 6px; border-top: 1px solid #F0F0F0;
}
.action-btn {
  width: 30px; height: 30px; border-radius: 7px;
  border: none; background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; color: #999; transition: all 0.12s;
  font-family: inherit;
}
.action-btn:hover { background: #F0F0F0; color: #333; }
.action-btn.danger:hover { background: #FEE2E2; color: #EF4444; }

/* 开关 */
.toggle-switch {
  width: 36px; height: 20px; border-radius: 10px;
  background: #E0E0E0; cursor: pointer;
  position: relative; transition: background 0.2s;
  margin-left: auto; flex-shrink: 0;
}
.toggle-switch.on { background: #10B981; }
.toggle-thumb {
  position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; border-radius: 50%;
  background: #FFF; transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}
.toggle-switch.on .toggle-thumb { transform: translateX(16px); }

/* ── 模态框 ── */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.modal-card {
  width: 520px; max-width: 95vw; max-height: 90vh;
  background: #FFF; border-radius: 16px;
  display: flex; flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
}
.modal-header {
  display: flex; align-items: center; gap: 10px;
  padding: 18px 24px;
  border-bottom: 1px solid #F0F0F0;
  font-size: 16px; font-weight: 600; color: #1A1A1A;
}
.modal-header i:first-child { font-size: 20px; }
.modal-close {
  margin-left: auto; background: none; border: none;
  font-size: 18px; color: #999; cursor: pointer; padding: 4px;
  font-family: inherit;
}
.modal-close:hover { color: #333; }

.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 4px;
}

.field-label {
  display: block; font-size: 12px; color: #888;
  font-weight: 500; margin: 8px 0 4px;
}
.field-input {
  width: 100%; padding: 9px 12px;
  border: 1px solid #E0E0E0; border-radius: 8px;
  font-size: 13px; color: #1A1A1A;
  background: #FAFAFA; outline: none;
  transition: border-color 0.15s;
  font-family: inherit;
  box-sizing: border-box;
}
.field-input:focus { border-color: #2563EB; background: #FFF; }

.field-row { display: flex; gap: 12px; }
.field-group { display: flex; flex-direction: column; }
.flex-1 { flex: 1; }
.flex-2 { flex: 2; }

.modal-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 14px 24px;
  border-top: 1px solid #F0F0F0;
  background: #FAFAFA;
}
.btn-cancel {
  padding: 8px 18px; border: 1px solid #E0E0E0; border-radius: 8px;
  background: #FFF; font-size: 13px; color: #666;
  cursor: pointer; font-family: inherit;
}
.btn-cancel:hover { background: #F5F5F5; }
.btn-test {
  padding: 8px 16px; border: 1px solid #E0E0E0; border-radius: 8px;
  background: #FFF; font-size: 13px; color: #333;
  cursor: pointer; font-family: inherit;
  display: inline-flex; align-items: center; gap: 6px;
  transition: all 0.12s;
}
.btn-test:hover:not(:disabled) { border-color: #2563EB; color: #2563EB; }
.btn-test:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-save {
  padding: 8px 20px; border: none; border-radius: 8px;
  background: #1A1A1A; font-size: 13px; color: #FFF;
  cursor: pointer; font-family: inherit;
  transition: opacity 0.12s;
}
.btn-save:hover { opacity: 0.85; }
.btn-save:disabled { opacity: 0.4; cursor: not-allowed; }

/* 连接测试结果 */
.test-result {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 14px; border-radius: 10px;
  margin-top: 12px;
  font-size: 13px;
}
.test-result.testing { background: #F0F7FF; color: #2563EB; }
.test-result.success { background: #F0FDF4; color: #10B981; border: 1px solid #D1FAE5; }
.test-result.error { background: #FEF2F2; color: #EF4444; border: 1px solid #FECACA; }
.test-result-icon { flex-shrink: 0; font-size: 16px; line-height: 1.4; }
.test-result-text { display: flex; flex-direction: column; gap: 2px; }
.test-result-msg { font-weight: 500; }
.test-result-details {
  font-size: 11px; color: #888;
  font-family: 'SF Mono', Consolas, monospace;
}

.modal-enter-active { transition: opacity 0.15s; }
.modal-leave-active { transition: opacity 0.1s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
