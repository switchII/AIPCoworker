<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import suitesApi from '@/api/suites'
import type { ExpertSuiteManifest } from '@/api/suites'
import { loadAllInstalledSkills } from '../agent/skill'

const router = useRouter()

// ── 套件数据 ──────────────────────────────────────────────────
const suites = ref<ExpertSuiteManifest[]>([])
const loading = ref(true)

async function loadSuites() {
  loading.value = true
  try {
    suites.value = await suitesApi.getAll()
  } catch (e) {
    console.warn('[ExpertSuites] 加载套件失败:', e)
    suites.value = []
  } finally {
    loading.value = false
  }
}

// ── 已安装技能（用于解析技能名称） ──────────────────
interface SkillItem {
  id: string
  name: string
}
const availableSkills = ref<SkillItem[]>([])

async function loadSkillNames() {
  try {
    const skills = await loadAllInstalledSkills()
    availableSkills.value = skills.map(s => ({ id: s.id, name: s.name }))
  } catch (e) {
    console.warn('[ExpertSuites] 加载技能列表失败:', e)
  }
}

onMounted(() => {
  loadSuites()
  loadSkillNames()
})

// ── 套件操作 ────────────────────────────────────────────────
async function toggleInstall(suite: ExpertSuiteManifest) {
  try {
    if (suite.installed) {
      await suitesApi.uninstall(suite.id)
    } else {
      await suitesApi.install(suite.id)
    }
    // 本地状态更新
    const idx = suites.value.findIndex(s => s.id === suite.id)
    if (idx !== -1) {
      suites.value[idx].installed = !suites.value[idx].installed
    }
  } catch (e) {
    console.error('[ExpertSuites] 安装/卸载套件失败:', e)
  }
}

async function deleteSuite(id: string, name: string) {
  if (confirm(`确定删除套件「${name}」吗？`)) {
    try {
      await suitesApi.remove(id)
      suites.value = suites.value.filter(s => s.id !== id)
    } catch (e) {
      console.error('[ExpertSuites] 删除套件失败:', e)
    }
  }
}

function getSkillName(skillId: string): string {
  return availableSkills.value.find(x => x.id === skillId)?.name || skillId
}

function goToSkills() {
  router.push('/skills')
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div class="header-left">
        <h1>专家套件</h1>
        <p class="subtitle">多个技能组合而成的专业工具套件，一键安装即可使用</p>
      </div>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="empty-state">
      <div class="empty-icon-wrap">
        <i class="fa-solid fa-spinner fa-spin empty-icon"></i>
      </div>
      <div class="empty-desc">加载套件中…</div>
    </div>

    <!-- 有数据时：套件列表 -->
    <div v-else-if="suites.length > 0" class="suites-grid">
      <div
        v-for="suite in suites"
        :key="suite.id"
        class="suite-card"
        :class="{ installed: suite.installed }"
      >
        <!-- 顶部区域 -->
        <div class="suite-top">
          <div class="suite-icon-wrap">
            <i :class="suite.icon + ' suite-icon'"></i>
          </div>
          <div class="suite-actions">
            <button
              class="install-btn"
              :class="{ 'is-installed': suite.installed }"
              @click="toggleInstall(suite)"
            >
              <i v-if="suite.installed" class="fa-solid fa-check"></i>
              <span v-else>安装</span>
            </button>
            <button class="delete-btn" title="删除套件" @click="deleteSuite(suite.id, suite.name)">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>

        <!-- 信息区域 -->
        <div class="suite-info">
          <div class="suite-name-row">
            <span class="suite-name">{{ suite.name }}</span>
            <span class="skill-count-badge">
              <i class="fa-solid fa-puzzle-piece badge-icon"></i>
              {{ suite.skillIds.length }} 个技能
            </span>
          </div>
          <span class="suite-desc">{{ suite.description }}</span>
        </div>

        <!-- 包含技能标签 -->
        <div class="suite-skills">
          <span v-for="skillId in suite.skillIds" :key="skillId" class="skill-tag">
            {{ getSkillName(skillId) }}
          </span>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <div class="empty-icon-wrap">
        <i class="fa-solid fa-boxes-stacked empty-icon"></i>
      </div>
      <div class="empty-title">暂无专家套件</div>
      <div class="empty-desc">专家套件由多个技能组合而成，安装后可在新建任务时一键启用</div>
      <div class="empty-hints">
        <div class="hint-item">
          <i class="fa-solid fa-lightbulb hint-icon"></i>
          <span>套件将后续从后台同步，你也可以先在<span class="link" @click="goToSkills">技能页面</span>浏览可用技能</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/expert-suites/variables' as *;
@use '@/assets/styles/expert-suites/suites-layout';
@use '@/assets/styles/expert-suites/suite-card';
@use '@/assets/styles/expert-suites/suite-empty';
</style>
