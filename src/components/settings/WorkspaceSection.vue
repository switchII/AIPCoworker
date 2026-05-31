<script setup lang="ts">
import { ref } from 'vue'

const safeWorkspace = ref(false)
</script>

<template>
  <div class="content-section">
    <h1>安全工作环境</h1>
    <p class="section-desc">在你的电脑上单独开辟一块独立空间用来跑任务——执行更快、更稳定，所有文件和数据都不会离开你的设备</p>

    <div class="settings-card">
      <div class="setting-row">
        <div class="setting-info"><span class="setting-label">启用安全工作环境</span><span class="setting-hint">开启后，任务会在隔离的工作环境中运行，不影响你电脑上的其他文件，也不会触及真实系统</span></div>
        <label class="toggle"><input type="checkbox" v-model="safeWorkspace"><span class="toggle-slider"></span></label>
      </div>
    </div>

    <div class="settings-card">
      <div class="setting-info" style="margin-bottom:12px;">
        <span class="setting-label">清理工作环境文件，释放磁盘空间</span>
        <span class="setting-hint">释放磁盘空间——会删除已下载的工作环境文件，但不会删除你的对话记录和工作产物。</span>
      </div>
      <button class="clean-btn">清理文件</button>
    </div>
  </div>
</template>
