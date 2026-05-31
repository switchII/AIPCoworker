import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { TaskRecord } from '../../types/agent'

export function useTaskManager() {
  const tasks = ref<TaskRecord[]>([])
  const currentTaskId = ref<string | null>(null)
  const currentTask = computed(() =>
    tasks.value.find(t => t.id === currentTaskId.value) || null
  )

  // ---- 持久化 ----
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  /** 防抖保存任务到磁盘 */
  function scheduleSave(taskId: string) {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      const t = tasks.value.find(t => t.id === taskId)
      if (!t) return
      try {
        await invoke('save_task', {
          taskId: t.id,
          taskJson: JSON.stringify(t),
        })
      } catch (e) {
        console.warn('[TaskManager] 保存任务失败:', e)
      }
    }, 500)
  }

  /** 立即保存指定任务（无防抖） */
  async function saveTaskNow(taskId: string) {
    const t = tasks.value.find(t => t.id === taskId)
    if (!t) return
    try {
      await invoke('save_task', {
        taskId: t.id,
        taskJson: JSON.stringify(t),
      })
    } catch (e) {
      console.warn('[TaskManager] 保存任务失败:', e)
    }
  }

  /** 从磁盘加载最新任务 */
  async function loadTasks(limit: number = 20) {
    try {
      const json = await invoke<string>('load_tasks', { limit })
      const loaded = JSON.parse(json) as TaskRecord[]
      // 将上次运行中（未完成）的任务标记为“中断”
      for (const t of loaded) {
        if (t.status === 'running') {
          t.status = 'failed'
          t.report = t.report || '任务未完成，应用已关闭'
        }
      }
      tasks.value = loaded
      console.log(`[TaskManager] 已加载 ${loaded.length} 条历史任务`)
    } catch (e) {
      console.warn('[TaskManager] 加载任务失败:', e)
    }
  }

  function createTask(input: string, dir: string, skills: string[], suites: string[], mcpServerIds: string[] = [], connectorIds: string[] = []): TaskRecord {
    const id = `task-${Date.now()}`
    const task: TaskRecord = {
      id, title: input.slice(0, 30) + (input.length > 30 ? '...' : ''),
      status: 'running', elapsedSeconds: 0, startTime: Date.now(),
      input, dir, skills, suites, mcpServerIds, connectorIds, blocks: [], genFiles: [],
    }
    tasks.value.unshift(task)
    currentTaskId.value = id
    scheduleSave(id)
    return task
  }

  function updateTask(taskId: string, updates: Partial<TaskRecord>) {
    const t = tasks.value.find(t => t.id === taskId)
    if (t) {
      Object.assign(t, updates)
      scheduleSave(taskId)
    }
  }

  function addBlock(taskId: string, block: any) {
    const t = tasks.value.find(t => t.id === taskId)
    if (t) {
      t.blocks.push(block)
      scheduleSave(taskId)
    }
  }

  function updateBlockStatus(taskId: string, blockId: string, status: string) {
    const t = tasks.value.find(t => t.id === taskId)
    if (t) {
      const b = t.blocks.find(b => b.id === blockId)
      if (b) {
        b.status = status as any
        scheduleSave(taskId)
      }
    }
  }

  function updateStepStatus(taskId: string, blockId: string, stepId: string, status: string) {
    const t = tasks.value.find(t => t.id === taskId)
    if (t) {
      const b = t.blocks.find(b => b.id === blockId)
      if (b) {
        const s = b.steps.find(s => s.id === stepId)
        if (s) {
          s.status = status as any
          scheduleSave(taskId)
        }
      }
    }
  }

  function updateBlock(taskId: string, blockId: string, updates: Partial<any>) {
    const t = tasks.value.find(t => t.id === taskId)
    if (t) {
      const b = t.blocks.find(b => b.id === blockId)
      if (b) {
        Object.assign(b, updates)
        scheduleSave(taskId)
      }
    }
  }

  function addStep(taskId: string, blockId: string, step: any) {
    const t = tasks.value.find(t => t.id === taskId)
    if (t) {
      const b = t.blocks.find(b => b.id === blockId)
      if (b) {
        b.steps.push(step)
        scheduleSave(taskId)
      }
    }
  }

  function updateStep(taskId: string, blockId: string, stepId: string, updates: Partial<any>) {
    const t = tasks.value.find(t => t.id === taskId)
    if (t) {
      const b = t.blocks.find(b => b.id === blockId)
      if (b) {
        const s = b.steps.find(s => s.id === stepId)
        if (s) {
          Object.assign(s, updates)
          scheduleSave(taskId)
        }
      }
    }
  }

  /** 删除任务：从内存和磁盘同时移除 */
  async function deleteTask(taskId: string) {
    // 从内存中移除
    tasks.value = tasks.value.filter(t => t.id !== taskId)
    if (currentTaskId.value === taskId) {
      currentTaskId.value = null
    }
    // 从磁盘删除
    try {
      await invoke('delete_task', { taskId })
    } catch (e) {
      console.warn('[TaskManager] 删除任务失败:', e)
    }
  }

  return {
    tasks, currentTaskId, currentTask,
    createTask, updateTask, addBlock, updateBlockStatus, updateStepStatus,
    updateBlock, addStep, updateStep,
    loadTasks, saveTaskNow, deleteTask,
  }
}
