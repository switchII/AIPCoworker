<script setup lang="ts">
import { ref } from 'vue'

const language = ref('中文')
const theme = ref('亮色')
const interfaceStyle = ref('默认')
const chatFont = ref('无衬线')
const chatFontSize = ref('小')
const panelPosition = ref('固定在右侧')
const previewMode = ref('新窗口')
const panelInteraction = ref('点击展开，点击收起')
const promptSuggestions = ref(true)
const defaultExpandTools = ref(false)
</script>

<template>
  <div class="content-section">
    <h1>偏好设置</h1>
    <p class="section-desc">语言、主题、字体与面板布局等个性化偏好。</p>

    <div class="settings-card">
      <div class="setting-row">
        <div class="setting-info"><span class="setting-label">语言</span><span class="setting-hint">选择界面语言</span></div>
        <select v-model="language" class="setting-select"><option>中文</option><option>English</option></select>
      </div>
    </div>

    <div class="settings-card">
      <div class="setting-row">
        <div class="setting-info"><span class="setting-label">主题亮暗</span><span class="setting-hint">浅色、深色，或跟随系统。</span></div>
        <select v-model="theme" class="setting-select"><option>亮色</option><option>暗色</option><option>跟随系统</option></select>
      </div>
      <div class="setting-divider"></div>
      <div class="setting-row">
        <div class="setting-info"><span class="setting-label">界面风格</span><span class="setting-hint">默认、玻璃、经典或羊皮纸外观。</span></div>
        <select v-model="interfaceStyle" class="setting-select"><option>默认</option><option>玻璃</option><option>经典</option></select>
      </div>
      <div class="setting-divider"></div>
      <div class="setting-row">
        <div class="setting-info"><span class="setting-label">对话字体</span><span class="setting-hint">对话内容使用无衬线或衬线字体。</span></div>
        <select v-model="chatFont" class="setting-select"><option>无衬线</option><option>衬线</option></select>
      </div>
      <div class="setting-divider"></div>
      <div class="setting-row">
        <div class="setting-info"><span class="setting-label">对话字号</span><span class="setting-hint">调整对话中的文字大小。</span></div>
        <select v-model="chatFontSize" class="setting-select"><option>小</option><option>中</option><option>大</option></select>
      </div>
    </div>

    <div class="settings-card">
      <div class="setting-row">
        <div class="setting-info"><span class="setting-label">任务面板位置</span><span class="setting-hint">任务面板在工作区中的展示位置</span></div>
        <select v-model="panelPosition" class="setting-select"><option>固定在右侧</option><option>浮动</option></select>
      </div>
      <div class="setting-divider"></div>
      <div class="setting-row">
        <div class="setting-info"><span class="setting-label">预览方式</span><span class="setting-hint">如何预览生成的文件（图片、Markdown）</span></div>
        <select v-model="previewMode" class="setting-select"><option>新窗口</option><option>侧栏</option></select>
      </div>
      <div class="setting-divider"></div>
      <div class="setting-row">
        <div class="setting-info"><span class="setting-label">任务面板交互</span><span class="setting-hint">如何展开和收起任务面板</span></div>
        <select v-model="panelInteraction" class="setting-select"><option>点击展开，点击收起</option><option>悬浮展开</option></select>
      </div>
      <div class="setting-divider"></div>
      <div class="setting-row">
        <div class="setting-info"><span class="setting-label">Prompt Suggestions</span><span class="setting-hint">启用后，AI 完成回复后会自动生成下一步建议。</span></div>
        <label class="toggle"><input type="checkbox" v-model="promptSuggestions"><span class="toggle-slider"></span></label>
      </div>
      <div class="setting-divider"></div>
      <div class="setting-row">
        <div class="setting-info"><span class="setting-label">默认展开工具调用</span><span class="setting-hint">关闭时对话中的工具调用默认折叠；开启后新建展示的工具块默认展开。</span></div>
        <label class="toggle"><input type="checkbox" v-model="defaultExpandTools"><span class="toggle-slider"></span></label>
      </div>
    </div>
  </div>
</template>
