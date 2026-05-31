<script setup lang="ts">

// ---- 积分行数据类型 ----
interface CreditsRow {
  name: string
  total: number
  used: number
  renew?: string
}

// ---- Props / Emits ----
defineProps<{
  show: boolean
  rows: CreditsRow[]
}>()

const emit = defineEmits<{
  close: []
}>()

/** 计算已使用百分比 */
function usedPercent(row: CreditsRow): number {
  return row.total > 0 ? Math.round((row.used / row.total) * 100) : 0
}

function usedWidth(row: CreditsRow): string {
  return row.total > 0 ? (row.used / row.total * 100) + '%' : '0%'
}
</script>

<template>
  <Transition name="popover">
    <div v-if="show" class="credits-popover" @click.stop>
      <div class="credits-header">
        <span class="credits-title">用量概览</span>
        <button class="credits-close" @click="emit('close')">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="credits-body">
        <div v-for="row in rows" :key="row.name" class="credits-row">
          <div class="credits-row-header">
            <span class="credits-row-name">{{ row.name }}</span>
            <span v-if="row.renew" class="credits-row-renew">{{ row.renew }}</span>
          </div>
          <div class="credits-bar-track">
            <div class="credits-bar-fill" :style="{ width: usedWidth(row) }"></div>
          </div>
          <div class="credits-row-footer">
            <span>{{ row.used.toLocaleString() }} / {{ row.total.toLocaleString() }}（已使用 {{ usedPercent(row) }}%）</span>
            <span>剩余 {{ (row.total - row.used).toLocaleString() }}</span>
          </div>
        </div>
      </div>
      <div class="credits-footer">
        <button class="credits-refresh" @click="emit('close')">
          <i class="fa-solid fa-arrows-rotate"></i>
        </button>
        <button class="credits-detail" @click="emit('close')">
          查看详情 <i class="fa-solid fa-arrow-up-right-from-square"></i>
        </button>
      </div>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/new-task/popovers';
</style>
