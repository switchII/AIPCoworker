// 调度器 & 触发器
export type ScheduleType = 'cron' | 'interval' | 'once'

export interface ScheduledTask {
  id: string
  name: string
  description: string
  schedule: {
    type: ScheduleType
    expression?: string
    intervalMs?: number
    runAt?: string
  }
  command: string
  message: string
  enabled: boolean
  lastRun?: string
  nextRun?: string
}

export type TriggerType = 'file_watch' | 'webhook' | 'cron' | 'im_keyword'

export interface TriggerConfig {
  id: string
  name: string
  type: TriggerType
  pattern: string
  action: string
  enabled: boolean
  debounceMs: number
}
