<script setup lang="ts">
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>库</h1>
      <p class="subtitle">知识库与资源管理</p>
    </div>
    <div class="page-content">
      <div class="empty-state">
        <svg viewBox="0 0 64 64" fill="none" stroke="#CCC" stroke-width="1.2" stroke-dasharray="3 3">
          <path d="M8 12h32l8 40H6l2-40z"/>
          <line x1="40" y1="12" x2="40" y2="52"/>
          <line x1="8" y1="24" x2="30" y2="24"/>
          <line x1="8" y1="34" x2="26" y2="34"/>
          <line x1="8" y1="44" x2="22" y2="44"/>
        </svg>
        <p class="empty-text">暂无收藏内容</p>
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
