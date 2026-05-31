<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAgentStore } from '../../stores/agentStore'
import { getMemoryManager, type DynamicMemoryEntry } from '../../agent/memory'
import type { MemoryType } from '../../types/system'

const store = useAgentStore()

// ── SOUL.md 编辑 ──
const soulContent = ref('')
const soulEditing = ref(false)
const soulSaveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')

async function loadSoul() {
  const content = await store.readMemoryFile('/core/SOUL.md')
  soulContent.value = content || '# SOUL.md\n\n在此定义你的 AI 身份、个性和行为准则...'
}

function startSoulEdit() {
  soulEditing.value = true
}

function cancelSoulEdit() {
  soulEditing.value = false
  loadSoul()
}

async function saveSoul() {
  soulSaveStatus.value = 'saving'
  const ok = await store.saveMemoryFile('/core/SOUL.md', soulContent.value)
  if (ok) {
    soulSaveStatus.value = 'saved'
    soulEditing.value = false
    await getMemoryManager().reload()
    setTimeout(() => { soulSaveStatus.value = 'idle' }, 2000)
  } else {
    soulSaveStatus.value = 'error'
    setTimeout(() => { soulSaveStatus.value = 'idle' }, 3000)
  }
}

// ── 动态记忆 ──
const activeTab = ref<'soul' | 'memories'>('soul')
const dynamicMemories = ref<DynamicMemoryEntry[]>([])
const memorySearchQuery = ref('')
const showAddMemoryDialog = ref(false)
const newMemory = ref<{ title: string; content: string; type: MemoryType; tags: string }>({
  title: '', content: '', type: 'project', tags: ''
})
const editingMemoryId = ref<string | null>(null)
const editingMemoryContent = ref('')

const filteredMemories = computed(() => {
  if (!memorySearchQuery.value.trim()) return dynamicMemories.value
  const mm = getMemoryManager()
  return mm.searchMemories(memorySearchQuery.value, { limit: 50 })
})

const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  user: '用户偏好', feedback: '反馈', project: '项目知识', reference: '参考资料'
}
const MEMORY_TYPE_COLORS: Record<MemoryType, string> = {
  user: '#4a9eff', feedback: '#ff9f43', project: '#2ed573', reference: '#a55eea'
}

async function loadDynamicMemories() {
  const mm = getMemoryManager()
  await mm.init()
  dynamicMemories.value = mm.getAllMemories()
}

function openAddMemoryDialog() {
  newMemory.value = { title: '', content: '', type: 'project', tags: '' }
  showAddMemoryDialog.value = true
}

async function addNewMemory() {
  if (!newMemory.value.title.trim() || !newMemory.value.content.trim()) return
  const mm = getMemoryManager()
  const tags = newMemory.value.tags.split(/[,，\s]+/).map(t => t.trim()).filter(t => t.length > 0)
  await mm.addMemory({
    title: newMemory.value.title.trim(),
    content: newMemory.value.content.trim(),
    type: newMemory.value.type,
    tags,
    source: 'ui',
  })
  showAddMemoryDialog.value = false
  await loadDynamicMemories()
}

function startEditMemory(entry: DynamicMemoryEntry) {
  editingMemoryId.value = entry.id
  editingMemoryContent.value = entry.content
}

async function saveEditMemory() {
  if (!editingMemoryId.value) return
  const mm = getMemoryManager()
  await mm.updateMemory(editingMemoryId.value, { content: editingMemoryContent.value })
  editingMemoryId.value = null
  editingMemoryContent.value = ''
  await loadDynamicMemories()
}

function cancelEditMemory() {
  editingMemoryId.value = null
  editingMemoryContent.value = ''
}

async function deleteMemory(id: string) {
  if (!confirm('确认删除这条记忆？此操作不可恢复。')) return
  const mm = getMemoryManager()
  await mm.deleteMemory(id)
  await loadDynamicMemories()
}

function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000))
    if (diffDays === 0) return '今天'
    if (diffDays === 1) return '昨天'
    if (diffDays < 7) return `${diffDays}天前`
    return d.toLocaleDateString('zh-CN')
  } catch { return isoStr }
}

function handleSoulKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault()
    if (soulEditing.value) saveSoul()
  }
}

onMounted(async () => {
  await store.initMemoryFiles()
  await loadSoul()
  await loadDynamicMemories()
})
</script>

<template>
  <div class="content-section memory-section">
    <h1>记忆</h1>
    <p class="section-desc">
      管理 AI 的身份设定和动态记忆。SOUL.md 定义核心人格，动态记忆存储在 <code>~/.aipcowork/memories.json</code>
    </p>

    <!-- 标签切换 -->
    <div class="memory-tabs">
      <button class="memory-tab" :class="{ active: activeTab === 'soul' }" @click="activeTab = 'soul'">
        <i class="fa-solid fa-user-circle"></i> 身份设定 (SOUL.md)
      </button>
      <button class="memory-tab" :class="{ active: activeTab === 'memories' }" @click="activeTab = 'memories'">
        <i class="fa-solid fa-brain"></i> 动态记忆
        <span v-if="dynamicMemories.length" class="memory-count">{{ dynamicMemories.length }}</span>
      </button>
    </div>

    <!-- ═══ SOUL.md 视图 ═══ -->
    <div v-show="activeTab === 'soul'" class="soul-container" @keydown="handleSoulKeydown">
      <div class="soul-header">
        <div class="soul-title">
          <i class="fa-solid fa-user-circle"></i>
          <span>SOUL.md — AI 身份设定</span>
        </div>
        <div class="soul-actions">
          <span v-if="soulSaveStatus === 'saved'" class="save-badge saved">
            <i class="fa-solid fa-check"></i> 已保存
          </span>
          <span v-if="soulSaveStatus === 'saving'" class="save-badge saving">
            <i class="fa-solid fa-spinner fa-spin"></i> 保存中
          </span>
          <span v-if="soulSaveStatus === 'error'" class="save-badge error">
            <i class="fa-solid fa-triangle-exclamation"></i> 保存失败
          </span>
          <template v-if="!soulEditing">
            <button class="action-btn" @click="startSoulEdit">
              <i class="fa-solid fa-pen"></i> 编辑
            </button>
          </template>
          <template v-else>
            <button class="action-btn save" @click="saveSoul">
              <i class="fa-solid fa-floppy-disk"></i> 保存
            </button>
            <button class="action-btn cancel" @click="cancelSoulEdit">取消</button>
          </template>
        </div>
      </div>
      <div class="soul-body">
        <pre v-if="!soulEditing" class="soul-preview" @dblclick="startSoulEdit">{{ soulContent }}</pre>
        <textarea v-else v-model="soulContent" class="soul-editor" spellcheck="false" placeholder="# SOUL.md&#10;&#10;定义你的 AI 身份、个性和行为准则..."></textarea>
      </div>
      <div class="soul-hint">
        <i class="fa-solid fa-info-circle"></i>
        <span>SOUL.md 的内容会在每次对话时注入系统提示词，定义 AI 的核心人格和行为准则。</span>
      </div>
    </div>

    <!-- ═══ 动态记忆视图 ═══ -->
    <div v-show="activeTab === 'memories'" class="dynamic-memories-container">
      <div class="memories-toolbar">
        <div class="memories-search">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input v-model="memorySearchQuery" type="text" placeholder="搜索记忆..." class="search-input" />
        </div>
        <button class="add-memory-btn" @click="openAddMemoryDialog">
          <i class="fa-solid fa-plus"></i> 添加记忆
        </button>
      </div>

      <div class="memories-list">
        <div v-if="filteredMemories.length === 0" class="memories-empty">
          <i class="fa-solid fa-inbox"></i>
          <p>{{ memorySearchQuery ? '未找到匹配的记忆' : '暂无动态记忆' }}</p>
          <p class="empty-hint">Agent 在对话中会自动保存重要信息，你也可以手动添加。</p>
        </div>

        <div v-for="entry in filteredMemories" :key="entry.id" class="memory-item">
          <div class="memory-item-header">
            <div class="memory-item-title">
              <span class="memory-type-badge" :style="{ backgroundColor: MEMORY_TYPE_COLORS[entry.type] }">
                {{ MEMORY_TYPE_LABELS[entry.type] }}
              </span>
              <span class="memory-title-text">{{ entry.title }}</span>
            </div>
            <div class="memory-item-meta">
              <span class="memory-date">{{ formatDate(entry.updated) }}</span>
              <div class="memory-item-actions">
                <button v-if="editingMemoryId !== entry.id" class="icon-btn" title="编辑" @click="startEditMemory(entry)">
                  <i class="fa-solid fa-pen"></i>
                </button>
                <button class="icon-btn danger" title="删除" @click="deleteMemory(entry.id)">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </div>
          </div>
          <div v-if="entry.tags.length > 0" class="memory-item-tags">
            <span v-for="tag in entry.tags" :key="tag" class="memory-tag">{{ tag }}</span>
          </div>
          <div class="memory-item-body">
            <template v-if="editingMemoryId === entry.id">
              <textarea v-model="editingMemoryContent" class="memory-edit-textarea" rows="4"></textarea>
              <div class="memory-edit-actions">
                <button class="small-btn save" @click="saveEditMemory">保存</button>
                <button class="small-btn" @click="cancelEditMemory">取消</button>
              </div>
            </template>
            <template v-else>
              <p class="memory-content-text">{{ entry.content }}</p>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ 添加记忆对话框 ═══ -->
    <div v-if="showAddMemoryDialog" class="memory-dialog-overlay" @click.self="showAddMemoryDialog = false">
      <div class="memory-dialog">
        <div class="memory-dialog-header">
          <h3>添加新记忆</h3>
          <button class="icon-btn" @click="showAddMemoryDialog = false">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="memory-dialog-body">
          <div class="form-group">
            <label>标题</label>
            <input v-model="newMemory.title" type="text" placeholder="简明扼要的标题" class="form-input" />
          </div>
          <div class="form-group">
            <label>类型</label>
            <select v-model="newMemory.type" class="form-select">
              <option value="user">用户偏好</option>
              <option value="feedback">反馈</option>
              <option value="project">项目知识</option>
              <option value="reference">参考资料</option>
            </select>
          </div>
          <div class="form-group">
            <label>标签（逗号分隔）</label>
            <input v-model="newMemory.tags" type="text" placeholder="如：前端, React, 偏好" class="form-input" />
          </div>
          <div class="form-group">
            <label>内容</label>
            <textarea v-model="newMemory.content" rows="6" placeholder="详细记录关键信息..." class="form-textarea"></textarea>
          </div>
        </div>
        <div class="memory-dialog-footer">
          <button class="small-btn" @click="showAddMemoryDialog = false">取消</button>
          <button class="small-btn save" @click="addNewMemory" :disabled="!newMemory.title.trim() || !newMemory.content.trim()">添加</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.memory-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}
.memory-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  background: none;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all 0.15s;
  &:hover { color: var(--text-primary, #111827); }
  &.active {
    color: var(--accent-color, #4a9eff);
    border-bottom-color: var(--accent-color, #4a9eff);
    font-weight: 500;
  }
}
.memory-count {
  background: var(--accent-color, #4a9eff);
  color: #fff;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 600;
}

/* ── SOUL.md ── */
.soul-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.soul-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.soul-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #111827);
  i { color: var(--accent-color, #4a9eff); }
}
.soul-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.save-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  &.saved { background: #d1fae5; color: #065f46; }
  &.saving { background: #fef3c7; color: #92400e; }
  &.error { background: #fee2e2; color: #991b1b; }
}
.action-btn {
  padding: 6px 12px;
  font-size: 13px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #111827);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s;
  &:hover { border-color: var(--text-secondary, #9ca3af); }
  &.save { background: var(--accent-color, #4a9eff); border-color: var(--accent-color); color: #fff; }
  &.cancel { color: var(--text-secondary, #6b7280); }
}
.soul-body {
  background: var(--bg-secondary, #f9fafb);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 16px;
  min-height: 300px;
}
.soul-preview {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary, #111827);
  cursor: text;
}
.soul-editor {
  width: 100%;
  min-height: 300px;
  border: none;
  background: transparent;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  color: var(--text-primary, #111827);
}
.soul-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-tertiary, #9ca3af);
  i { color: var(--accent-color, #4a9eff); }
}

/* ── 动态记忆 ── */
.dynamic-memories-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.memories-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}
.memories-search {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  background: var(--bg-secondary, #f9fafb);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  padding: 6px 12px;
  i { color: var(--text-secondary, #9ca3af); font-size: 13px; }
}
.search-input {
  flex: 1;
  border: none;
  background: none;
  outline: none;
  font-size: 13px;
  color: var(--text-primary, #111827);
}
.add-memory-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: var(--accent-color, #4a9eff);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.15s;
  &:hover { opacity: 0.85; }
}
.memories-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  color: var(--text-secondary, #9ca3af);
  i { font-size: 32px; margin-bottom: 12px; opacity: 0.5; }
  p { margin: 4px 0; font-size: 14px; }
  .empty-hint { font-size: 12px; color: var(--text-tertiary, #d1d5db); }
}
.memory-item {
  background: var(--bg-secondary, #f9fafb);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 12px 14px;
  transition: border-color 0.15s;
  &:hover { border-color: var(--accent-color, #4a9eff); }
}
.memory-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.memory-item-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.memory-type-badge {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  color: #fff;
  font-weight: 500;
  white-space: nowrap;
}
.memory-title-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.memory-item-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.memory-date {
  font-size: 12px;
  color: var(--text-tertiary, #9ca3af);
}
.memory-item-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
  .memory-item:hover & { opacity: 1; }
}
.memory-item-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.memory-tag {
  font-size: 11px;
  padding: 1px 6px;
  background: var(--bg-tertiary, #f3f4f6);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 3px;
  color: var(--text-secondary, #6b7280);
}
.memory-item-body {
  margin-top: 8px;
}
.memory-content-text {
  font-size: 13px;
  color: var(--text-secondary, #374151);
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
.memory-edit-textarea {
  width: 100%;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  padding: 8px;
  font-size: 13px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  resize: vertical;
  outline: none;
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #111827);
  &:focus { border-color: var(--accent-color, #4a9eff); }
}
.memory-edit-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  justify-content: flex-end;
}
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary, #9ca3af);
  font-size: 12px;
  transition: all 0.15s;
  &:hover { background: var(--bg-tertiary, #f3f4f6); color: var(--text-primary, #111827); }
  &.danger:hover { color: #ef4444; }
}
.small-btn {
  padding: 5px 12px;
  font-size: 12px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  background: var(--bg-primary, #fff);
  color: var(--text-secondary, #374151);
  cursor: pointer;
  transition: all 0.15s;
  &:hover { border-color: var(--text-secondary, #9ca3af); }
  &.save {
    background: var(--accent-color, #4a9eff);
    border-color: var(--accent-color, #4a9eff);
    color: #fff;
    &:hover { opacity: 0.85; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }
}
.memory-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.memory-dialog {
  background: var(--bg-primary, #fff);
  border-radius: 12px;
  width: 480px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}
.memory-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  h3 { margin: 0; font-size: 15px; font-weight: 600; }
}
.memory-dialog-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}
.memory-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border-color, #e5e7eb);
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  label { font-size: 12px; font-weight: 500; color: var(--text-secondary, #6b7280); }
}
.form-input, .form-select, .form-textarea {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 13px;
  outline: none;
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #111827);
  &:focus { border-color: var(--accent-color, #4a9eff); }
}
.form-textarea {
  font-family: 'SF Mono', 'Fira Code', monospace;
  resize: vertical;
}
.form-select { cursor: pointer; }
</style>
