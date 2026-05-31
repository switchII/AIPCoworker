<script setup lang="ts">
import { ref, reactive } from 'vue'

interface IMChannel {
  id: string
  name: string
  description: string
  status: 'disconnected' | 'connected' | 'error'
  errorMsg?: string
  logo: string
  color: string
}

const channels = ref<IMChannel[]>([
  {
    id: 'dingtalk',
    name: '钉钉',
    description: '通过钉钉机器人接收并回复用户消息',
    status: 'disconnected',
    logo: 'dingtalk',
    color: '#0089FF'
  },
  {
    id: 'feishu',
    name: '飞书',
    description: '通过飞书机器人接收并回复用户消息',
    status: 'disconnected',
    logo: 'feishu',
    color: '#3370FF'
  },
  {
    id: 'wechat',
    name: '微信',
    description: '通过微信机器人接收并回复用户消息',
    status: 'error',
    errorMsg: '微信登录已过期，可能在其他应用上登录了同一账号',
    logo: 'wechat',
    color: '#07C160'
  },
  {
    id: 'wecom',
    name: '企业微信',
    description: '通过企业微信机器人接收并回复用户消息',
    status: 'disconnected',
    logo: 'wecom',
    color: '#2BAD13'
  }
])

// 弹窗控制
const showConfigDialog = ref(false)
const currentChannel = ref<IMChannel | null>(null)

// 企业微信配置模式
const wecomMode = ref<'qr' | 'manual'>('qr')
const wecomForm = reactive({
  botId: '',
  secret: ''
})

// 打开配置弹窗
function openConfig(channel: IMChannel) {
  currentChannel.value = channel
  showConfigDialog.value = true
  // 重置企业微信配置模式
  if (channel.id === 'wecom') {
    wecomMode.value = 'qr'
    wecomForm.botId = ''
    wecomForm.secret = ''
  }
}

// 关闭弹窗
function closeConfig() {
  showConfigDialog.value = false
  currentChannel.value = null
}

// 刷新二维码
function refreshQRCode() {
  // TODO: 调用后端刷新二维码
  console.log('刷新二维码', currentChannel.value?.id)
}

// 保存企业微信手动配置
function saveWecomManual() {
  if (!wecomForm.botId || !wecomForm.secret) return
  // TODO: 调用后端保存配置
  console.log('保存企业微信配置', wecomForm)
  closeConfig()
}

// 切换频道开关
function toggleChannel(channel: IMChannel) {
  if (channel.status === 'connected') {
    channel.status = 'disconnected'
  } else {
    channel.status = 'connected'
  }
}

// 重新扫码登录（微信）
function reconnectWechat() {
  const wechat = channels.value.find(c => c.id === 'wechat')
  if (wechat) {
    openConfig(wechat)
  }
}
</script>

<template>
  <div class="page-container">
    <!-- 顶部装饰图标 -->
    <div class="page-header">
      <div class="header-icon">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="24" fill="#E8F5E9"/>
          <path d="M24 14c-5.52 0-10 4.48-10 10s4.48 10 10 10 10-4.48 10-10-4.48-10-10-10z" fill="#A5D6A7"/>
          <path d="M22 20c-2 0-3.5 1.3-3.5 3 0 .9.5 1.7 1.3 2.3l-.3 1.2.7-.4c.4.1.8.2 1.3.2.1 0 .3 0 .4 0-.1-.3-.1-.5-.1-.8 0-1.7 1.6-3.1 3.5-3.1.2 0 .3 0 .5 0-.5-1.5-2-2.4-3.8-2.4z" fill="white"/>
          <path d="M28.5 23.5c-1.7 0-3 1.1-3 2.5s1.3 2.5 3 2.5c.4 0 .7-.1 1.1-.2l.6.3-.2-1c.7-.5 1.1-1.1 1.1-1.9 0-1.2-1.3-2.2-2.6-2.2z" fill="white" fill-opacity="0.8"/>
        </svg>
      </div>
      <h1>IM 频道</h1>
      <p class="subtitle">配置 IM 频道，让 AIPCowork接收来自钉钉、飞书等平台的消息。</p>
      <p class="subtitle">频道配置信息仅存储在本地，不会上传到云端。</p>
    </div>

    <!-- IM 列表 -->
    <div class="im-list">
      <div
        v-for="channel in channels"
        :key="channel.id"
        class="im-item"
      >
        <div class="im-left">
          <!-- Logo -->
          <div class="im-logo" :style="{ background: channel.color + '15' }">
            <!-- 钉钉 -->
            <svg v-if="channel.logo === 'dingtalk'" width="32" height="32" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="20" :fill="channel.color"/>
              <path d="M33.6 22.1c-.1-.1-.2-.1-.3-.1-.2 0-.3.1-.4.3 0 .1-.1.6-.2 1.3-.4-.1-1.5-.5-2.7-1l-.3-.1c-1.3-.6-2.1-1.1-2.1-1.1l-.1-.1c-.4-.2-.7-.4-.7-.4s.1.3.4.8c.2.4.6.9.6.9s-1.5-.3-2.2-.5c-.7-.2-1.5-.5-1.5-.5s.3.4.9.9c.6.5 1.5 1.1 1.5 1.1s-1.2 0-1.7 0c-.5 0-1.2.1-1.2.1s.4.4 1 .7c.6.4 1.6.7 1.6.7s-.5.2-.8.6c-.2.3-.2.5-.2.5s.5-.1 1.2-.1c.7 0 1.6.1 1.6.1l-1.3 1.1c-.6.5-1.5 1.4-1.5 1.4h3.1l.4-1.1.8-2 .6-1.5c.1-.4.3-.9.4-1.3.1-.3.1-.5.1-.6z" fill="white"/>
            </svg>
            <!-- 飞书 -->
            <svg v-if="channel.logo === 'feishu'" width="32" height="32" viewBox="0 0 48 48" fill="none">
              <rect x="4" y="4" width="40" height="40" rx="10" :fill="channel.color"/>
              <path d="M14 18l8 4 8-4M14 24l8 4 8-4M14 30l8 4 8-4" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            </svg>
            <!-- 微信 -->
            <svg v-if="channel.logo === 'wechat'" width="32" height="32" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="20" :fill="channel.color"/>
              <path d="M20 17c-4 0-7 2.6-7 6 0 1.8 1 3.4 2.6 4.6l-.6 2.4 1.4-.8c.8.2 1.6.4 2.6.4.2 0 .6 0 .8 0-.2-.6-.2-1-.2-1.6 0-3.4 3.2-6.2 7-6.2.4 0 .6 0 1 0-1-3-4.4-4.8-7.6-4.8z" fill="white"/>
              <path d="M33 23c-3.4 0-6 2.2-6 5s2.6 5 6 5c.8 0 1.4-.2 2.2-.4l1.2.6-.4-2c1.4-1 2.2-2.4 2.2-4 0-2.4-2.6-4.2-5.2-4.2z" fill="white" fill-opacity="0.85"/>
            </svg>
            <!-- 企业微信 -->
            <svg v-if="channel.logo === 'wecom'" width="32" height="32" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="20" fill="#4086FC"/>
              <circle cx="19" cy="19" r="3" fill="white"/>
              <circle cx="29" cy="19" r="3" fill="#FFC107"/>
              <circle cx="19" cy="29" r="3" fill="#4CAF50"/>
              <circle cx="29" cy="29" r="3" fill="#F44336"/>
              <path d="M22 19h4M24 22v4M22 29h4M19 22v4M29 22v4" stroke="white" stroke-opacity="0.5" stroke-width="1"/>
            </svg>
          </div>

          <!-- 信息 -->
          <div class="im-info">
            <div class="im-name-row">
              <span class="im-name">{{ channel.name }}</span>
              <span v-if="channel.status === 'error'" class="status-badge error">连接失败</span>
            </div>
            <span class="im-desc">{{ channel.description }}</span>
            <div v-if="channel.status === 'error' && channel.errorMsg" class="error-info">
              <span class="error-msg">{{ channel.errorMsg }}</span>
              <a class="reconnect-link" @click="reconnectWechat">重新扫码登录</a>
            </div>
          </div>
        </div>

        <!-- 右侧操作 -->
        <div class="im-right">
          <!-- 已连接或错误状态：显示更多菜单 + 开关 -->
          <template v-if="channel.status === 'connected' || channel.status === 'error'">
            <button class="more-btn" @click="openConfig(channel)">
              <i class="fa-solid fa-ellipsis"></i>
            </button>
            <label class="toggle-switch">
              <input
                type="checkbox"
                :checked="channel.status === 'connected' || channel.status === 'error'"
                @change="toggleChannel(channel)"
              />
              <span class="toggle-slider"></span>
            </label>
          </template>
          <!-- 未连接状态：显示配置按钮 -->
          <template v-else>
            <button class="config-btn" @click="openConfig(channel)">
              配置
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- 配置弹窗遮罩 -->
    <Teleport to="body">
      <div v-if="showConfigDialog && currentChannel" class="dialog-overlay" @click.self="closeConfig">
        <div class="config-dialog">
          <!-- 顶部图标 -->
          <div class="dialog-icon" :style="{ background: currentChannel.color + '10' }">
            <!-- 重用 logo SVG -->
            <svg v-if="currentChannel.logo === 'dingtalk'" width="36" height="36" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="20" :fill="currentChannel.color"/>
              <path d="M33.6 22.1c-.1-.1-.2-.1-.3-.1-.2 0-.3.1-.4.3 0 .1-.1.6-.2 1.3-.4-.1-1.5-.5-2.7-1l-.3-.1c-1.3-.6-2.1-1.1-2.1-1.1l-.1-.1c-.4-.2-.7-.4-.7-.4s.1.3.4.8c.2.4.6.9.6.9s-1.5-.3-2.2-.5c-.7-.2-1.5-.5-1.5-.5s.3.4.9.9c.6.5 1.5 1.1 1.5 1.1s-1.2 0-1.7 0c-.5 0-1.2.1-1.2.1s.4.4 1 .7c.6.4 1.6.7 1.6.7s-.5.2-.8.6c-.2.3-.2.5-.2.5s.5-.1 1.2-.1c.7 0 1.6.1 1.6.1l-1.3 1.1c-.6.5-1.5 1.4-1.5 1.4h3.1l.4-1.1.8-2 .6-1.5c.1-.4.3-.9.4-1.3.1-.3.1-.5.1-.6z" fill="white"/>
            </svg>
            <svg v-if="currentChannel.logo === 'feishu'" width="36" height="36" viewBox="0 0 48 48" fill="none">
              <rect x="4" y="4" width="40" height="40" rx="10" :fill="currentChannel.color"/>
              <path d="M14 18l8 4 8-4M14 24l8 4 8-4M14 30l8 4 8-4" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            </svg>
            <svg v-if="currentChannel.logo === 'wechat'" width="36" height="36" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="20" :fill="currentChannel.color"/>
              <path d="M20 17c-4 0-7 2.6-7 6 0 1.8 1 3.4 2.6 4.6l-.6 2.4 1.4-.8c.8.2 1.6.4 2.6.4.2 0 .6 0 .8 0-.2-.6-.2-1-.2-1.6 0-3.4 3.2-6.2 7-6.2.4 0 .6 0 1 0-1-3-4.4-4.8-7.6-4.8z" fill="white"/>
              <path d="M33 23c-3.4 0-6 2.2-6 5s2.6 5 6 5c.8 0 1.4-.2 2.2-.4l1.2.6-.4-2c1.4-1 2.2-2.4 2.2-4 0-2.4-2.6-4.2-5.2-4.2z" fill="white" fill-opacity="0.85"/>
            </svg>
            <svg v-if="currentChannel.logo === 'wecom'" width="36" height="36" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="20" fill="#4086FC"/>
              <circle cx="19" cy="19" r="3" fill="white"/>
              <circle cx="29" cy="19" r="3" fill="#FFC107"/>
              <circle cx="19" cy="29" r="3" fill="#4CAF50"/>
              <circle cx="29" cy="29" r="3" fill="#F44336"/>
            </svg>
          </div>

          <!-- 关闭按钮 -->
          <button class="dialog-close" @click="closeConfig">
            <i class="fa-solid fa-xmark"></i>
          </button>

          <!-- 钉钉配置 -->
          <template v-if="currentChannel.id === 'dingtalk'">
            <h2 class="dialog-title">配置钉钉</h2>
            <p class="dialog-desc">在钉钉中扫码完成应用注册</p>
            <p class="dialog-link-text">
              <a href="#" class="manual-link">手动配置</a>
            </p>
            <div class="qr-container">
              <div class="qr-placeholder">
                <svg width="160" height="160" viewBox="0 0 160 160">
                  <rect width="160" height="160" fill="#f5f5f5" rx="8"/>
                  <text x="80" y="85" text-anchor="middle" fill="#ccc" font-size="14">QR Code</text>
                </svg>
              </div>
            </div>
            <button class="dialog-action-btn" @click="refreshQRCode">刷新二维码</button>
          </template>

          <!-- 飞书配置 -->
          <template v-if="currentChannel.id === 'feishu'">
            <h2 class="dialog-title">配置飞书</h2>
            <p class="dialog-desc">使用飞书扫描下方二维码，自动创建并配置机器人</p>
            <div class="qr-container">
              <div class="qr-placeholder">
                <svg width="160" height="160" viewBox="0 0 160 160">
                  <rect width="160" height="160" fill="#f5f5f5" rx="8"/>
                  <text x="80" y="85" text-anchor="middle" fill="#ccc" font-size="14">QR Code</text>
                </svg>
              </div>
            </div>
            <button class="dialog-action-btn" @click="refreshQRCode">刷新二维码</button>
          </template>

          <!-- 微信配置 -->
          <template v-if="currentChannel.id === 'wechat'">
            <h2 class="dialog-title">重新连接微信</h2>
            <p class="dialog-desc">扫码后将替换当前连接的微信账号</p>
            <div class="qr-container">
              <div class="qr-placeholder">
                <svg width="160" height="160" viewBox="0 0 160 160">
                  <rect width="160" height="160" fill="#f5f5f5" rx="8"/>
                  <text x="80" y="85" text-anchor="middle" fill="#ccc" font-size="14">QR Code</text>
                </svg>
              </div>
            </div>
            <button class="dialog-action-btn primary" @click="refreshQRCode">重新生成</button>
          </template>

          <!-- 企业微信配置 -->
          <template v-if="currentChannel.id === 'wecom'">
            <h2 class="dialog-title">配置企业微信</h2>
            <p class="dialog-desc">选择一种方式连接企业微信机器人</p>

            <!-- 模式切换 -->
            <div class="mode-switch">
              <label class="mode-option" :class="{ active: wecomMode === 'qr' }">
                <input type="radio" v-model="wecomMode" value="qr" />
                <span class="radio-dot"></span>
                <span class="mode-label">快捷绑定（推荐）</span>
              </label>
              <label class="mode-option" :class="{ active: wecomMode === 'manual' }">
                <input type="radio" v-model="wecomMode" value="manual" />
                <span class="radio-dot"></span>
                <span class="mode-label">手动配置</span>
              </label>
            </div>

            <!-- 快捷绑定模式 - 二维码 -->
            <template v-if="wecomMode === 'qr'">
              <div class="qr-container">
                <div class="qr-placeholder">
                  <svg width="160" height="160" viewBox="0 0 160 160">
                    <rect width="160" height="160" fill="#f5f5f5" rx="8"/>
                    <text x="80" y="85" text-anchor="middle" fill="#ccc" font-size="14">QR Code</text>
                  </svg>
                </div>
              </div>
              <p class="dialog-hint">打开企业微信，扫描二维码完成机器人创建</p>
              <button class="dialog-action-btn" @click="refreshQRCode">刷新二维码</button>
            </template>

            <!-- 手动配置模式 - 表单 -->
            <template v-if="wecomMode === 'manual'">
              <div class="manual-form">
                <div class="form-field">
                  <label class="field-label">Bot ID</label>
                  <input
                    v-model="wecomForm.botId"
                    type="text"
                    class="field-input"
                    placeholder="请输入 Bot ID"
                  />
                </div>
                <div class="form-field">
                  <label class="field-label">Secret</label>
                  <input
                    v-model="wecomForm.secret"
                    type="text"
                    class="field-input"
                    placeholder="请输入 Secret"
                  />
                </div>
              </div>
              <div class="form-actions">
                <button class="btn-cancel" @click="closeConfig">取消</button>
                <button class="btn-save" @click="saveWecomManual">保存</button>
              </div>
            </template>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.page-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 40px;
  color: #1A1A1A;
  overflow-y: auto;
}

.page-header {
  text-align: center;
  margin-bottom: 36px;
}

.header-icon {
  margin-bottom: 20px;
}

.page-header h1 {
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 12px 0;
  color: #1A1A1A;
}

.subtitle {
  color: #999;
  font-size: 14px;
  margin: 0;
  line-height: 1.8;
}

/* IM 列表 */
.im-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 680px;
}

.im-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 28px;
  background: #FFF;
  border: 1px solid #F0F0F0;
  border-radius: 16px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.im-item:hover {
  border-color: #E0E0E0;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}

.im-left {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  flex: 1;
  min-width: 0;
}

.im-logo {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.im-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.im-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.im-name {
  font-size: 15px;
  font-weight: 600;
  color: #1A1A1A;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.status-badge.error {
  background: #FEE2E2;
  color: #EF4444;
}

.im-desc {
  font-size: 13px;
  color: #999;
  line-height: 1.4;
}

.error-info {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.error-msg {
  font-size: 12px;
  color: #EF4444;
}

.reconnect-link {
  font-size: 12px;
  color: #3B82F6;
  cursor: pointer;
  text-decoration: none;
}

.reconnect-link:hover {
  text-decoration: underline;
}

/* 右侧操作 */
.im-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  margin-left: 16px;
}

.more-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  border-radius: 6px;
  font-size: 16px;
  transition: background 0.15s;
}

.more-btn:hover {
  background: #F5F5F5;
  color: #555;
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  cursor: pointer;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #E0E0E0;
  border-radius: 24px;
  transition: background 0.2s;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  left: 2px;
  top: 2px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.toggle-switch input:checked + .toggle-slider {
  background: #10B981;
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(20px);
}

/* 配置按钮 */
.config-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  background: #1A1A1A;
  color: #FFF;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}

.config-btn:hover {
  background: #333;
}

/* ========== 弹窗样式 ========== */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.config-dialog {
  position: relative;
  background: #FFF;
  border-radius: 20px;
  padding: 40px 48px 36px;
  width: 420px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  animation: dialog-in 0.2s ease-out;
}

@keyframes dialog-in {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.dialog-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  margin-top: -68px;
  background: white;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}

.dialog-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  border-radius: 8px;
  font-size: 16px;
  transition: background 0.15s, color 0.15s;
}

.dialog-close:hover {
  background: #F5F5F5;
  color: #333;
}

.dialog-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: #1A1A1A;
}

.dialog-desc {
  font-size: 13px;
  color: #999;
  margin: 0 0 4px 0;
  text-align: center;
}

.dialog-link-text {
  margin: 0 0 20px 0;
}

.manual-link {
  font-size: 13px;
  color: #999;
  text-decoration: none;
  cursor: pointer;
}

.manual-link:hover {
  color: #666;
  text-decoration: underline;
}

.dialog-hint {
  font-size: 12px;
  color: #10B981;
  margin: 12px 0 0 0;
  text-align: center;
}

/* 二维码容器 */
.qr-container {
  margin: 20px 0;
}

.qr-placeholder {
  width: 180px;
  height: 180px;
  border: 2px solid #F0F0F0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* 弹窗按钮 */
.dialog-action-btn {
  width: 100%;
  padding: 12px 24px;
  border: 1px solid #E8E8E8;
  border-radius: 10px;
  background: #FFF;
  color: #333;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  margin-top: 16px;
  transition: all 0.15s;
}

.dialog-action-btn:hover {
  background: #F9F9F9;
  border-color: #D0D0D0;
}

.dialog-action-btn.primary {
  background: #1A1A1A;
  color: #FFF;
  border-color: #1A1A1A;
}

.dialog-action-btn.primary:hover {
  background: #333;
}

/* 模式切换 */
.mode-switch {
  display: flex;
  align-items: center;
  gap: 24px;
  margin: 20px 0 8px;
}

.mode-option {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: #666;
}

.mode-option input {
  display: none;
}

.radio-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #D0D0D0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s;
}

.radio-dot::after {
  content: '';
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: transparent;
  transition: background 0.15s;
}

.mode-option.active .radio-dot {
  border-color: #1A1A1A;
}

.mode-option.active .radio-dot::after {
  background: #1A1A1A;
}

.mode-label {
  user-select: none;
}

/* 手动配置表单 */
.manual-form {
  width: 100%;
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  color: #1A1A1A;
}

.field-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #E8E8E8;
  border-radius: 8px;
  font-size: 14px;
  color: #1A1A1A;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.field-input::placeholder {
  color: #CCC;
}

.field-input:focus {
  border-color: #999;
}

/* 表单操作按钮 */
.form-actions {
  display: flex;
  gap: 12px;
  width: 100%;
  margin-top: 24px;
}

.btn-cancel {
  flex: 1;
  padding: 12px 24px;
  border: 1px solid #E8E8E8;
  border-radius: 10px;
  background: #FFF;
  color: #666;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}

.btn-cancel:hover {
  background: #F9F9F9;
  border-color: #D0D0D0;
}

.btn-save {
  flex: 1;
  padding: 12px 24px;
  border: none;
  border-radius: 10px;
  background: #1A1A1A;
  color: #FFF;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}

.btn-save:hover {
  background: #333;
}
</style>
