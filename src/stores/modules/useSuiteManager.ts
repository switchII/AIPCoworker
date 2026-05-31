/**
 * 专家套件管理模块
 *
 * 专家套件 = 多个技能的命名组合。用户安装套件后，
 * 在新建任务时可选用该套件，自动启用其包含的所有技能。
 *
 * 持久化：
 *   - 快速缓存：localStorage（即时读写）
 *   - 文件持久化：~/.aipcowork/suites/suites.json（通过 Rust invoke）
 */
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { ExpertSuite } from '../../types/integration'

export function useSuiteManager() {
  const suites = ref<ExpertSuite[]>([])

  // ── 持久化 ──────────────────────────────────────────────────

  function cacheSave() {
    try {
      localStorage.setItem('aipcowork_suites', JSON.stringify(suites.value))
    } catch { /* ignore */ }
  }

  function cacheLoad(): ExpertSuite[] {
    try {
      const raw = localStorage.getItem('aipcowork_suites')
      if (raw) {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
      }
    } catch { /* ignore */ }
    return []
  }

  /** 从文件加载套件（启动时调用，覆盖缓存） */
  async function loadSuites(): Promise<ExpertSuite[]> {
    try {
      const json = await invoke<string>('load_suites')
      const loaded = JSON.parse(json) as ExpertSuite[]
      if (Array.isArray(loaded)) {
        suites.value = loaded
        cacheSave()
      }
    } catch (e) {
      console.warn('[SuiteManager] 从文件加载套件失败，使用缓存:', e)
      suites.value = cacheLoad()
    }
    return suites.value
  }

  async function fileSave() {
    try {
      await invoke('save_suites', { configJson: JSON.stringify(suites.value) })
    } catch (e) {
      console.warn('[SuiteManager] 保存套件到文件失败:', e)
    }
  }

  // ── CRUD ────────────────────────────────────────────────────

  async function addSuite(suite: ExpertSuite) {
    suites.value.push(suite)
    cacheSave()
    await fileSave()
  }

  async function updateSuite(id: string, updates: Partial<ExpertSuite>) {
    const idx = suites.value.findIndex(s => s.id === id)
    if (idx !== -1) {
      suites.value[idx] = { ...suites.value[idx], ...updates }
      cacheSave()
      await fileSave()
    }
  }

  async function removeSuite(id: string) {
    suites.value = suites.value.filter(s => s.id !== id)
    cacheSave()
    await fileSave()
  }

  async function toggleSuite(id: string) {
    const idx = suites.value.findIndex(s => s.id === id)
    if (idx !== -1) {
      suites.value[idx].installed = !suites.value[idx].installed
      cacheSave()
      await fileSave()
    }
  }

  function getSuite(id: string): ExpertSuite | undefined {
    return suites.value.find(s => s.id === id)
  }

  /** 获取所有已安装的套件 */
  function getInstalledSuites(): ExpertSuite[] {
    return suites.value.filter(s => s.installed)
  }

  /** 根据套件 ID 解析其包含的所有技能名称 */
  function getSkillNamesForSuite(id: string): string[] {
    const suite = getSuite(id)
    return suite?.skillIds || []
  }

  return {
    suites,
    loadSuites,
    addSuite, updateSuite, removeSuite, toggleSuite,
    getSuite, getInstalledSuites, getSkillNamesForSuite,
  }
}
