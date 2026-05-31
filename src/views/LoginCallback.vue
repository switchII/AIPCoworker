<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

onMounted(() => {
  // 从 URL 参数中获取统一登录页面返回的信息
  const { token, code } = route.query

  // 模拟：只要从统一登录页面回调回来，就认为登录成功
  // 实际项目中应该根据 token/code 调用后端 API 验证并获取用户信息
  const userInfo = {
    name: '统一登录用户',
    avatar: 'U',
    phone: '',
    plan: 'Pro plus 方案',
    loginAt: Date.now(),
    // 保留回调参数供后续使用
    _callbackToken: token as string || '',
    _callbackCode: code as string || ''
  }

  localStorage.setItem('aipcowork_auth', JSON.stringify(userInfo))

  // 登录成功后跳转到首页
  router.replace('/new-task')
})
</script>

<template>
  <div class="callback-page">
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p class="loading-text">正在完成登录...</p>
    </div>
  </div>
</template>

<style scoped>
.callback-page {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #F7F8FA;
}

.loading-spinner {
  text-align: center;
}

.spinner {
  width: 40px;
  height: 40px;
  margin: 0 auto 16px;
  border: 3px solid #E5E5E5;
  border-top-color: #1A1A1A;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 14px;
  color: #999;
  margin: 0;
}
</style>
