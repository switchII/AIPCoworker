<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { loadAllInstalledSkills } from '../../agent/skill'
import { useAgentStore } from '../../stores/agentStore'
import { usePopoverManager } from '../../utils/popoverManager'

interface SelectableItem {
  id: string
  name: string
  icon: string
  category?: string
}

const emit = defineEmits<{
  'update:skillNames': [names: string[]]
  'update:suiteNames': [names: string[]]
  'update:connectorIds': [ids: string[]]
}>()

const store = useAgentStore()

const installedSkills = ref<SelectableItem[]>([])
const loading = ref(true)

/** 已安装的专家套件（从 store 获取） */
const installedSuites = computed(() =>
  store.suites
    .filter(s => s.installed)
    .map(s => ({
      id: s.id,
      name: s.name,
      icon: s.icon || 'fa-solid fa-layer-group',
    }))
)

const selectedSkillIds = ref<Set<string>>(new Set())
const selectedSuiteIds = ref<Set<string>>(new Set())
const selectedConnectorIds = ref<Set<string>>(new Set())

// 从文件系统加载真实已安装技能（遵循社区 SKILL.md frontmatter 规范）
async function refreshSkills() {
  loading.value = true
  try {
    const skills = await loadAllInstalledSkills()
    installedSkills.value = skills.map(s => ({
      id: s.id,
      name: s.name,
      icon: 'fa-solid fa-puzzle-piece',
      category: s.tags && s.tags.length > 0 ? s.tags[0] : '工具',
    }))
  } catch (err) {
    console.warn('[SkillSuitePicker] 加载技能失败:', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  refreshSkills()
})

const selectedSkillItems = computed(() =>
  installedSkills.value.filter(s => selectedSkillIds.value.has(s.id))
)
const selectedSuiteItems = computed(() =>
  installedSuites.value.filter(s => selectedSuiteIds.value.has(s.id))
)
const selectedConnectorItems = computed(() =>
  store.connectors.filter(c => c.enabled && selectedConnectorIds.value.has(c.id))
)

function toggleSkill(id: string) {
  const s = new Set(selectedSkillIds.value)
  if (s.has(id)) s.delete(id); else s.add(id)
  selectedSkillIds.value = s
  emitUpdate()
}
function toggleSuite(id: string) {
  const s = new Set(selectedSuiteIds.value)
  if (s.has(id)) s.delete(id); else s.add(id)
  selectedSuiteIds.value = s
  emitUpdate()
}
function isSkillSelected(id: string) { return selectedSkillIds.value.has(id) }
function isSuiteSelected(id: string) { return selectedSuiteIds.value.has(id) }
function isConnectorSelected(id: string) { return selectedConnectorIds.value.has(id) }

function toggleConnector(id: string) {
  const s = new Set(selectedConnectorIds.value)
  if (s.has(id)) s.delete(id); else s.add(id)
  selectedConnectorIds.value = s
  emitUpdate()
}

function emitUpdate() {
  emit('update:skillNames', selectedSkillItems.value.map(s => s.id))
  emit('update:suiteNames', selectedSuiteItems.value.map(s => s.name))
  emit('update:connectorIds', Array.from(selectedConnectorIds.value))
}

// ---- popover state ----
const showPopover = ref(false)
const cascadingTarget = ref<'skill' | 'suite' | 'connector' | null>(null)
let hideCascadeTimer: ReturnType<typeof setTimeout> | null = null
const pickerRef = ref<HTMLElement | null>(null)

const { openPopover: notifyOtherPopovers } = usePopoverManager('skill-suite-picker', showPopover)

function togglePopover() {
  if (!showPopover.value) {
    notifyOtherPopovers()
  }
  showPopover.value = !showPopover.value
  cascadingTarget.value = null
}
function showCascade(target: 'skill' | 'suite' | 'connector') {
  if (hideCascadeTimer) { clearTimeout(hideCascadeTimer); hideCascadeTimer = null }
  cascadingTarget.value = target
}
function scheduleHideCascade() {
  hideCascadeTimer = setTimeout(() => { cascadingTarget.value = null }, 150)
}
function cancelHideCascade() {
  if (hideCascadeTimer) { clearTimeout(hideCascadeTimer); hideCascadeTimer = null }
}

function handleClickOutside(e: MouseEvent) {
  if (pickerRef.value && !pickerRef.value.contains(e.target as Node)) {
    showPopover.value = false
    cascadingTarget.value = null
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))

defineExpose({ selectedSkillItems, selectedSuiteItems, selectedConnectorItems, toggleSkill, toggleSuite, toggleConnector })
</script>

<template>
  <div class="ssp-wrapper" ref="pickerRef">
    <button class="ssp-trigger" title="选择技能或专家套件" @click.stop="togglePopover">
      <i class="fa-solid fa-plus"></i>
    </button>

    <Transition name="drop">
      <div v-if="showPopover" class="ssp-popover" @click.stop>
        <div
          class="ssp-item"
          :class="{ active: cascadingTarget === 'skill' }"
          @mouseenter="showCascade('skill')"
          @mouseleave="scheduleHideCascade"
        >
          <i class="fa-solid fa-puzzle-piece ssp-item-icon"></i>
          <span>技能</span>
          <i class="fa-solid fa-chevron-right ssp-item-arrow"></i>
        </div> 
        <div
          class="ssp-item"
          :class="{ active: cascadingTarget === 'suite' }"
          @mouseenter="showCascade('suite')"
          @mouseleave="scheduleHideCascade"
        >
          <i class="fa-solid fa-layer-group ssp-item-icon"></i>
          <span>专家套件</span>
          <i class="fa-solid fa-chevron-right ssp-item-arrow"></i>
        </div>
        <div
          class="ssp-item"
          :class="{ active: cascadingTarget === 'connector' }"
          @mouseenter="showCascade('connector')"
          @mouseleave="scheduleHideCascade"
        >
          <i class="fa-solid fa-plug ssp-item-icon"></i>
          <span>连接器</span>
          <i class="fa-solid fa-chevron-right ssp-item-arrow"></i>
        </div>

        <!-- 技能级联 -->
        <Transition name="cascade">
          <div
            v-if="cascadingTarget === 'skill'"
            class="ssp-cascade"
            @mouseenter="cancelHideCascade"
            @mouseleave="scheduleHideCascade"
          >
            <div class="ssp-cascade-label">已安装的技能</div>
            <div
              v-for="s in installedSkills"
              :key="s.id"
              class="ssp-cascade-item"
              :class="{ selected: isSkillSelected(s.id) }"
              @click.stop="toggleSkill(s.id)"
            >
              <i :class="s.icon"></i>
              <div class="ssp-cascade-text">
                <span class="ssp-cascade-name">{{ s.name }}</span>
                <span class="ssp-cascade-cat">{{ s.category }}</span>
              </div>
              <i v-if="isSkillSelected(s.id)" class="fa-solid fa-check ssp-cascade-check"></i>
            </div>
          </div>
        </Transition>

        <!-- 套件级联 -->
        <Transition name="cascade">
          <div
            v-if="cascadingTarget === 'suite'"
            class="ssp-cascade"
            @mouseenter="cancelHideCascade"
            @mouseleave="scheduleHideCascade"
          >
            <div class="ssp-cascade-label">已安装的专家套件</div>
            <div
              v-for="s in installedSuites"
              :key="s.id"
              class="ssp-cascade-item"
              :class="{ selected: isSuiteSelected(s.id) }"
              @click.stop="toggleSuite(s.id)"
            >
              <i :class="s.icon"></i>
              <div class="ssp-cascade-text">
                <span class="ssp-cascade-name">{{ s.name }}</span>
              </div>
              <i v-if="isSuiteSelected(s.id)" class="fa-solid fa-check ssp-cascade-check"></i>
            </div>
            <div v-if="installedSuites.length === 0" class="ssp-cascade-empty">
              暂无已安装的专家套件
            </div>
          </div>
        </Transition>

        <!-- 连接器级联 -->
        <Transition name="cascade">
          <div
            v-if="cascadingTarget === 'connector'"
            class="ssp-cascade"
            @mouseenter="cancelHideCascade"
            @mouseleave="scheduleHideCascade"
          >
            <div class="ssp-cascade-label">已启用的连接器</div>
            <div
              v-for="c in store.connectors.filter(x => x.enabled)"
              :key="c.id"
              class="ssp-cascade-item"
              :class="{ selected: isConnectorSelected(c.id) }"
              @click.stop="toggleConnector(c.id)"
            >
              <i :class="c.type === 'ssh' ? 'fa-solid fa-terminal' : 'fa-solid fa-database'"></i>
              <div class="ssp-cascade-text">
                <span class="ssp-cascade-name">{{ c.name }}</span>
                <span class="ssp-cascade-cat">{{ c.type.toUpperCase() }}</span>
              </div>
              <i v-if="isConnectorSelected(c.id)" class="fa-solid fa-check ssp-cascade-check"></i>
            </div>
            <div v-if="store.connectors.filter(x => x.enabled).length === 0" class="ssp-cascade-empty">
              暂无已启用的连接器
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.ssp-wrapper { position: relative; }

.ssp-trigger {
  width: 30px; height: 30px;
  border: none; background: transparent;
  border-radius: 6px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: #999; font-size: 14px;
  transition: background 0.15s, color 0.15s;
}
.ssp-trigger:hover { background: #F0F0F0; color: #333; }

.ssp-popover {
  position: absolute;
  bottom: calc(100% + 6px); left: 0;
  min-width: 200px;
  background: #FFF;
  border: 1px solid #EAEAEA;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  z-index: 200;
  padding: 6px 0;
  overflow: visible;
}
.ssp-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; cursor: pointer;
  transition: background 0.12s;
  font-size: 14px; color: #1A1A1A;
  position: relative; user-select: none;
}
.ssp-item:hover, .ssp-item.active { background: #F5F5F5; }
.ssp-item-icon { font-size: 15px; color: #555; flex-shrink: 0; width: 18px; text-align: center; }
.ssp-item-arrow { font-size: 11px; color: #BBB; margin-left: auto; }

.ssp-cascade {
  position: absolute;
  top: -6px; left: calc(100% + 4px);
  min-width: 220px; max-height: 340px;
  overflow-y: auto;
  background: #FFF;
  border: 1px solid #EAEAEA;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  z-index: 210;
  padding: 6px 0;
}
.ssp-cascade-label {
  padding: 8px 14px 6px;
  font-size: 11px; color: #999;
  font-weight: 500; letter-spacing: 0.3px;
  border-bottom: 1px solid #F0F0F0;
  margin-bottom: 4px;
}
.ssp-cascade-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 14px; cursor: pointer;
  transition: background 0.12s;
  font-size: 13px; color: #1A1A1A;
  user-select: none;
}
.ssp-cascade-item:hover { background: #F5F5F5; }
.ssp-cascade-item.selected { background: #F0F7FF; }
.ssp-cascade-item > i:first-child {
  font-size: 14px; color: #777; width: 18px;
  text-align: center; flex-shrink: 0;
}
.ssp-cascade-text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.ssp-cascade-name { font-size: 13px; color: #1A1A1A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ssp-cascade-cat { font-size: 11px; color: #AAA; }
.ssp-cascade-check { font-size: 12px; color: #2563EB; flex-shrink: 0; }
.ssp-cascade-empty { padding: 16px 14px; font-size: 13px; color: #BBB; text-align: center; }

.drop-enter-active { transition: opacity 0.15s, transform 0.15s; }
.drop-leave-active { transition: opacity 0.1s, transform 0.1s; }
.drop-enter-from { opacity: 0; transform: translateY(4px); }
.drop-leave-to   { opacity: 0; transform: translateY(4px); }

.cascade-enter-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.cascade-leave-active { transition: opacity 0.1s ease, transform 0.1s ease; }
.cascade-enter-from  { opacity: 0; transform: translateX(-4px); }
.cascade-leave-to    { opacity: 0; transform: translateX(-4px); }
</style>
