/**
 * API 模块统一入口
 *
 * 使用方式:
 *   import { userApi, creditsApi, feedbackApi, helpApi } from '@/api'
 *
 *   const user = await userApi.getInfo()
 *   const credits = await creditsApi.getCredits()
 *   const result = await feedbackApi.submit({ ... })
 *   const help = await helpApi.getInfo()
 */

export { default as userApi } from './user'
export { default as creditsApi } from './credits'
export { default as feedbackApi } from './feedback'
export { default as helpApi } from './help'
export { default as skillsApi } from './skills'
export { default as suitesApi } from './suites'

// 按需导出更多 API 模块...
