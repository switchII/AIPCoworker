/**
 * 用户相关 API
 *
 * 用法:
 *   import { userApi } from '@/api'
 *   const user = await userApi.getInfo()
 */

import { get, post, put } from '@/utils/request'

// ======================== 类型定义 ========================

export interface UserInfo {
  id: string
  username: string
  nickname: string
  avatar?: string
  email?: string
}

export interface LoginParams {
  username: string
  password: string
}

export interface LoginResult {
  token: string
  user: UserInfo
}

// ======================== API ========================

const userApi = {
  /** 登录 */
  login(params: LoginParams) {
    return post<LoginResult>('/api/auth/login', params)
  },

  /** 获取当前用户信息 */
  getInfo() {
    return get<UserInfo>('/api/user/info')
  },

  /** 更新用户信息 */
  updateInfo(data: Partial<UserInfo>) {
    return put<UserInfo>('/api/user/info', data)
  },

  /** 登出 */
  logout() {
    return post<null>('/api/auth/logout')
  },
}

export default userApi
