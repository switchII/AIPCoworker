<script setup lang="ts">
import { useAgentStore } from '../../stores/agentStore'

const store = useAgentStore()

function onDebugToggle(e: Event) {
  const checked = (e.target as HTMLInputElement).checked
  store.updateExperimental('debugEnabled', checked)
}

function onQuickPickToggle(e: Event) {
  const checked = (e.target as HTMLInputElement).checked
  store.updateExperimental('quickPickEnabled', checked)
}
</script>

<template>
  <div class="content-section">
    <h1>实验特性</h1>
    <p class="section-desc">这些功能仍在测试阶段，可能不稳定。</p>
    <div class="settings-card">
      <div class="setting-row">
        <div class="setting-info">
          <span class="setting-label">开启调试</span>
          <span class="setting-hint">显示 TaskRunner 调试面板，查看 Agent 执行过程、工具调用和上下文信息。</span>
        </div>
        <label class="toggle">
          <input
            type="checkbox"
            :checked="store.experimentalSettings.debugEnabled"
            @change="onDebugToggle"
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <span class="setting-label">启用 QuickPick</span>
          <span class="setting-hint">启用全局快速任务窗口，无需切换到主窗口即可随时提交任务。</span>
        </div>
        <label class="toggle">
          <input
            type="checkbox"
            :checked="store.experimentalSettings.quickPickEnabled"
            @change="onQuickPickToggle"
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  </div>
</template>
