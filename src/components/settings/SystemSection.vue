<script setup lang="ts">
import { ref } from 'vue'

const autoStart = ref(false)
const keepAwake = ref(false)
const desktopNotify = ref(true)
const soundNotify = ref(false)

const permissions = ref([
  { name: '完全磁盘访问权限', desc: '允许应用访问电脑上的文件，用于读写项目文件等操作', status: 'granted', icon: 'fa-solid fa-hard-drive' },
  { name: '录屏与系统录音', desc: '允许应用进行屏幕截取，用于屏幕内容识别、反馈截图等功能', status: 'pending', icon: 'fa-solid fa-video' },
  { name: '辅助功能', desc: '允许应用监听全局快捷键，用于快捷唤起等功能', status: 'pending', icon: 'fa-solid fa-universal-access' },
  { name: '自动化', desc: '允许应用与系统应用协作，用于创建提醒事项、查看日历日程、编辑备忘录等', status: 'granted', icon: 'fa-solid fa-robot' },
  { name: '通知', desc: '允许应用发送桌面通知，用于任务完成、消息提醒等场景', status: 'pending', icon: 'fa-solid fa-bell' },
  { name: '位置服务', desc: '允许应用获取位置信息，用于处理与地理位置相关的任务', status: 'granted', icon: 'fa-solid fa-location-dot' },
])
</script>

<template>
  <div class="content-section">
    <h1>系统设置</h1>
    <p class="section-desc">开机自启动、保持唤醒、通知等系统级选项。</p>

    <div class="settings-card">
      <div class="setting-row">
        <div class="setting-info"><span class="setting-label">开机自动启动</span><span class="setting-hint">登录电脑时自动启动 QoderWork</span></div>
        <label class="toggle"><input type="checkbox" v-model="autoStart"><span class="toggle-slider"></span></label>
      </div>
      <div class="setting-divider"></div>
      <div class="setting-row">
        <div class="setting-info"><span class="setting-label">保持系统唤醒</span><span class="setting-hint">防止电脑在 Agent 工作时自动进入睡眠</span></div>
        <label class="toggle"><input type="checkbox" v-model="keepAwake"><span class="toggle-slider"></span></label>
      </div>
      <div class="setting-divider"></div>
      <div class="setting-row">
        <div class="setting-info"><span class="setting-label">桌面通知</span><span class="setting-hint">Agent 等待回复或完成工作时，发送系统通知提醒台</span></div>
        <label class="toggle"><input type="checkbox" v-model="desktopNotify"><span class="toggle-slider"></span></label>
      </div>
      <div class="setting-divider"></div>
      <div class="setting-row">
        <div class="setting-info"><span class="setting-label">声音通知</span><span class="setting-hint">Agent 完成工作时播放提示音</span></div>
        <label class="toggle"><input type="checkbox" v-model="soundNotify"><span class="toggle-slider"></span></label>
      </div>
    </div>

    <div class="settings-card">
      <div v-for="perm in permissions" :key="perm.name" class="perm-row">
        <i :class="perm.icon" class="perm-icon"></i>
        <div class="perm-info">
          <span class="perm-name">{{ perm.name }} <span class="perm-status" :class="perm.status">{{ perm.status === 'granted' ? '已授权' : '未授权' }}</span></span>
          <span class="perm-desc">{{ perm.desc }}</span>
        </div>
        <button v-if="perm.status === 'pending'" class="perm-btn">去授权 <i class="fa-solid fa-arrow-up-right-from-square"></i></button>
      </div>
    </div>
  </div>
</template>
