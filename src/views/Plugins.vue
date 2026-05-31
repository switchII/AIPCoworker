<script setup lang="ts">
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>插件</h1>
      <p class="subtitle">浏览和管理扩展插件</p>
    </div>
    <div class="page-content">
      <div class="empty-state">
        <svg viewBox="0 0 64 64" fill="none" stroke="#CCC" stroke-width="1.2" stroke-dasharray="3 3">
          <rect x="8" y="8" width="48" height="48" rx="6"/>
          <circle cx="32" cy="28" r="6"/>
          <polygon points="32,20 38,28 32,36 26,28"/>
        </svg>
        <p class="empty-text">暂无插件，浏览插件市场</p>
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
