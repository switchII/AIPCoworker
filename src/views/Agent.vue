<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>Agent 中心</h1>
      <p class="subtitle">与 AI Agent 对话，配置 Agent 能力</p>
    </div>
    <div class="page-content">
      <div class="agent-actions">
        <div class="action-card" @click="router.push('/agent-chat')">
          <div class="action-icon chat">
            <i class="fa-solid fa-comments"></i>
          </div>
          <div class="action-info">
            <h3>开始对话</h3>
            <p>与 AI Agent 进行实时交互对话</p>
          </div>
          <i class="fa-solid fa-arrow-right action-arrow"></i>
        </div>
        <div class="action-card" @click="router.push('/agent-settings')">
          <div class="action-icon settings">
            <i class="fa-solid fa-gear"></i>
          </div>
          <div class="action-info">
            <h3>Agent 设置</h3>
            <p>配置模型、技能、权限、MCP等所有功能</p>
          </div>
          <i class="fa-solid fa-arrow-right action-arrow"></i>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 32px 40px;
  color: #1A1A1A;
}
.page-header h1 {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 8px 0;
}
.subtitle {
  color: #999;
  font-size: 14px;
  margin: 0 0 32px 0;
}
.page-content {
  flex: 1;
  display: flex;
  align-items: flex-start;
}
.agent-actions {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 560px;
}
.action-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  background: #FFF;
  border: 1px solid #EAEAEA;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.15s;
}
.action-card:hover {
  border-color: #CCC;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  transform: translateY(-1px);
}
.action-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}
.action-icon.chat { background: #dbeafe; color: #2563eb; }
.action-icon.settings { background: #f3e8ff; color: #7c3aed; }
.action-info {
  flex: 1;
}
.action-info h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 4px 0;
  color: #1A1A1A;
}
.action-info p {
  font-size: 13px;
  color: #999;
  margin: 0;
}
.action-arrow {
  color: #CCC;
  font-size: 14px;
}
</style>
