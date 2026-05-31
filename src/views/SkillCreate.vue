<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import skillsApi from '@/api/skills'
import type { SkillManifest } from '@/api/skills'
import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'

const router = useRouter()

// ─── Form State ──────────────────────────────────────────────────
interface FormData {
  id: string
  name: string
  description: string
  content: string
  version: string
  author: string
  license: string
  tags: string[]
  platforms: string[]
}

const form = ref<FormData>({
  id: '',
  name: '',
  description: '',
  content: '',
  version: '1.0.0',
  author: '',
  license: 'MIT',
  tags: [],
  platforms: [],
})

// ─── ID Auto-generation from name ────────────────────────────────
const manualId = ref(false)

watch(() => form.value.name, (newName) => {
  if (!manualId.value && newName) {
    form.value.id = newName
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 64)
  }
})

function onIdInput() {
  manualId.value = true
}

// ─── Validation ──────────────────────────────────────────────────
const errors = computed(() => {
  const errs: Record<string, string> = {}

  if (!form.value.id) {
    errs.id = '请输入技能 ID'
  } else if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(form.value.id)) {
    errs.id = 'ID 格式无效：只允许小写字母、数字、连字符和下划线'
  }

  if (!form.value.name.trim()) {
    errs.name = '请输入技能名称'
  }

  if (!form.value.description.trim()) {
    errs.description = '请输入技能描述'
  }

  if (!form.value.content.trim()) {
    errs.content = '请输入技能内容'
  }

  return errs
})

const isValid = computed(() => Object.keys(errors.value).length === 0)

// ─── Tags handling ───────────────────────────────────────────────
const tagInput = ref('')

function addTag() {
  const tag = tagInput.value.trim()
  if (tag && !form.value.tags.includes(tag)) {
    form.value.tags.push(tag)
  }
  tagInput.value = ''
}

function removeTag(index: number) {
  form.value.tags.splice(index, 1)
}

function handleTagKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    addTag()
  }
  if (e.key === 'Backspace' && !tagInput.value && form.value.tags.length > 0) {
    form.value.tags.pop()
  }
}

// ─── Platform handling ───────────────────────────────────────────
const platformOptions = ['cursor', 'claude', 'copilot', 'windsurf', 'vscode', 'jetbrains']
const platformInput = ref('')

function addPlatform() {
  const p = platformInput.value.trim().toLowerCase()
  if (p && !form.value.platforms.includes(p)) {
    form.value.platforms.push(p)
  }
  platformInput.value = ''
}

function removePlatform(index: number) {
  form.value.platforms.splice(index, 1)
}

function handlePlatformKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    addPlatform()
  }
  if (e.key === 'Backspace' && !platformInput.value && form.value.platforms.length > 0) {
    form.value.platforms.pop()
  }
}

// ─── Submit ──────────────────────────────────────────────────────
const submitting = ref(false)

async function submitSkill(draft = false) {
  if (!isValid.value || submitting.value) return

  submitting.value = true
  try {
    const manifest: SkillManifest = {
      id: form.value.id,
      name: form.value.name,
      description: form.value.description,
      content: form.value.content,
      version: form.value.version || undefined,
      author: form.value.author || undefined,
      license: form.value.license || undefined,
      tags: form.value.tags.length > 0 ? form.value.tags : undefined,
      platforms: form.value.platforms.length > 0 ? form.value.platforms : undefined,
    }

    const result = await skillsApi.create(manifest)

    if (result.success) {
      ElMessage.success(draft ? '草稿保存成功' : '技能创建成功')
      router.push('/skills')
    } else {
      ElMessage.error(result.message || '创建失败')
    }
  } catch (err) {
    console.error('[SkillCreate] 创建技能失败:', err)
    const msg = err instanceof Error ? err.message : '创建失败，请稍后重试'
    ElMessage.error(msg)
  } finally {
    submitting.value = false
  }
}

function goBack() {
  router.push('/skills')
}

// ─── Template content ────────────────────────────────────────────
const templateContent = `# 技能名称

## 概述
简要描述这个技能的功能和使用场景。

## 使用步骤
1. 第一步：...
2. 第二步：...
3. 第三步：...

## 示例
\`\`\`
示例代码或使用说明
\`\`\`

## 注意事项
- 注意事项 1
- 注意事项 2
`

function fillTemplate() {
  if (!form.value.content) {
    form.value.content = templateContent
  }
}
</script>

<template>
  <div class="page-container">
    <!-- Header -->
    <div class="page-header">
      <button class="back-btn" @click="goBack">
        <i class="fa-solid fa-arrow-left"></i>
      </button>
      <div class="header-info">
        <h1>创建新技能</h1>
        <p class="subtitle">遵循 SKILL.md 社区规范，创建可复用的 AI 技能</p>
      </div>
    </div>

    <!-- Form -->
    <form class="skill-form" @submit.prevent>
      <!-- Basic Info Section -->
      <div class="form-group">
        <label class="form-label">
          基本信息
          <span class="hint">（技能标识和描述）</span>
        </label>

        <!-- Name -->
        <div class="form-field">
          <label class="form-label">
            技能名称 <span class="required">*</span>
          </label>
          <input
            v-model="form.name"
            type="text"
            class="form-input"
            :class="{ 'has-error': form.name && errors.name }"
            placeholder="例如：代码审查助手"
          />
          <span v-if="form.name && errors.name" class="form-error">
            <i class="fa-solid fa-circle-exclamation"></i>
            {{ errors.name }}
          </span>
        </div>

        <!-- ID -->
        <div class="form-field">
          <label class="form-label">
            技能 ID <span class="required">*</span>
            <span class="hint">（小写字母、数字、连字符，最多 64 字符）</span>
          </label>
          <input
            v-model="form.id"
            type="text"
            class="form-input"
            :class="{ 'has-error': form.id && errors.id }"
            placeholder="例如：code-review-helper"
            @input="onIdInput"
          />
          <span v-if="form.id && errors.id" class="form-error">
            <i class="fa-solid fa-circle-exclamation"></i>
            {{ errors.id }}
          </span>
          <div v-else-if="form.id" class="id-preview">
            <i class="fa-solid fa-link"></i>
            将保存为：<code>~/.aipcowork/skills/ai/{{ form.id }}/SKILL.md</code>
          </div>
        </div>

        <!-- Description -->
        <div class="form-field">
          <label class="form-label">
            技能描述 <span class="required">*</span>
            <span class="hint">（简短描述技能功能）</span>
          </label>
          <input
            v-model="form.description"
            type="text"
            class="form-input"
            :class="{ 'has-error': form.description && errors.description }"
            placeholder="例如：自动审查代码质量，检查潜在 Bug 和安全漏洞"
          />
          <span v-if="form.description && errors.description" class="form-error">
            <i class="fa-solid fa-circle-exclamation"></i>
            {{ errors.description }}
          </span>
        </div>
      </div>

      <!-- Metadata Section -->
      <div class="form-group">
        <label class="form-label">元数据</label>

        <div class="form-row-3">
          <!-- Version -->
          <div class="form-field">
            <label class="form-label">版本</label>
            <input
              v-model="form.version"
              type="text"
              class="form-input"
              placeholder="1.0.0"
            />
          </div>

          <!-- Author -->
          <div class="form-field">
            <label class="form-label">作者</label>
            <input
              v-model="form.author"
              type="text"
              class="form-input"
              placeholder="例如：Your Name"
            />
          </div>

          <!-- License -->
          <div class="form-field">
            <label class="form-label">许可证</label>
            <input
              v-model="form.license"
              type="text"
              class="form-input"
              placeholder="MIT"
            />
          </div>
        </div>
      </div>

      <!-- Tags Section -->
      <div class="form-group">
        <label class="form-label">
          标签
          <span class="hint">（按回车或逗号添加）</span>
        </label>
        <div class="tags-container">
          <span v-for="(tag, idx) in form.tags" :key="idx" class="tag-chip">
            {{ tag }}
            <button type="button" class="tag-remove" @click="removeTag(idx)">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </span>
          <input
            v-model="tagInput"
            type="text"
            class="tag-input"
            placeholder="输入标签..."
            @keydown="handleTagKeydown"
          />
        </div>
      </div>

      <!-- Platforms Section -->
      <div class="form-group">
        <label class="form-label">
          支持平台
          <span class="hint">（按回车或逗号添加）</span>
        </label>
        <div class="tags-container">
          <span v-for="(p, idx) in form.platforms" :key="idx" class="tag-chip">
            {{ p }}
            <button type="button" class="tag-remove" @click="removePlatform(idx)">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </span>
          <input
            v-model="platformInput"
            type="text"
            class="tag-input"
            placeholder="cursor, claude, copilot..."
            @keydown="handlePlatformKeydown"
          />
        </div>
        <div class="platform-hints">
          <span v-for="p in platformOptions" :key="p" class="platform-suggest" @click="form.platforms.push(p); removePlatform(form.platforms.length - 1); addPlatform()">
            {{ p }}
          </span>
        </div>
      </div>

      <!-- Content Section -->
      <div class="form-group">
        <label class="form-label">
          技能内容 <span class="required">*</span>
          <span class="hint">（Markdown 格式，写入 SKILL.md 正文）</span>
          <button v-if="!form.content" type="button" class="fill-template-btn" @click="fillTemplate">
            <i class="fa-solid fa-wand-magic-sparkles"></i> 填充模板
          </button>
        </label>
        <textarea
          v-model="form.content"
          class="form-input form-textarea"
          :class="{ 'has-error': form.content && errors.content }"
          placeholder="# 技能名称&#10;&#10;## 概述&#10;描述技能功能...&#10;&#10;## 使用步骤&#10;1. ...&#10;2. ...&#10;&#10;## 示例&#10;..."
        ></textarea>
        <span v-if="form.content && errors.content" class="form-error">
          <i class="fa-solid fa-circle-exclamation"></i>
          {{ errors.content }}
        </span>
        <div class="content-stats">
          <span>{{ form.content.length }} 字符</span>
          <span>{{ form.content.split('\n').length }} 行</span>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="form-footer">
        <button type="button" class="btn btn-secondary" @click="goBack">
          取消
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="!isValid || submitting"
          @click="submitSkill(true)"
        >
          <i v-if="submitting" class="fa-solid fa-spinner fa-spin"></i>
          <i v-else class="fa-solid fa-file-lines"></i>
          保存草稿
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!isValid || submitting"
          @click="submitSkill(false)"
        >
          <i v-if="submitting" class="fa-solid fa-spinner fa-spin"></i>
          <i v-else class="fa-solid fa-check"></i>
          创建技能
        </button>
      </div>
    </form>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/styles/skill-create/variables' as *;
@use '@/assets/styles/skill-create/form-layout';
@use '@/assets/styles/skill-create/form-fields';

// Additional inline styles
.form-field {
  display: flex;
  flex-direction: column;
  gap: $sp-3;
  margin-bottom: $sp-4;
}

.platform-hints {
  display: flex;
  flex-wrap: wrap;
  gap: $sp-2;
  margin-top: $sp-2;
}

.platform-suggest {
  padding: $sp-1 $sp-3;
  background: $color-bg-subtle;
  border-radius: $radius-pill;
  font-size: $fs-xs;
  color: $color-gray-500;
  cursor: pointer;
  transition: all $transition-fast;

  &:hover {
    background: $color-black;
    color: $color-white;
  }
}

.fill-template-btn {
  margin-left: auto;
  padding: $sp-1 $sp-3;
  border: none;
  background: $color-blue-bg;
  color: $color-blue-text;
  border-radius: $radius-sm;
  font-size: $fs-xs;
  cursor: pointer;
  transition: all $transition-fast;

  &:hover {
    background: $color-blue-border;
  }
}

.content-stats {
  display: flex;
  gap: $sp-4;
  font-size: $fs-xs;
  color: $color-gray-400;
}
</style>
