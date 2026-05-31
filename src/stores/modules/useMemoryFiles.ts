import { ref } from 'vue'
import type { MemoryEntry } from '../../types/agent'

export interface MemoryFileEntry {
  name: string
  type: string
  path: string
  children: MemoryFileEntry[]
  created_at?: string
  file_size?: string
  content?: string
}

export function useMemoryFiles() {
  const memories = ref<MemoryEntry[]>([])

  async function initMemoryFiles(): Promise<string> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<string>('init_memory_files')
    } catch (e) {
      console.warn('init_memory_files failed:', e)
      return '~/.aipcowork'
    }
  }

  async function loadMemoryTree(): Promise<MemoryFileEntry[]> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<MemoryFileEntry[]>('read_memory_tree')
    } catch (e) {
      console.warn('read_memory_tree failed:', e)
      return []
    }
  }

  async function readMemoryFile(path: string): Promise<string> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<string>('read_memory_file', { path })
    } catch (e) {
      console.warn('read_memory_file failed:', e)
      return ''
    }
  }

  async function saveMemoryFile(path: string, content: string): Promise<boolean> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('write_memory_file', { path, content })
      return true
    } catch (e) {
      console.warn('write_memory_file failed:', e)
      return false
    }
  }

  return { memories, initMemoryFiles, loadMemoryTree, readMemoryFile, saveMemoryFile }
}
