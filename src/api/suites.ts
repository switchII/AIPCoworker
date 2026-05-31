/**
 * 专家套件 API
 *
 * 用法:
 *   import { suitesApi } from '@/api'
 *   const suites = await suitesApi.getAll()
 *   await suitesApi.install('fullstack-dev')
 *   await suitesApi.uninstall('fullstack-dev')
 *   await suitesApi.remove('fullstack-dev')
 */

import { get, post } from '@/utils/request'
import { USE_MOCK } from '@/mock'
import {
  mockGetSuites,
  mockToggleSuiteInstall,
  mockDeleteSuite,
  type ExpertSuiteManifest,
} from '@/mock/suites'

// ======================== 类型导出 ========================

export type { ExpertSuiteManifest }

// ======================== API ========================

const suitesApi = {
  /** 获取所有专家套件 */
  async getAll(): Promise<ExpertSuiteManifest[]> {
    if (USE_MOCK) return mockGetSuites()
    return get<ExpertSuiteManifest[]>('/api/suites')
  },

  /** 安装套件 */
  async install(suiteId: string): Promise<void> {
    if (USE_MOCK) return mockToggleSuiteInstall(suiteId, true)
    return post<void>(`/api/suites/${suiteId}/install`)
  },

  /** 卸载套件 */
  async uninstall(suiteId: string): Promise<void> {
    if (USE_MOCK) return mockToggleSuiteInstall(suiteId, false)
    return post<void>(`/api/suites/${suiteId}/uninstall`)
  },

  /** 删除套件 */
  async remove(suiteId: string): Promise<void> {
    if (USE_MOCK) return mockDeleteSuite(suiteId)
    return post<void>(`/api/suites/${suiteId}/remove`)
  },
}

export default suitesApi
