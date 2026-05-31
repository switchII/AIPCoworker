<script setup lang="ts">
import { ref } from 'vue'

// ---- Props / Emits ----
defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
  submit: [data: { text: string; email: string; images: string[] }]
}>()

// ---- 内部表单状态 ----
const feedbackText = ref('')
const feedbackEmail = ref('')
const feedbackImages = ref<string[]>([])

function close() {
  feedbackText.value = ''
  feedbackEmail.value = ''
  feedbackImages.value = []
  emit('close')
}

function submit() {
  emit('submit', {
    text: feedbackText.value,
    email: feedbackEmail.value,
    images: [...feedbackImages.value],
  })
  close()
}
</script>

<template>
  <Transition name="popover">
    <div v-if="show" class="feedback-popover" @click.stop>
      <div class="feedback-header">
        <div class="feedback-avatar">
          <img src="/logo.png" alt="" />
        </div>
        <h3>问题反馈</h3>
      </div>
      <p class="feedback-desc">
        如果您在使用过程中遇到任何问题，请随时反馈给我们。您的反馈将帮助我们不断改进和优化产品。
      </p>
      <textarea
        v-model="feedbackText"
        class="feedback-textarea"
        placeholder="请输入您的问题或建议"
        rows="5"
      ></textarea>
      <div class="feedback-section">
        <label class="feedback-label">屏幕截图：</label>
        <div class="feedback-images">
          <div class="feedback-image-add">
            <i class="fa-solid fa-plus"></i>
            <span>点击添加，或拖拽/粘贴图片到此区域</span>
          </div>
        </div>
      </div>
      <div class="feedback-section">
        <label class="feedback-label">联系邮箱</label>
        <input v-model="feedbackEmail" type="email" class="feedback-input" placeholder="请输入联系邮箱" />
      </div>
      <div class="feedback-footer">
        <button class="feedback-btn-cancel" @click="close">取消</button>
        <button class="feedback-btn-submit" @click="submit">提交</button>
      </div>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/new-task/popovers';
</style>
