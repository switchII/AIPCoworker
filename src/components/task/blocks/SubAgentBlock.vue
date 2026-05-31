<script setup lang="ts">
import type { ExecutionBlock, SubAgentStep } from '../../../types/task'
import { useBlockHelpers } from '../composables/useBlockHelpers'
import { useAgentStore } from '../../../stores/agentStore'
import MarkdownRenderer from '../../../components/MarkdownRenderer.vue'
import { parseConnectorToolName, buildToolDisplayLabel } from '../../../data/tool-definitions/connectorTools'
import { computed, ref, watch, nextTick } from 'vue'

const props = defineProps<{ block: ExecutionBlock }>()

const emit = defineEmits<{
  (e: 'toggle-block'): void
  (e: 'copy-code', code: string | undefined): void
}>()

const { getStatusIconClass } = useBlockHelpers()
const store = useAgentStore()

/** 从 store 中根据 connectorId 解析连接器名称 */
function resolveConnectorName(toolName: string): string | undefined {
  const parsed = parseConnectorToolName(toolName)
  if (!parsed) return undefined
  const conn = store.connectors.find(c => c.id === parsed.connectorId)
  return conn?.name
}

/** 子代理是否正在生成中 */
const isGenerating = computed(() => props.block.subagentStatus === 'generating' || props.block.status === 'running')

/** 生成耗时文本 */
const generationDurationText = computed(() => {
  const d = props.block.generationDuration
  if (!d) return ''
  return d < 60 ? `${d}s` : `${Math.floor(d / 60)}m ${d % 60}s`
})

// ─── 时间线构建（按执行顺序交替展示：推理 → 工具调用 → 推理 → 工具调用...）───

interface ToolCallItem {
  name: string
  label: string
  success: boolean
  result: string
}

interface TimelineItem {
  iteration: number
  thinking: string
  toolCalls: ToolCallItem[]
}

const timeline = computed<TimelineItem[]>(() => {
  const steps = props.block.subAgentSteps ?? []
  return steps.map((step: SubAgentStep) => ({
    iteration: step.iteration,
    thinking: step.thinking || '',
    toolCalls: (step.toolResults ?? []).map(tr => {
      const connName = resolveConnectorName(tr.name)
      const label = buildToolDisplayLabel(tr.name, tr.args ?? {}, connName)
      return {
        name: tr.name,
        label,
        success: tr.success,
        result: tr.summary,
      }
    }),
  }))
})

/**
 * 流式文本显示条件：子代理正在运行且 extraText 有内容。
 * extraText 在每次迭代完成后被清空，下一轮重新累积，因此只在当前进行中的迭代显示。
 */
const showStreaming = computed(() =>
  isGenerating.value && !!props.block.extraText
)

/** 步骤展开状态 */
const expandedSteps = ref<Set<string>>(new Set())

function toggleStepResult(key: string) {
  if (expandedSteps.value.has(key)) {
    expandedSteps.value.delete(key)
  } else {
    expandedSteps.value.add(key)
  }
}

/** 流式输出区域自动滚动 */
const streamingRef = ref<HTMLElement | null>(null)

watch(() => props.block.extraText, () => {
  if (!streamingRef.value) return
  nextTick(() => {
    if (streamingRef.value) {
      streamingRef.value.scrollTop = streamingRef.value.scrollHeight
    }
  })
})
</script>

<template>
  <div class="thinking-module subagent-module" :class="['status-' + block.status, { 'is-generating': isGenerating }]">
    <!-- 头部 -->
    <div class="thinking-header clickable" @click="emit('toggle-block')">
      <i :class="block.status === 'running' ? 'fa-solid fa-robot thinking-icon spinning' : block.status === 'failed' ? 'fa-solid fa-xmark thinking-icon failed' : 'fa-solid fa-robot thinking-icon subagent-icon'"></i>
      <span class="thinking-label">
        <template v-if="isGenerating">子代理运行中...</template>
        <template v-else>子代理执行</template>
      </span>
      <span v-if="generationDurationText && !isGenerating" class="thinking-duration" :class="{ failed: block.status === 'failed' }">
        {{ generationDurationText }}
      </span>
      <i :class="getStatusIconClass(block.status)" class="status-icon" :data-status="block.status"></i>
      <i class="fa-solid fa-chevron-down expand-arrow" :class="{ open: block.expanded }"></i>
    </div>

    <!-- 生成进度条 -->
    <div v-if="isGenerating" class="subagent-progress-bar">
      <div class="subagent-progress-fill"></div>
    </div>

    <div v-if="block.expanded" class="thinking-body">
      <!-- 任务描述 -->
      <div v-if="block.text" class="subagent-task">
        <MarkdownRenderer class="thinking-text" :content="block.text" theme="light" />
      </div>

      <!-- 时间线：按执行顺序交替展示 推理 → 工具调用 → 推理 → 工具调用 -->
      <template v-for="item in timeline" :key="'iter-' + item.iteration">
        <!-- 推理文本 -->
        <MarkdownRenderer
          v-if="item.thinking"
          class="thinking-text"
          :content="item.thinking"
          theme="light"
        />

        <!-- 工具调用（每个工具一行，可展开查看结果） -->
        <div v-if="item.toolCalls.length > 0" class="steps-list">
          <div v-for="(tc, tcIdx) in item.toolCalls" :key="'tool-' + item.iteration + '-' + tcIdx" class="step-wrapper">
            <div class="step-item clickable" @click.stop="toggleStepResult(item.iteration + '-' + tcIdx)">
              <i class="fa-solid fa-screwdriver-wrench step-status" :data-status="tc.success ? 'success' : 'failed'"></i>
              <code class="step-code" :title="tc.label">{{ tc.label }}</code>
              <i class="fa-solid fa-chevron-down step-expand-arrow" :class="{ open: expandedSteps.has(item.iteration + '-' + tcIdx) }"></i>
            </div>
            <div v-if="expandedSteps.has(item.iteration + '-' + tcIdx)" class="step-result-block">
              <div class="step-result-header">
                <span class="step-result-label">{{ tc.success ? '输出结果' : '错误信息' }}</span>
                <div class="step-result-actions">
                  <button class="step-action-btn" title="复制" @click.stop="emit('copy-code', tc.result)"><i class="fa-solid fa-copy"></i></button>
                </div>
              </div>
              <MarkdownRenderer class="step-result-content" :class="{ 'is-error': !tc.success }" :content="tc.result || ''" theme="dark" />
            </div>
          </div>
        </div>
      </template>

      <!-- 流式输出（当前迭代进行中时显示，每次迭代结束后清空） -->
      <div v-if="showStreaming" ref="streamingRef" class="subagent-streaming-wrapper">
        <div class="subagent-streaming-code">
          <code>{{ block.extraText }}</code>
        </div>
      </div>

      <!-- 完成状态提示 -->
      <div v-if="block.status === 'success' && !isGenerating && !showStreaming && timeline.length === 0" class="subagent-status-message">
        <i class="fa-solid fa-check"></i>
        <span>子代理已完成任务</span>
      </div>
      <div v-if="block.status === 'failed' && !isGenerating" class="subagent-status-message failed">
        <i class="fa-solid fa-xmark"></i>
        <span>子代理执行失败</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/task/execution-block';
</style>
