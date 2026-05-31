<script setup lang="ts">
import { computed } from 'vue'

// ---- Props ----
const props = defineProps<{
  show: boolean
  pendingDir: string
  authDuration: 'once' | 'session' | '24h' | 'always'
}>()

// ---- Emits ----
const emit = defineEmits<{
  confirm: []
  deny: []
  'update:authDuration': [value: 'once' | 'session' | '24h' | 'always']
}>()

// ---- 计算属性 ----
const authDurationLabel = computed(() => {
  const map: Record<string, string> = {
    once: '仅本次',
    session: '本次会话',
    '24h': '24小时内',
    always: '始终允许'
  }
  return '允许' + map[props.authDuration]
})

function setDuration(val: 'once' | 'session' | '24h' | 'always') {
  emit('update:authDuration', val)
}
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="perm-mask" @click.self="emit('deny')">
      <div class="perm-dialog">
        <button class="perm-close" @click="emit('deny')">
          <i class="fa-solid fa-xmark"></i>
        </button>

        <div class="perm-header">
          <div class="perm-icon-box">
            <i class="fa-solid fa-folder-open perm-folder-icon"></i>
          </div>
          <div>
            <h3 class="perm-title">工作区访问权限</h3>
            <p class="perm-subtitle">需要访问此文件夹来帮你完成任务</p>
          </div>
        </div>

        <div class="perm-path-box">
          <span class="perm-path">{{ pendingDir }}</span>
        </div>

        <div class="perm-section">
          <span class="perm-section-title">将可以：</span>
          <ul class="perm-list">
            <li><span class="perm-dot"></span>读取文件夹中的文件内容</li>
            <li><span class="perm-dot"></span>创建和修改文件</li>
            <li><span class="perm-dot"></span>列出目录结构</li>
          </ul>
        </div>

        <div class="perm-warning">
          <i class="fa-solid fa-triangle-exclamation perm-warn-icon"></i>
          <span>可以读写此目录下的所有文件。请确保你信任此操作。</span>
        </div>

        <div class="perm-duration">
          <span class="perm-duration-label">授权时效</span>
          <div class="perm-duration-options">
            <button
              v-for="opt in [
                { key: 'once', label: '仅本次' },
                { key: 'session', label: '本次会话' },
                { key: '24h', label: '24小时内' },
                { key: 'always', label: '始终允许' }
              ]"
              :key="opt.key"
              class="perm-dur-btn"
              :class="{ active: authDuration === opt.key }"
              @click="setDuration(opt.key as any)"
            >{{ opt.label }}</button>
          </div>
        </div>

        <div class="perm-actions">
          <button class="perm-btn-deny" @click="emit('deny')">拒绝</button>
          <button class="perm-btn-allow" @click="emit('confirm')">{{ authDurationLabel }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/new-task/permission-modal' as *;
</style>
