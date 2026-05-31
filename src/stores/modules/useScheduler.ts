import { ref } from 'vue'
import type { ScheduledTask } from '../../types/agent'

export function useScheduler(persistState: () => void) {
  const scheduledTasks = ref<ScheduledTask[]>([])

  function addScheduledTask(task: ScheduledTask) {
    scheduledTasks.value.push(task)
    persistState()
    syncTasksToBackend()
  }

  function updateScheduledTask(id: string, updates: Partial<ScheduledTask>) {
    const idx = scheduledTasks.value.findIndex(t => t.id === id)
    if (idx >= 0) {
      Object.assign(scheduledTasks.value[idx], updates)
      persistState()
      syncTasksToBackend()
    }
  }

  function deleteScheduledTask(id: string) {
    scheduledTasks.value = scheduledTasks.value.filter(t => t.id !== id)
    persistState()
    syncTasksToBackend()
  }

  function toggleScheduledTask(id: string) {
    const task = scheduledTasks.value.find(t => t.id === id)
    if (task) {
      task.enabled = !task.enabled
      persistState()
      syncTasksToBackend()
    }
  }

  async function triggerScheduledTask(id: string): Promise<string> {
    const task = scheduledTasks.value.find(t => t.id === id)
    if (!task) return '未找到该任务'

    const now = new Date()
    const ts = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0') + ' ' +
      String(now.getHours()).padStart(2, '0') + ':' +
      String(now.getMinutes()).padStart(2, '0') + ':' +
      String(now.getSeconds()).padStart(2, '0')

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<string>('trigger_task', { id })
      updateScheduledTask(id, { lastRun: ts })
      return result
    } catch (e) {
      console.warn('Tauri backend unavailable, simulating execution:', e)
      updateScheduledTask(id, { lastRun: ts })
      const cmd = task.command
      return `[模拟执行] 命令: ${cmd}\n时间: ${ts}\n状态: 已记录（需在 Tauri 环境中运行以实际执行命令）`
    }
  }

  async function syncTasksToBackend() {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<ScheduledTask[]>('sync_tasks', {
        tasks: scheduledTasks.value
      })
      scheduledTasks.value = result
    } catch (e) {
      console.warn('sync_tasks failed:', e)
    }
  }

  async function getSchedulerLogs(): Promise<string[]> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<string[]>('get_scheduler_logs')
    } catch {
      return []
    }
  }

  return {
    scheduledTasks, addScheduledTask, updateScheduledTask, deleteScheduledTask,
    toggleScheduledTask, triggerScheduledTask, syncTasksToBackend, getSchedulerLogs
  }
}
