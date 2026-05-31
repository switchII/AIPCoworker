/**
 * Desktop notification module.
 *
 * Wraps `@tauri-apps/plugin-notification` and exposes a small helper API so
 * the rest of the application can fire toast notifications without caring
 * about permission checks or platform quirks.
 */

import {
  sendNotification as tauriSend,
  isPermissionGranted,
  requestPermission,
} from '@tauri-apps/plugin-notification'

/** Cache the permission state so we don't re-check on every call. */
let permissionGranted: boolean | null = null

/**
 * Ensure notification permission has been granted.
 *
 * On the first call it will check via `isPermissionGranted()`; if the user
 * hasn't decided yet it will prompt via `requestPermission()`.  The result
 * is cached for subsequent calls.
 */
export async function ensurePermission(): Promise<boolean> {
  if (permissionGranted !== null) return permissionGranted

  const granted = await isPermissionGranted()
  if (granted) {
    permissionGranted = true
    return true
  }

  const result = await requestPermission()
  permissionGranted = result === 'granted'
  return permissionGranted
}

/**
 * Send a desktop toast notification.
 *
 * @param title   – Notification title (required).
 * @param body    – Optional body text shown below the title.
 * @returns `true` when the notification was sent, `false` if permission was
 *          denied or an error occurred.
 */
export async function notify(title: string, body?: string): Promise<boolean> {
  try {
    const ok = await ensurePermission()
    if (!ok) {
      console.warn('[notification] permission denied – skipping notification')
      return false
    }
    tauriSend({ title, body })
    return true
  } catch (err) {
    console.error('[notification] failed to send:', err)
    return false
  }
}

/**
 * Convenience helper — notify that a task has completed.
 */
export async function notifyTaskComplete(taskTitle: string): Promise<boolean> {
  return notify('任务完成', taskTitle)
}

/**
 * Convenience helper — notify that a task has failed.
 */
export async function notifyTaskFailed(taskTitle: string): Promise<boolean> {
  return notify('任务失败', taskTitle)
}
