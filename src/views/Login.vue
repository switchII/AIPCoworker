<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

// 统一登录页面地址
const UNIFIED_LOGIN_URL = 'https://alinesno-infra-base-identity-auth-application.linesno.com/login'

// 桌面端 Deep Link 回调地址
const DEEP_LINK_CALLBACK = 'aipcowork://login/callback'

// 跳转到统一登录页面（外部浏览器）
async function goToLogin() {
  const redirectUrl = `${UNIFIED_LOGIN_URL}?redirect=${encodeURIComponent(DEEP_LINK_CALLBACK)}`
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(redirectUrl)
  } catch {
    // 非 Tauri 环境回退到当前窗口跳转
    window.location.href = redirectUrl
  }
}

// 模拟登录（用于开发测试）
function handleMockLogin() {
  const userInfo = {
    name: '演示用户',
    avatar: 'D',
    phone: '',
    plan: 'Pro plus 方案',
    loginAt: Date.now()
  }
  localStorage.setItem('aipcowork_auth', JSON.stringify(userInfo))
  router.replace('/new-task')
}

// 若直接访问 /login?token=xxx 也视为回调登录
onMounted(() => {
  const token = route.query.token as string
  if (token) {
    const userInfo = {
      name: '统一登录用户',
      avatar: 'U',
      phone: '',
      plan: 'Pro plus 方案',
      loginAt: Date.now()
    }
    localStorage.setItem('aipcowork_auth', JSON.stringify(userInfo))
    router.replace('/new-task')
  }
})
</script>

<template>
  <div class="login-page">

    <div class="login-card">
      <!-- Logo -->
      <div class="login-header">
        <div class="logo-wrap">
          <img src="/logo.png" alt="AIPCowork" class="logo-img" />
        </div>
        <h1 class="login-title">AIPCowork</h1>
        <p class="login-subtitle">智能协作，从这里开始</p>
      </div>

      <!-- 登录按钮 -->
      <div class="login-action">
        <button class="login-btn" @click="goToLogin">
          <i class="fa-solid fa-arrow-right-to-bracket btn-icon"></i>
          <span>登 录</span>
        </button>

        <button class="mock-login-btn" @click="handleMockLogin">
          模拟登录（开发测试）
        </button>

        <p class="login-tip">
          点击后将跳转至统一身份认证页面
        </p>
      </div>

      <!-- 底部 -->
      <div class="login-bottom">
        <p class="agreement">
          登录即表示同意
          <a href="javascript:;">用户协议</a> 和 <a href="javascript:;">隐私政策</a>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #F7F8FA;
  position: relative;
  overflow: hidden;
}

/* 背景装饰 */
.login-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}
.bg-circle {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.4;
}
.c1 { width: 400px; height: 400px; background: #6366F1; top: -100px; left: -80px; }
.c2 { width: 300px; height: 300px; background: #22D3EE; bottom: -60px; right: -40px; }
.c3 { width: 200px; height: 200px; background: #F59E0B; top: 50%; left: 60%; }

/* 卡片 */
.login-card {
  position: relative;
  z-index: 1;
  width: 400px;
  background: #FFF;
  border-radius: 20px;
  padding: 40px 36px 32px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04);
}

/* 头部 */
.login-header {
  text-align: center;
  margin-bottom: 36px;
}
.logo-wrap {
  width: 56px; height: 56px;
  margin: 0 auto 12px;
  display: flex; align-items: center; justify-content: center;
}
.logo-img { width: 48px; height: 48px; object-fit: contain; }
.login-title { font-size: 22px; font-weight: 700; color: #1A1A1A; margin: 0 0 4px; }
.login-subtitle { font-size: 14px; color: #999; margin: 0; }

/* 登录操作区 */
.login-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

/* 登录按钮 */
.login-btn {
  width: 100%;
  height: 52px;
  border: none;
  border-radius: 14px;
  background: #1A1A1A;
  color: #FFF;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.login-btn:hover { opacity: 0.9; }
.login-btn:active { transform: scale(0.985); }
.btn-icon { font-size: 18px; }

/* 模拟登录按钮 */
.mock-login-btn {
  width: 100%;
  height: 40px;
  border: 1px dashed #CCC;
  border-radius: 10px;
  background: transparent;
  color: #999;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.mock-login-btn:hover {
  border-color: #999;
  color: #666;
  background: #FAFAFA;
}

/* 提示文字 */
.login-tip {
  font-size: 12px;
  color: #BBB;
  margin: 0;
  text-align: center;
}

/* 底部 */
.login-bottom { margin-top: 32px; text-align: center; }
.agreement { font-size: 11px; color: #CCC; margin: 0; }
.agreement a { color: #999; text-decoration: none; }
.agreement a:hover { color: #1A1A1A; text-decoration: underline; }
</style>
