<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAgentStore } from '../stores/agentStore'
import type { ScheduledTask, ScheduleType } from '../types/agent'

const store = useAgentStore()

const showDialog = ref(false)
const editingTaskId = ref<string | null>(null)
const saveSuccess = ref(false)

const form = ref({
  name: '',
  description: '',
  scheduleType: 'once' as ScheduleType,
  expression: '',
  command: '',
  message: '',
  enabled: true,
})

const schedulePresets = [
  { label: '每分钟', value: '* * * * *' },
  { label: '每5分钟', value: '*/5 * * * *' },
  { label: '每30分钟', value: '*/30 * * * *' },
  { label: '每小时', value: '0 * * * *' },
  { label: '每天9点', value: '0 9 * * *' },
  { label: '每天0点', value: '0 0 * * *' },
  { label: '每周一9点', value: '0 9 * * 1' },
  { label: '每月1日9点', value: '0 9 1 * *' },
]

function openAddDialog() {
  editingTaskId.value = null
  form.value = {
    name: '',
    description: '',
    scheduleType: 'once',
    expression: '',
    command: '',
    message: '',
    enabled: true,
  }
  showDialog.value = true
}

function openEditDialog(task: ScheduledTask) {
  editingTaskId.value = task.id
  form.value = {
    name: task.name,
    description: task.description,
    scheduleType: task.schedule.type,
    expression: task.schedule.expression || '',
    command: task.command,
    message: task.message,
    enabled: task.enabled,
  }
  showDialog.value = true
}

function saveTask() {
  if (!form.value.name.trim() || !form.value.command.trim()) return

  const taskData: ScheduledTask = {
    id: editingTaskId.value || `task-${Date.now()}`,
    name: form.value.name.trim(),
    description: form.value.description.trim(),
    schedule: {
      type: form.value.scheduleType,
      expression: form.value.expression || undefined,
      intervalMs: form.value.scheduleType === 'interval'
        ? parseInt(form.value.expression) * 1000 || 3600000
        : undefined,
      runAt: undefined,
    },
    command: form.value.command.trim(),
    message: form.value.message.trim(),
    enabled: form.value.enabled,
    lastRun: editingTaskId.value
      ? store.scheduledTasks.find(t => t.id === editingTaskId.value)?.lastRun
      : undefined,
    nextRun: undefined,
  }

  if (editingTaskId.value) {
    store.updateScheduledTask(editingTaskId.value, taskData)
  } else {
    store.addScheduledTask(taskData)
  }

  showDialog.value = false
  saveSuccess.value = true
  setTimeout(() => { saveSuccess.value = false }, 2000)
}

async function runTask(id: string) {
  const result = await store.triggerScheduledTask(id)
  alert(`执行结果:\n${result}`)
}

function deleteTask(id: string) {
  if (confirm('确定要删除这个定时任务吗？')) {
    store.deleteScheduledTask(id)
  }
}

function getScheduleLabel(task: ScheduledTask): string {
  switch (task.schedule.type) {
    case 'cron':
      return task.schedule.expression || 'cron'
    case 'interval': {
      const ms = task.schedule.intervalMs || 0
      const mins = Math.floor(ms / 60000)
      const hrs = Math.floor(mins / 60)
      if (hrs > 0) return `每${hrs}小时`
      if (mins > 0) return `每${mins}分钟`
      return `每${Math.floor(ms / 1000)}秒`
    }
    case 'once':
      return '仅执行一次'
    default:
      return '-'
  }
}

function getStatusLabel(task: ScheduledTask): string {
  if (!task.enabled) return '已暂停'
  if (task.lastRun) return '运行中'
  return '待执行'
}

function getStatusColor(task: ScheduledTask): string {
  if (!task.enabled) return '#f59e0b'
  if (task.lastRun) return '#10b981'
  return '#9ca3af'
}

onMounted(() => {
  if (store.scheduledTasks.length === 0) {
    store.addScheduledTask({
      id: 'task-default-hello',
      name: 'Hello World 测试',
      description: '验证定时任务系统是否正常运行的测试任务',
      schedule: { type: 'once', expression: '' },
      command: 'echo "Hello World from Scheduler! 🎉"',
      message: '',
      enabled: true,
      lastRun: undefined,
      nextRun: undefined,
    })
  }
  store.syncTasksToBackend()
})
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div class="header-left">
        <h1>定时任务</h1>
        <p class="subtitle">管理和调度自动化计划任务，支持 Cron 表达式、固定间隔和一次性执行</p>
      </div>
      <button class="add-btn" @click="openAddDialog">
        <i class="fa-solid fa-plus"></i>
        <span>新建任务</span>
      </button>
    </div>

    <Transition name="fade">
      <div v-if="saveSuccess" class="success-toast">
        <i class="fa-solid fa-circle-check"></i> 任务已保存
      </div>
    </Transition>

    <!-- 空状态 -->
    <div v-if="store.scheduledTasks.length === 0" class="empty-state">
      <i class="fa-solid fa-clock empty-icon"></i>
      <p class="empty-title">暂无定时任务</p>
      <p class="empty-desc">点击「新建任务」创建你的第一个定时任务</p>
    </div>

    <!-- 任务列表 -->
    <div v-else class="task-list">
      <div class="task-list-header">
        <span class="col-name">任务名称</span>
        <span class="col-desc">描述</span>
        <span class="col-schedule">执行计划</span>
        <span class="col-command">命令</span>
        <span class="col-status">状态</span>
        <span class="col-last">上次运行</span>
        <span class="col-actions">操作</span>
      </div>

      <div
        v-for="task in store.scheduledTasks"
        :key="task.id"
        class="task-row"
      >
        <span class="col-name">
          <i class="fa-solid fa-clock task-icon"></i>
          <span class="task-name-text">{{ task.name }}</span>
        </span>
        <span class="col-desc">{{ task.description || '-' }}</span>
        <span class="col-schedule">
          <code class="schedule-code">{{ getScheduleLabel(task) }}</code>
        </span>
        <span class="col-command">
          <code class="command-code">{{ task.command }}</code>
        </span>
        <span class="col-status">
          <span class="status-dot" :style="{ background: getStatusColor(task) }"></span>
          {{ getStatusLabel(task) }}
        </span>
        <span class="col-last">{{ task.lastRun || '-' }}</span>
        <span class="col-actions">
          <button class="action-btn" title="立即执行" @click="runTask(task.id)">
            <i class="fa-solid fa-play"></i>
          </button>
          <button class="action-btn" :title="task.enabled ? '暂停' : '启用'" @click="store.toggleScheduledTask(task.id)">
            <i :class="task.enabled ? 'fa-solid fa-pause' : 'fa-solid fa-play'"></i>
          </button>
          <button class="action-btn" title="编辑" @click="openEditDialog(task)">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="action-btn danger" title="删除" @click="deleteTask(task.id)">
            <i class="fa-solid fa-trash"></i>
          </button>
        </span>
      </div>
    </div>

    <!-- 新建/编辑弹窗 -->
    <Transition name="pop">
      <div v-if="showDialog" class="dialog-mask" @click.self="showDialog = false">
        <div class="dialog">
          <div class="dialog-header">
            <h3>{{ editingTaskId ? '编辑任务' : '新建任务' }}</h3>
            <button class="dialog-close" @click="showDialog = false">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div class="dialog-body">
            <div class="form-group">
              <label>任务名称 <span class="required">*</span></label>
              <input
                v-model="form.name"
                type="text"
                placeholder="例如：每日备份"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label>描述</label>
              <input
                v-model="form.description"
                type="text"
                placeholder="任务描述（可选）"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label>调度类型</label>
              <div class="type-selector">
                <button
                  v-for="t in [{v:'once',l:'仅一次'},{v:'cron',l:'Cron表达式'},{v:'interval',l:'固定间隔'}]"
                  :key="t.v"
                  class="type-btn"
                  :class="{ active: form.scheduleType === t.v }"
                  @click="form.scheduleType = t.v as ScheduleType; form.expression = ''"
                >
                  {{ t.l }}
                </button>
              </div>
            </div>
            <div class="form-group" v-if="form.scheduleType === 'cron'">
              <label>Cron 表达式</label>
              <input
                v-model="form.expression"
                type="text"
                placeholder="例如：0 9 * * * (每天9点)"
                class="form-input mono"
              />
              <div class="preset-chips">
                <span
                  v-for="preset in schedulePresets"
                  :key="preset.value"
                  class="preset-chip"
                  :class="{ active: form.expression === preset.value }"
                  @click="form.expression = preset.value"
                >
                  {{ preset.label }}
                </span>
              </div>
            </div>
            <div class="form-group" v-if="form.scheduleType === 'interval'">
              <label>间隔（秒）</label>
              <input
                v-model="form.expression"
                type="number"
                placeholder="例如：3600 (每小时)"
                class="form-input"
              />
              <span class="form-hint">输入秒数，如 60 = 每分钟，3600 = 每小时</span>
            </div>
            <div class="form-group">
              <label>执行命令 <span class="required">*</span></label>
              <textarea
                v-model="form.command"
                placeholder="例如：echo Hello World"
                class="form-textarea"
                rows="2"
              ></textarea>
            </div>
            <div class="form-group">
              <label>备注信息</label>
              <input
                v-model="form.message"
                type="text"
                placeholder="附加消息（可选）"
                class="form-input"
              />
            </div>
          </div>
          <div class="dialog-footer">
            <button class="btn-cancel" @click="showDialog = false">取消</button>
            <button
              class="btn-confirm"
              @click="saveTask"
              :disabled="!form.name.trim() || !form.command.trim()"
            >
              {{ editingTaskId ? '保存修改' : '创建任务' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
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

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}

.header-left h1 {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 8px 0;
}

.subtitle {
  color: #999;
  font-size: 14px;
  margin: 0;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #1A1A1A;
  color: #FFF;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}
.add-btn:hover { background: #333; }

.success-toast {
  padding: 10px 16px;
  background: #d1fae5;
  color: #059669;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
}
.empty-icon { font-size: 48px; color: #DDD; margin-bottom: 16px; }
.empty-title { font-size: 16px; font-weight: 500; color: #666; margin: 0 0 8px; }
.empty-desc { font-size: 13px; color: #999; margin: 0; }

/* 任务列表 */
.task-list {
  background: #FFF;
  border: 1px solid #EAEAEA;
  border-radius: 12px;
  overflow: hidden;
}

.task-list-header {
  display: grid;
  grid-template-columns: 1.4fr 1.2fr 0.9fr 1.3fr 0.6fr 1fr 110px;
  padding: 12px 16px;
  background: #F9F9F9;
  border-bottom: 1px solid #EAEAEA;
  font-size: 12px;
  color: #999;
  font-weight: 500;
}

.task-row {
  display: grid;
  grid-template-columns: 1.4fr 1.2fr 0.9fr 1.3fr 0.6fr 1fr 110px;
  padding: 12px 16px;
  border-bottom: 1px solid #F5F5F5;
  font-size: 13px;
  align-items: center;
  transition: background 0.1s;
}
.task-row:last-child { border-bottom: none; }
.task-row:hover { background: #FAFAFA; }

.task-icon { color: #999; margin-right: 6px; font-size: 13px; flex-shrink: 0; }

.col-name { font-weight: 500; display: flex; align-items: center; min-width: 0; }
.task-name-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.col-desc { color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.schedule-code {
  font-size: 12px;
  padding: 2px 8px;
  background: #F5F5F5;
  border-radius: 4px;
  color: #555;
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.col-command { min-width: 0; }
.command-code {
  font-size: 12px;
  padding: 2px 8px;
  background: #F0F4FF;
  border-radius: 4px;
  color: #4F46E5;
  font-family: 'SF Mono', 'Fira Code', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.col-status {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.col-last { color: #999; font-size: 12px; }

.col-actions { display: flex; gap: 2px; }

.action-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 12px;
  transition: all 0.15s;
}
.action-btn:hover { background: #F0F0F0; color: #333; }
.action-btn.danger:hover { background: #fef2f2; color: #ef4444; }

/* 弹窗 */
.dialog-mask {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.4); z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.dialog {
  width: 520px; max-height: 90vh; overflow-y: auto;
  background: #FFF; border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
}
.dialog-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px 0;
}
.dialog-header h3 { font-size: 18px; font-weight: 600; color: #1A1A1A; margin: 0; }
.dialog-close {
  width: 28px; height: 28px; border: none; background: transparent;
  cursor: pointer; color: #999; font-size: 16px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
}
.dialog-close:hover { background: #F0F0F0; color: #333; }
.dialog-body { padding: 20px 24px; }
.dialog-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 0 24px 20px;
}

.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 13px; font-weight: 500; color: #555; margin-bottom: 6px; }
.required { color: #ef4444; }
.form-input {
  width: 100%; padding: 10px 14px; border: 1px solid #E8E8E8;
  border-radius: 8px; font-size: 14px; color: #1A1A1A;
  font-family: inherit; box-sizing: border-box;
  transition: border-color 0.15s;
}
.form-input:focus { border-color: #4285F4; outline: none; }
.form-input.mono { font-family: 'SF Mono', 'Fira Code', monospace; }
.form-input::placeholder { color: #CCC; }
.form-textarea {
  width: 100%; padding: 10px 14px; border: 1px solid #E8E8E8;
  border-radius: 8px; font-size: 14px; color: #1A1A1A;
  font-family: 'SF Mono', 'Fira Code', monospace; box-sizing: border-box;
  resize: vertical; transition: border-color 0.15s;
}
.form-textarea:focus { border-color: #4285F4; outline: none; }
.form-textarea::placeholder { color: #CCC; }
.form-hint { font-size: 12px; color: #BBB; margin-top: 4px; display: block; }

.type-selector { display: flex; gap: 4px; }
.type-btn {
  flex: 1; padding: 8px 12px; border: 1px solid #E8E8E8;
  background: #FFF; border-radius: 8px; font-size: 13px; color: #666;
  cursor: pointer; font-family: inherit; transition: all 0.15s;
}
.type-btn:hover { border-color: #CCC; }
.type-btn.active { border-color: #1A1A1A; background: #1A1A1A; color: #FFF; }

.preset-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.preset-chip {
  padding: 4px 10px; border: 1px solid #E8E8E8;
  border-radius: 6px; font-size: 12px; color: #666;
  cursor: pointer; transition: all 0.15s; font-family: 'SF Mono', 'Fira Code', monospace;
}
.preset-chip:hover { border-color: #4285F4; color: #4285F4; }
.preset-chip.active { border-color: #4285F4; background: #EEF2FF; color: #4F46E5; }

.btn-cancel {
  padding: 8px 16px; border: 1px solid #E8E8E8; border-radius: 8px;
  background: #FFF; font-size: 13px; color: #666; cursor: pointer;
  font-family: inherit; transition: background 0.15s;
}
.btn-cancel:hover { background: #F5F5F5; }
.btn-confirm {
  padding: 8px 20px; border: none; border-radius: 8px;
  background: #1A1A1A; font-size: 13px; color: #FFF; cursor: pointer;
  font-family: inherit; transition: background 0.15s;
}
.btn-confirm:hover { background: #333; }
.btn-confirm:disabled { background: #CCC; cursor: not-allowed; }

.pop-enter-active { transition: all 0.2s ease-out; }
.pop-leave-active { transition: all 0.15s ease-in; }
.pop-enter-from { opacity: 0; }
.pop-enter-from .dialog { transform: scale(0.95); }
.pop-leave-to { opacity: 0; }
.pop-leave-to .dialog { transform: scale(0.95); }
</style>
