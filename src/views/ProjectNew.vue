<script setup lang="ts">
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>新建项目</h1>
      <p class="subtitle">创建新的项目工作区</p>
    </div>
    <div class="page-content">
      <div class="empty-state">
        <svg viewBox="0 0 64 64" fill="none" stroke="#CCC" stroke-width="1.2" stroke-dasharray="3 3">
          <rect x="12" y="12" width="40" height="40" rx="6"/>
          <line x1="32" y1="24" x2="32" y2="40"/>
          <line x1="24" y1="32" x2="40" y2="32"/>
        </svg>
        <p class="empty-text">点击创建第一个项目</p>
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
  margin: 0 0 24px 0;
}
.page-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty-state {
  text-align: center;
}
.empty-state svg {
  width: 80px;
  height: 80px;
  margin-bottom: 16px;
}
.empty-text {
  color: #BBB;
  font-size: 14px;
}
</style>
