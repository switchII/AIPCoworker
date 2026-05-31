<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const userName = ref('Easton')
const userEmail = ref('landonniao@163.com')
const userPlan = ref('Pro plus 方案')
const avatarColor = ref('#10b981')
const avatarColors = ['#d1fae5','#fecdd3','#c7d2fe','#fde68a','#fed7aa','#a7f3d0','#bae6fd','#e5e7eb','#1a1a1a','#ddd6fe','#d1fae5']

function handleLogout() {
  localStorage.removeItem('aipcowork_auth')
  router.replace('/login')
}
</script>

<template>
  <div class="content-section">
    <h1>个人资料</h1>
    <p class="section-desc">头像、邮箱与订阅信息。</p>

    <div class="settings-card">
      <div class="profile-header">
        <div class="profile-avatar" :style="{ background: avatarColor }"><span>E</span></div>
        <span class="profile-name">{{ userName }}</span>
      </div>
      <div class="setting-divider"></div>
      <div class="color-picker">
        <span class="setting-label">背景色</span>
        <div class="color-options">
          <div v-for="c in avatarColors" :key="c" class="color-dot" :style="{ background: c }" :class="{ active: avatarColor === c }" @click="avatarColor = c"></div>
        </div>
      </div>
    </div>

    <div class="settings-card">
      <div class="setting-row">
        <div class="setting-info"><span class="setting-label">邮箱</span><span class="setting-hint">当前账户绑定的邮箱地址</span></div>
        <span class="setting-value">{{ userEmail }}</span>
      </div>
      <div class="setting-divider"></div>
      <div class="setting-row">
        <div class="setting-info"><span class="setting-label">订阅</span><span class="setting-hint">当前账户的套餐</span></div>
        <div class="plan-info">
          <span class="plan-badge">{{ userPlan }}</span>
          <a class="plan-link">查看套餐与定价</a>
        </div>
      </div>
      <div class="setting-divider"></div>
      <div class="setting-row">
        <div class="setting-info"><span class="setting-label">退出登录</span><span class="setting-hint">在此设备退出登录，可随时重新登录。</span></div>
        <button class="logout-btn" @click="handleLogout"><i class="fa-solid fa-arrow-right-from-bracket"></i> 退出登录</button>
      </div>
    </div>
  </div>
</template>
