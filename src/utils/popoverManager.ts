/**
 * Singleton popover manager — ensures only one picker popover is open at a time.
 * Each picker registers a unique ID; opening one closes all others.
 */

import { onMounted, onUnmounted, type Ref } from 'vue'

const closeCallbacks = new Map<string, () => void>()

/**
 * Composable for popover mutual exclusion.
 * @param id     Unique identifier for this popover
 * @param showRef The reactive ref controlling this popover's visibility
 */
export function usePopoverManager(id: string, showRef: Ref<boolean>) {
  function closeMe() {
    showRef.value = false
  }

  /** Call this just before setting showRef = true */
  function openPopover() {
    for (const [otherId, onClose] of closeCallbacks) {
      if (otherId !== id) onClose()
    }
  }

  onMounted(() => {
    closeCallbacks.set(id, closeMe)
  })

  onUnmounted(() => {
    closeCallbacks.delete(id)
  })

  return { openPopover }
}
