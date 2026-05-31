<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAgentStore } from '../../stores/agentStore'
import ProviderCard from './ProviderCard.vue'
import AddProviderModal from './AddProviderModal.vue'

const store = useAgentStore()
const showAddModal = ref(false)

const visibleProviders = computed(() => {
  return store.providers
    .filter(p => p.userAdded || p.enabled || p.apiKey !== '')
    .sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
      return a.sortOrder - b.sortOrder
    })
})

const providerCount = computed(() => visibleProviders.value.length)
</script>

<template>
  <div class="llm-service-section">
    <div class="section-header">
      <div class="section-header-left">
        <h2 class="section-title">大模型集成</h2>
        <span v-if="providerCount > 0" class="section-count">
          已配置 {{ providerCount }} 个服务商
        </span>
      </div>
      <button class="add-service-btn" @click="showAddModal = true">
        <i class="fa-solid fa-plus"></i>
        <span>添加服务</span>
      </button>
    </div>

    <div class="section-body">
      <template v-if="providerCount > 0">
        <ProviderCard
          v-for="provider in visibleProviders"
          :key="provider.id"
          :provider="provider"
        />
      </template>

      <div v-else class="empty-state">
        <div class="empty-icon">
          <i class="fa-solid fa-brain"></i>
        </div>
        <p class="empty-title">尚未配置服务商</p>
        <p class="empty-desc">添加大模型服务商后，可在对话和任务中使用不同的模型。</p>
        <button class="empty-add-btn" @click="showAddModal = true">
          <i class="fa-solid fa-plus"></i>
          <span>添加第一个服务</span>
        </button>
      </div>
    </div>

    <AddProviderModal
      v-if="showAddModal"
      @close="showAddModal = false"
    />
  </div>
</template>

<style scoped>
.llm-service-section {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.section-header-left {
  display: flex;
  align-items: baseline;
  gap: 14px;
}

.section-title {
  font-size: 26px;
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
}

.section-count {
  font-size: 14px;
  color: #666;
}

.add-service-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #1A1A1A;
  color: #FFF;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}

.add-service-btn:hover {
  background: #333;
}

.section-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 40px;
  color: #DDD;
  margin-bottom: 16px;
}

.empty-title {
  font-size: 16px;
  font-weight: 500;
  color: #666;
  margin: 0 0 8px;
}

.empty-desc {
  font-size: 13px;
  color: #999;
  margin: 0 0 20px;
}

.empty-add-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: #4285F4;
  color: #FFF;
  border: none;
  border-radius: 10px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}

.empty-add-btn:hover {
  background: #3367D6;
}
</style>
