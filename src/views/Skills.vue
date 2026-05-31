<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import skillsApi from '@/api/skills'
import type { SkillManifest } from '@/api/skills'

// ─── Skill type definitions ───────────────────────────────────────────────────
interface Skill {
  id: string
  name: string
  description: string
  icon: string
  category: string
  installed: boolean
  /** 'builtin' = shipped with app, 'user' = user-installed, 'ai' = AI-created */
  source: 'builtin' | 'user' | 'ai' | 'marketplace'
  author?: string
  version?: string
  license?: string
  homepage?: string
  tags?: string[]
}

// ─── Data ──────────────────────────────────────────────────────────────────────
// Locally installed skills (from ~/.aipcowork/skills/)
const localBuiltinSkills = ref<Skill[]>([])
const localUserSkills = ref<Skill[]>([])
const localAiSkills = ref<Skill[]>([])
// Marketplace skills (from HTTP API — not yet installed)
const marketplaceSkills = ref<Skill[]>([])
const loading = ref(true)

function manifestToSkill(m: SkillManifest, source: Skill['source']): Skill {
  const category = m.category || (m.tags && m.tags.length > 0 ? m.tags[0] : '工具')
  return {
    id: m.id || m.name.toLowerCase().replace(/\s+/g, '-'),
    name: m.name,
    description: m.description,
    icon: 'fa-solid fa-puzzle-piece',
    category,
    installed: true,
    source,
    author: m.author,
    version: m.version,
    license: m.license,
    homepage: m.homepage,
    tags: m.tags,
  }
}

async function loadAllSkills() {
  loading.value = true
  try {
    // 从 ~/.aipcowork/skills/ 真实加载所有已安装技能（builtin + user + ai）
    const [builtinManifests, userManifests, aiManifests] = await Promise.all([
      skillsApi.getLocalBuiltin(),
      skillsApi.getLocalUser(),
      skillsApi.getLocalAi(),
    ])
    localBuiltinSkills.value = builtinManifests.map(m => manifestToSkill(m, 'builtin'))
    localUserSkills.value = userManifests.map(m => manifestToSkill(m, 'user'))
    localAiSkills.value = aiManifests.map(m => manifestToSkill(m, 'ai'))

    // 构建已安装 ID 集合，用于标记商店中的技能是否已安装
    const installedIdSet = new Set<string>()
    for (const s of localBuiltinSkills.value) installedIdSet.add(s.id)
    for (const s of localUserSkills.value) installedIdSet.add(s.id)
    for (const s of localAiSkills.value) installedIdSet.add(s.id)

    // 从 API 获取商店技能列表（未安装的），标记哪些已在本地安装
    const marketplaceManifests = await skillsApi.getMarketplace()
    marketplaceSkills.value = marketplaceManifests.map(m => {
      const skill = manifestToSkill(m, 'marketplace')
      skill.installed = installedIdSet.has(skill.id)
      return skill
    })
  } catch (e) {
    console.warn('load skills failed:', e)
    localBuiltinSkills.value = []
    localUserSkills.value = []
    localAiSkills.value = []
    marketplaceSkills.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadAllSkills)

// ─── Computed views ────────────────────────────────────────────────────────────
/** Tab: 已安装 = builtin + user + ai（所有本地已安装的技能） */
const installedSkills = computed(() => [
  ...localBuiltinSkills.value,
  ...localUserSkills.value,
  ...localAiSkills.value,
])

// ─── Filter state ──────────────────────────────────────────────────────────────
const activeSource = ref<'installed' | 'marketplace'>('installed')

const allVisibleSkills = computed(() => {
  if (activeSource.value === 'installed') return installedSkills.value
  return marketplaceSkills.value
})

const categories = computed(() => {
  const cats = new Set<string>()
  for (const s of allVisibleSkills.value) cats.add(s.category)
  return ['全部', ...Array.from(cats).sort()]
})
const activeCategory = ref('全部')

const filteredSkills = computed(() => {
  if (activeCategory.value === '全部') return allVisibleSkills.value
  return allVisibleSkills.value.filter(s => s.category === activeCategory.value)
})

// ─── 分页 ──────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 16
const currentPage = ref(1)

const totalPages = computed(() => Math.ceil(filteredSkills.value.length / PAGE_SIZE) || 1)

const pagedSkills = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredSkills.value.slice(start, start + PAGE_SIZE)
})

/** 切换筛选/tab 时重置到第 1 页 */
function resetPage() {
  currentPage.value = 1
}

function selectCategory(cat: string) {
  activeCategory.value = cat
  resetPage()
}

// 切换 tab 时重置分类
function switchSource(src: 'installed' | 'marketplace') {
  activeSource.value = src
  activeCategory.value = '全部'
  resetPage()
}

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
}

// ─── Install / uninstall operations ───────────────────────────────────────────
async function installSkill(skillId: string) {
  try {
    await skillsApi.install(skillId)
    // 安装后重新加载所有技能
    await loadAllSkills()
  } catch (e) {
    console.error('Skill install failed:', e)
  }
}

async function uninstallSkill(skillId: string) {
  try {
    await skillsApi.uninstall(skillId)
    // 卸载后重新加载所有技能
    await loadAllSkills()
  } catch (e) {
    console.error('Skill uninstall failed:', e)
  }
}

</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div class="header-left">
        <h1>技能市场</h1>
        <p class="subtitle">浏览和安装技能,在新建任务时快速使用</p>
      </div>
    </div>

    <!-- 来源切换 -->
    <div class="source-tabs">
      <button
        class="source-btn"
        :class="{ active: activeSource === 'installed' }"
        @click="switchSource('installed')"
      >
        <i class="fa-solid fa-cube"></i> 已安装
        <span v-if="installedSkills.length > 0" class="tab-count">{{ installedSkills.length }}</span>
      </button>
      <button
        class="source-btn"
        :class="{ active: activeSource === 'marketplace' }"
        @click="switchSource('marketplace')"
      >
        <i class="fa-solid fa-store"></i> 技能商店
        <span v-if="marketplaceSkills.length > 0" class="tab-count">{{ marketplaceSkills.length }}</span>
      </button>
    </div>

    <!-- 分类筛选 -->
    <div class="category-bar">
      <button
        v-for="cat in categories"
        :key="cat"
        class="cat-btn"
        :class="{ active: activeCategory === cat }"
        @click="selectCategory(cat)"
      >
        {{ cat }}
      </button>
    </div>

    <!-- 技能网格 -->
    <div v-if="loading" class="state-message">
      <i class="fa-solid fa-spinner fa-spin"></i>
      <span>加载技能中…</span>
    </div>
    <div v-else-if="filteredSkills.length === 0" class="state-message">
      <i class="fa-solid fa-inbox"></i>
      <span>暂无技能</span>
    </div>
    <template v-else>
    <div class="skills-grid">
      <div
        v-for="skill in pagedSkills"
        :key="skill.id + '-' + skill.source"
        class="skill-card"
        :class="{ installed: skill.installed }"
      >
        <!-- Top: icon + name + version -->
        <div class="card-top">
          <div class="skill-icon-wrap">
            <i :class="skill.icon + ' skill-icon'"></i>
          </div>
          <div class="skill-info">
            <span class="skill-name">
              {{ skill.name }}
              <span v-if="skill.source === 'builtin'" class="builtin-badge">内置</span>
              <span v-else-if="skill.source === 'ai'" class="ai-badge">AI</span>
            </span>
            <span v-if="skill.version" class="skill-version">v{{ skill.version }}</span>
          </div>
        </div>

        <!-- Description -->
        <span class="skill-desc">{{ skill.description }}</span>

        <!-- Tags -->
        <div v-if="skill.tags && skill.tags.length" class="skill-tags">
          <span v-for="tag in skill.tags.slice(0, 3)" :key="tag" class="skill-tag">{{ tag }}</span>
        </div>

        <!-- Footer: author + action -->
        <div class="card-footer">
          <span v-if="skill.author" class="skill-author">
            <i class="fa-solid fa-user"></i> {{ skill.author }}
          </span>
          <span v-else></span>

          <!-- 已安装 tab: user-installed can be uninstalled; builtin/ai show badge -->
          <template v-if="activeSource === 'installed'">
            <button
              v-if="skill.source === 'user'"
              class="install-btn is-installed"
              @click="uninstallSkill(skill.id)"
              title="卸载"
            >
              <i class="fa-solid fa-check"></i>
            </button>
            <span v-else-if="skill.source === 'builtin'" class="builtin-lock">
              <i class="fa-solid fa-lock"></i> 内置
            </span>
            <span v-else class="installed-badge">
              <i class="fa-solid fa-robot"></i> AI
            </span>
          </template>

          <!-- 技能商店 tab: install or show installed -->
          <template v-else>
            <button
              v-if="!skill.installed"
              class="install-btn"
              @click="installSkill(skill.id)"
            >
              <span>安装</span>
            </button>
            <span v-else class="installed-badge">
              <i class="fa-solid fa-check"></i> 已安装
            </span>
          </template>
        </div>
      </div>
    </div>

    <!-- 分页控件 -->
    <div v-if="totalPages > 1" class="pagination">
      <button
        class="page-btn"
        :disabled="currentPage <= 1"
        @click="goToPage(currentPage - 1)"
      >
        <i class="fa-solid fa-chevron-left"></i>
      </button>

      <template v-for="page in totalPages" :key="page">
        <button
          class="page-btn"
          :class="{ active: page === currentPage }"
          @click="goToPage(page)"
        >
          {{ page }}
        </button>
      </template>

      <button
        class="page-btn"
        :disabled="currentPage >= totalPages"
        @click="goToPage(currentPage + 1)"
      >
        <i class="fa-solid fa-chevron-right"></i>
      </button>

      <span class="page-info">共 {{ filteredSkills.length }} 个技能</span>
    </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/skills/variables' as *;
@use '@/assets/styles/skills/skills-layout';
@use '@/assets/styles/skills/skill-card';
</style>
