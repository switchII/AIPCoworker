<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import LLMServiceSection from '../components/llm/LLMServiceSection.vue'
import PreferencesSection from '../components/settings/PreferencesSection.vue'
import MemorySection from '../components/settings/MemorySection.vue'
import ProfileSection from '../components/settings/ProfileSection.vue'
import SystemSection from '../components/settings/SystemSection.vue'
import ShortcutsSection from '../components/settings/ShortcutsSection.vue'
import ConnectorsSection from '../components/settings/ConnectorsSection.vue'
import WorkspaceSection from '../components/settings/WorkspaceSection.vue'
import ExperimentalSection from '../components/settings/ExperimentalSection.vue'
import UpdateSection from '../components/settings/UpdateSection.vue'

const router = useRouter()
const route = useRoute()

const activeTab = ref((route.query.tab as string) || 'preferences')

const settingsNav = [
  { group: '通用', items: [
    { id: 'preferences', label: '偏好设置', icon: 'fa-solid fa-sliders' },
    { id: 'memory', label: '记忆', icon: 'fa-solid fa-memory' },
    { id: 'profile', label: '个人资料', icon: 'fa-solid fa-id-card' },
    { id: 'system', label: '系统设置', icon: 'fa-solid fa-display' },
    { id: 'shortcuts', label: '快捷键', icon: 'fa-solid fa-keyboard' },
    { id: 'update', label: '更新应用', icon: 'fa-solid fa-rotate' },
  ]},
  { group: '扩展与集成', items: [
    { id: 'connectors', label: '连接器与 MCP', icon: 'fa-solid fa-plug' },
    { id: 'llm', label: '大模型集成', icon: 'fa-solid fa-brain' },
  ]},
  { group: '高级设置', items: [
    { id: 'workspace', label: '安全工作环境', icon: 'fa-solid fa-shield-halved' },
    { id: 'experimental', label: '实验特性', icon: 'fa-solid fa-flask' },
  ]}
]

function goBack() {
  router.back()
}
</script>

<template>
  <div class="settings-page">
    <!-- 左侧导航 -->
    <aside class="settings-nav">
      <div class="nav-back" @click="goBack">
        <i class="fa-solid fa-arrow-left"></i>
        <span>返回应用</span>
      </div>

      <div v-for="group in settingsNav" :key="group.group" class="nav-group">
        <span class="nav-group-label">{{ group.group }}</span>
        <div
          v-for="item in group.items"
          :key="item.id"
          class="nav-item"
          :class="{ active: activeTab === item.id }"
          @click="activeTab = item.id"
        >
          <i :class="item.icon"></i>
          <span>{{ item.label }}</span>
        </div>
      </div>
    </aside>

    <!-- 右侧内容 -->
    <main class="settings-content">
      <PreferencesSection v-if="activeTab === 'preferences'" />
      <MemorySection v-if="activeTab === 'memory'" />
      <ProfileSection v-if="activeTab === 'profile'" />
      <SystemSection v-if="activeTab === 'system'" />
      <ShortcutsSection v-if="activeTab === 'shortcuts'" />
      <ConnectorsSection v-if="activeTab === 'connectors'" />
      <div v-if="activeTab === 'llm'" class="content-section">
        <LLMServiceSection />
      </div>
      <WorkspaceSection v-if="activeTab === 'workspace'" />
      <ExperimentalSection v-if="activeTab === 'experimental'" />
      <UpdateSection v-if="activeTab === 'update'" />
    </main>
  </div>
</template>

<style lang="scss">
@use '../assets/styles/settings/settings';
</style>
