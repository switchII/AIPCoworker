<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ExecutionBlock, ClarificationAnswer, ClarificationQuestion } from '../../../types/task'

const props = defineProps<{ block: ExecutionBlock }>()

const emit = defineEmits<{
  (e: 'submit', answers: ClarificationAnswer[]): void
}>()

// ── 本地状态 ──
// 每个问题的选中值 (questionId → selected values)
const selections = ref<Record<string, string[]>>({})
// 自定义输入文本 (questionId → custom text)
const customTexts = ref<Record<string, string>>({})
// 是否已展开自定义输入框
const showCustomInput = ref<Record<string, boolean>>({})
// 当前显示的问题索引
const currentQIdx = ref(0)

const questions = computed<ClarificationQuestion[]>(() => {
  return props.block.clarification?.questions || []
})

const isAnswered = computed(() => props.block.clarification?.answered ?? false)
const submittedAnswers = computed(() => props.block.clarification?.answers || [])

// 当前问题
const currentQuestion = computed(() => questions.value[currentQIdx.value])
const isLastQuestion = computed(() => currentQIdx.value === questions.value.length - 1)
const isFirstQuestion = computed(() => currentQIdx.value === 0)
const totalQuestions = computed(() => questions.value.length)

function isSelected(questionId: string, value: string): boolean {
  return selections.value[questionId]?.includes(value) ?? false
}

function toggleOption(question: ClarificationQuestion, value: string) {
  if (isAnswered.value) return

  const qId = question.id
  if (!selections.value[qId]) selections.value[qId] = []

  if (value === '__custom__') {
    showCustomInput.value[qId] = !showCustomInput.value[qId]
    if (!showCustomInput.value[qId]) {
      selections.value[qId] = selections.value[qId].filter(v => v !== '__custom__')
      customTexts.value[qId] = ''
    } else {
      if (!question.multiSelect) {
        selections.value[qId] = ['__custom__']
      } else {
        selections.value[qId].push('__custom__')
      }
    }
    return
  }

  if (question.multiSelect) {
    const idx = selections.value[qId].indexOf(value)
    if (idx >= 0) {
      selections.value[qId].splice(idx, 1)
    } else {
      selections.value[qId].push(value)
    }
    showCustomInput.value[qId] = false
    selections.value[qId] = selections.value[qId].filter(v => v !== '__custom__')
    customTexts.value[qId] = ''
  } else {
    selections.value[qId] = [value]
    showCustomInput.value[qId] = false
    customTexts.value[qId] = ''
  }
}

/** 判断某道题是否已作答 */
function isQuestionAnswered(qIdx: number): boolean {
  const q = questions.value[qIdx]
  if (!q) return false
  const sel = selections.value[q.id]
  if (!sel || sel.length === 0) return false
  if (sel.includes('__custom__') && !customTexts.value[q.id]?.trim()) return false
  return true
}

/** 当前题是否已作答 */
const isCurrentAnswered = computed(() => isQuestionAnswered(currentQIdx.value))

const canSubmit = computed(() => {
  return questions.value.every((_, idx) => isQuestionAnswered(idx))
})

function goNext() {
  if (isCurrentAnswered.value && !isLastQuestion.value) {
    currentQIdx.value++
  }
}

function goPrev() {
  if (!isFirstQuestion.value) {
    currentQIdx.value--
  }
}

function submit() {
  if (!canSubmit.value || isAnswered.value) return

  const answers: ClarificationAnswer[] = questions.value.map(q => {
    const sel = selections.value[q.id] || []
    const values = sel.map(v => {
      if (v === '__custom__') return customTexts.value[q.id]?.trim() || ''
      const opt = q.options.find(o => o.value === v)
      return opt?.label || v
    }).filter(v => v)

    return {
      questionId: q.id,
      values,
    }
  })

  emit('submit', answers)
}

function getAnswerDisplay(qId: string): string {
  const ans = submittedAnswers.value.find(a => a.questionId === qId)
  return ans ? ans.values.join('、') : ''
}
</script>

<template>
  <div class="clarification-module" :class="['status-' + block.status, { answered: isAnswered }]">
    <!-- 头部 -->
    <div class="clarification-header">
      <i class="fa-solid fa-circle-question clarification-icon" :class="{ done: isAnswered }"></i>
      <span class="clarification-label">{{ isAnswered ? '已确认' : '需要确认' }}</span>
      <span v-if="!isAnswered && totalQuestions > 1" class="clarification-progress">
        {{ currentQIdx + 1 }} / {{ totalQuestions }}
      </span>
      <i v-if="block.status === 'running'" class="fa-solid fa-rotate clarification-spinner spinning"></i>
    </div>

    <!-- 已回答：显示所有答案摘要 -->
    <div v-if="isAnswered" class="clarification-body">
      <div v-for="(q, qIdx) in questions" :key="q.id" class="clarification-question">
        <div class="question-text">
          <span class="question-number">{{ qIdx + 1 }}.</span>
          {{ q.question }}
        </div>
        <div class="question-answer">
          <i class="fa-solid fa-check answer-check"></i>
          {{ getAnswerDisplay(q.id) }}
        </div>
      </div>
    </div>

    <!-- 未回答：逐题显示 -->
    <div v-else-if="currentQuestion" class="clarification-body">
      <div class="clarification-question">
        <div class="question-text">
          <span class="question-number">{{ currentQIdx + 1 }}.</span>
          {{ currentQuestion.question }}
          <span v-if="currentQuestion.multiSelect" class="multi-hint">(可多选)</span>
        </div>

        <!-- 选项列表 -->
        <div class="question-options">
          <div
            v-for="opt in currentQuestion.options"
            :key="opt.value"
            class="option-item"
            :class="{
              selected: isSelected(currentQuestion.id, opt.value),
              disabled: isAnswered,
              'is-custom': opt.isCustom,
            }"
            @click="!isAnswered && toggleOption(currentQuestion, opt.value)"
          >
            <span class="option-indicator" :class="{ 'is-radio': !currentQuestion.multiSelect, 'is-checkbox': currentQuestion.multiSelect }">
              <i v-if="isSelected(currentQuestion.id, opt.value)" :class="currentQuestion.multiSelect ? 'fa-solid fa-check' : 'fa-solid fa-circle'"></i>
            </span>
            <span class="option-label">{{ opt.label }}</span>
          </div>
        </div>

        <!-- 自定义输入框 -->
        <div v-if="showCustomInput[currentQuestion.id] && !isAnswered" class="custom-input-wrapper">
          <input
            v-model="customTexts[currentQuestion.id]"
            type="text"
            class="custom-input"
            placeholder="请输入自定义内容..."
            @keyup.enter="isLastQuestion ? submit() : goNext()"
          />
        </div>
      </div>
    </div>

    <!-- 导航按钮 -->
    <div v-if="!isAnswered && currentQuestion" class="clarification-footer">
      <button
        v-if="!isFirstQuestion"
        class="nav-btn"
        @click="goPrev"
      >
        <i class="fa-solid fa-chevron-left"></i>
        上一题
      </button>

      <button
        v-if="!isLastQuestion"
        class="nav-btn next-btn"
        :class="{ disabled: !isCurrentAnswered }"
        :disabled="!isCurrentAnswered"
        @click="goNext"
      >
        下一题
        <i class="fa-solid fa-chevron-right"></i>
      </button>

      <button
        v-else
        class="submit-btn"
        :class="{ disabled: !canSubmit }"
        :disabled="!canSubmit"
        @click="submit"
      >
        <i class="fa-solid fa-paper-plane"></i>
        确认并提交
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/task/clarification-block';
</style>
