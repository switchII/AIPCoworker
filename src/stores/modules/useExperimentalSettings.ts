import { ref } from 'vue'

/** 实验特性设置 */
export interface ExperimentalSettings {
  /** 开启调试模式（显示 TaskRunner 调试面板） */
  debugEnabled: boolean
  /** 启用 QuickPick 全局快速任务窗口 */
  quickPickEnabled: boolean
}

const defaultSettings: ExperimentalSettings = {
  debugEnabled: false,
  quickPickEnabled: false,
}

export function useExperimentalSettings() {
  const experimentalSettings = ref<ExperimentalSettings>({ ...defaultSettings })

  /** 从本地持久化加载设置 */
  async function loadSettings() {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const json = await invoke<string>('load_settings')
      const parsed = JSON.parse(json) as Record<string, any>
      // 合并 experimental 字段
      if (parsed.experimental) {
        Object.assign(experimentalSettings.value, parsed.experimental)
      }
    } catch (e) {
      console.warn('[ExperimentalSettings] 加载设置失败，使用默认值:', e)
    }
  }

  /** 保存设置到本地持久化 */
  async function saveSettings() {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      // 读取现有完整配置，合并 experimental 部分后写回
      let existing: Record<string, any> = {}
      try {
        const json = await invoke<string>('load_settings')
        existing = JSON.parse(json)
      } catch { /* 文件不存在时使用空对象 */ }
      existing.experimental = experimentalSettings.value
      await invoke('save_settings', { configJson: JSON.stringify(existing, null, 2) })
    } catch (e) {
      console.error('[ExperimentalSettings] 保存设置失败:', e)
    }
  }

  /** 更新单个实验特性 */
  async function updateExperimental<K extends keyof ExperimentalSettings>(
    key: K,
    value: ExperimentalSettings[K],
  ) {
    experimentalSettings.value[key] = value
    await saveSettings()
  }

  return {
    experimentalSettings,
    loadSettings,
    saveSettings,
    updateExperimental,
  }
}
