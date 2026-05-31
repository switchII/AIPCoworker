<script setup lang="ts">
import { ref, nextTick, onMounted, watch, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import MarkdownRenderer from '../components/MarkdownRenderer.vue'
import { useHtmlSandbox } from '../components/task/composables/useHtmlSandbox'

const route = useRoute()
const taskText = (route.query.task as string) || '请将学生数据文件夹中的SQL文件导入到PostgreSQL数据库'
const workDirName = ref((route.query.dir as string)?.split('/').pop() || '学生数据')

// ---- 步骤结果展示状态 ----
const stepResults = ref<Record<string, boolean>>({})
function toggleResult(id: string) {
  stepResults.value[id] = !stepResults.value[id]
}

// 折叠面板状态
const step1Open = ref(false)
const step2Open = ref(false)
const step3Open = ref(false)
const step4Open = ref(false)


// 右侧面板折叠状态
const todoOpen = ref(true)
const artifactsOpen = ref(true)
const filesOpen = ref(true)
const skillsOpen = ref(true)
const contextOpen = ref(true)

// 文件夹展开状态
const dataFolderOpen = ref(true)

// 输入
const chatInput = ref('')

// 代码编辑器自动滚动到底部
const codeEditorRef = ref<HTMLElement | null>(null)
onMounted(() => {
  nextTick(() => {
    if (codeEditorRef.value) {
      codeEditorRef.value.scrollTop = codeEditorRef.value.scrollHeight
    }
  })
})

// ---- 预览面板 ----
const previewOpen = ref(false)
const previewFile = ref<{ name: string; type: string; content: string } | null>(null)

// HTML sandbox for ChatView preview
const { finalizeHtml, cleanup } = useHtmlSandbox()
const chatHtmlPreviewRef = ref<HTMLElement | null>(null)

// Render HTML when preview changes
watch(() => previewFile.value, (newFile) => {
  if (newFile?.type === 'html' && newFile.content) {
    nextTick(() => {
      if (chatHtmlPreviewRef.value) {
        try {
          finalizeHtml(newFile.content, chatHtmlPreviewRef.value, {
            initialHeight: 400,
          })
        } catch (e) {
          console.error('[ChatView] HTML render failed:', e)
        }
      }
    })
  }
})

// Cleanup on unmount
onBeforeUnmount(() => {
  if (chatHtmlPreviewRef.value) {
    cleanup(chatHtmlPreviewRef.value)
  }
})

interface OutputFile {
  name: string
  type: 'html' | 'markdown' | 'docx' | 'excel' | 'image'
  icon: string
  iconColor: string
}

const outputFiles = ref<OutputFile[]>([
  { name: '导入报告.xlsx', type: 'excel', icon: 'fa-solid fa-file-excel', iconColor: '#1D6F42' },
  { name: '数据导入说明.docx', type: 'docx', icon: 'fa-solid fa-file-word', iconColor: '#2B579A' },
  { name: 'SKILL.md', type: 'markdown', icon: 'fa-solid fa-file-lines', iconColor: '#555' },
  { name: '表结构关系图.png', type: 'image', icon: 'fa-solid fa-file-image', iconColor: '#E91E63' },
  { name: '可视化报告.html', type: 'html', icon: 'fa-solid fa-file-code', iconColor: '#E44D26' },
])

function openPreview(file: OutputFile) {
  previewFile.value = {
    name: file.name,
    type: file.type,
    content: getPreviewContent(file)
  }
  previewOpen.value = true
}

function closePreview() {
  previewOpen.value = false
  previewFile.value = null
}

function getPreviewContent(file: OutputFile): string {
  switch (file.type) {
    case 'markdown':
      return `# 学生数据导入技能\n\n## 概述\n该技能用于将学生数据SQL文件导入PostgreSQL数据库。\n\n## 使用方法\n1. 选择包含SQL文件的工作目录\n2. 提供数据库连接信息\n3. 执行导入\n\n## 表结构\n- \`student_info\` - 学生基本信息\n- \`student_score\` - 学生成绩表`
    case 'html':
      return `<div style="padding:20px;font-family:sans-serif"><h2>可视化报告</h2><p>导入总量: <strong>15,000</strong> 条</p><div style="background:#f0fdf4;border:1px solid #d1fae5;border-radius:8px;padding:16px;margin:12px 0"><span style="color:#10b981;font-weight:600">✓ 成功率 98.5%</span></div><table style="width:100%;border-collapse:collapse;margin-top:16px"><tr style="background:#f9fafb"><th style="padding:8px;border:1px solid #e5e7eb;text-align:left">表名</th><th style="padding:8px;border:1px solid #e5e7eb">记录数</th></tr><tr><td style="padding:8px;border:1px solid #e5e7eb">student_info</td><td style="padding:8px;border:1px solid #e5e7eb;text-align:center">8,000</td></tr><tr><td style="padding:8px;border:1px solid #e5e7eb">student_score</td><td style="padding:8px;border:1px solid #e5e7eb;text-align:center">7,000</td></tr></table></div>`
    case 'excel':
      return 'EXCEL_PREVIEW'
    case 'docx':
      return 'DOCX_PREVIEW'
    case 'image':
      return 'IMAGE_PREVIEW'
    default:
      return ''
  }
}

function sendMessage() {
  if (!chatInput.value.trim()) return
  chatInput.value = ''
}

function handleKeydown(e: KeyboardEvent) {
  // Skip if IME is composing (e.g. Chinese/Japanese input method on Mac)
  if (e.isComposing) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}
</script>

<template>
  <div class="chat-page">
    <!-- ===== 顶部导航栏 ===== -->
    <header class="chat-topbar">
      <span class="topbar-title">PostgreSQL数据导入</span>
      <div class="topbar-actions">
        <button class="topbar-btn" title="帮助">
          <i class="fa-solid fa-circle-question"></i>
        </button>
      </div>
    </header>

    <!-- ===== 主体区 ===== -->
    <div class="chat-body" :class="{ 'preview-active': previewOpen }">
      <!-- ====== 左侧主操作区 ====== -->
      <div class="chat-main">
        <div class="chat-messages">
          <!-- 用户消息气泡 -->
          <div class="message-user">
            <div class="user-bubble">
              <p class="user-text">{{ taskText }}</p>
              <p class="user-meta">连接信息：host=localhost port=5432 dbname=student_db user=postgres</p>
            </div>
          </div>

          <!-- AI深度思考区 #1 -->
          <div class="ai-section">
            <div class="thinking-header">
              <i class="fa-solid fa-rotate thinking-icon"></i>
              <span class="thinking-title">深度思考</span>
            </div>
            <p class="ai-text">我先来查看你选中的文件夹中的数据文件，了解数据结构后再进行导入。</p>
            <div class="steps-panel">
              <div class="steps-trigger" @click="step1Open = !step1Open">
                <i class="fa-solid fa-chevron-right steps-arrow" :class="{ open: step1Open }"></i>
                <span>查看1个步骤</span>
              </div>
              <div v-if="step1Open" class="steps-content">
                <div class="step-item">
                  <div class="step-header">
                    <i class="fa-solid fa-circle-check step-status-icon success"></i>
                    <i class="fa-solid fa-magnifying-glass step-type-icon"></i>
                    <span class="step-label">查询文件</span>
                    <span class="step-status-tag success">成功</span>
                  </div>
                  <div class="step-desc"><code>ls -la "/Users/luoxiaodong/Desktop/学生数据"</code></div>
                  <div class="step-result-toggle" @click="toggleResult('s1')">
                    <i class="fa-solid fa-chevron-right result-arrow" :class="{ open: stepResults['s1'] }"></i>
                    <span>查看结果</span>
                  </div>
                  <div v-if="stepResults['s1']" class="step-result success">
                    <pre class="result-pre">total 6152
-rw-r--r--  1 luoxiaodong  staff    4521  5 20 14:30 sql_ddl.sql
-rw-r--r--  1 luoxiaodong  staff  3145728  5 20 14:30 sql_insert.sql</pre>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- AI深度思考区 #2 -->
          <div class="ai-section">
            <div class="thinking-header">
              <i class="fa-solid fa-rotate thinking-icon"></i>
              <span class="thinking-title">深度思考</span>
            </div>
            <p class="ai-text">用户文件夹中有两个SQL文件：</p>
            <ol class="ai-list">
              <li><code>sql_ddl.sql</code> - 数据库建表语句（DDL），定义表结构</li>
              <li><code>sql_insert.sql</code> - 数据插入语句（DML），约3MB的INSERT数据</li>
            </ol>
            <p class="ai-text secondary">我会先执行DDL创建表结构，然后导入INSERT数据。</p>
            <div class="steps-panel">
              <div class="steps-trigger" @click="step2Open = !step2Open">
                <i class="fa-solid fa-chevron-right steps-arrow" :class="{ open: step2Open }"></i>
                <span>查看2个步骤</span>
              </div>
              <div v-if="step2Open" class="steps-content">
                <div class="step-item">
                  <div class="step-header">
                    <i class="fa-solid fa-circle-check step-status-icon success"></i>
                    <i class="fa-solid fa-file-lines step-type-icon"></i>
                    <span class="step-label">查询文件</span>
                    <span class="step-status-tag success">成功</span>
                  </div>
                  <div class="step-desc">读取 <code>sql_ddl.sql</code> 头部内容</div>
                  <div class="step-result-toggle" @click="toggleResult('s2a')">
                    <i class="fa-solid fa-chevron-right result-arrow" :class="{ open: stepResults['s2a'] }"></i>
                    <span>查看结果</span>
                  </div>
                  <div v-if="stepResults['s2a']" class="step-result success">
                    <pre class="result-pre">CREATE TABLE student_info (
  id SERIAL PRIMARY KEY,
  student_name VARCHAR(50),
  gender VARCHAR(10)
);</pre>
                  </div>
                </div>
                <div class="step-item">
                  <div class="step-header">
                    <i class="fa-solid fa-circle-check step-status-icon success"></i>
                    <i class="fa-solid fa-file-lines step-type-icon"></i>
                    <span class="step-label">查询文件</span>
                    <span class="step-status-tag success">成功</span>
                  </div>
                  <div class="step-desc">读取 <code>sql_insert.sql</code> 头部内容</div>
                  <div class="step-result-toggle" @click="toggleResult('s2b')">
                    <i class="fa-solid fa-chevron-right result-arrow" :class="{ open: stepResults['s2b'] }"></i>
                    <span>查看结果</span>
                  </div>
                  <div v-if="stepResults['s2b']" class="step-result success">
                    <pre class="result-pre">INSERT INTO student_info VALUES ('张三', '男', 20, '计算机科学');</pre>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- AI深度思考区 #3 - 代码编辑 -->
          <div class="ai-section">
            <div class="thinking-header">
              <i class="fa-solid fa-rotate thinking-icon"></i>
              <span class="thinking-title">深度思考</span>
            </div>
            <p class="ai-text">我正在编写数据导入脚本：</p>
            <div class="steps-panel">
              <div class="steps-trigger" @click="step3Open = !step3Open">
                <i class="fa-solid fa-chevron-right steps-arrow" :class="{ open: step3Open }"></i>
                <span>查看1个步骤</span>
              </div>
              <div v-if="step3Open" class="steps-content">
                <div class="step-item">
                  <div class="step-header">
                    <i class="fa-solid fa-circle-check step-status-icon success"></i>
                    <i class="fa-solid fa-code step-type-icon"></i>
                    <span class="step-label">代码编辑</span>
                    <span class="step-detail">import_sql.py</span>
                    <span class="step-status-tag success">成功</span>
                  </div>
                  <div class="code-editor" ref="codeEditorRef">
                    <div class="code-lines"><span class="line-num" v-for="n in 18" :key="n">{{ n }}</span></div>
                    <pre class="code-content"><span class="kw">import</span> subprocess
<span class="kw">import</span> os

DB_HOST = <span class="str">"localhost"</span>
DB_PORT = <span class="str">"5432"</span>
DB_NAME = <span class="str">"student_db"</span>
DB_USER = <span class="str">"postgres"</span>

DATA_DIR = <span class="str">"/Users/luoxiaodong/Desktop/学生数据"</span>
DDL_FILE = os.path.join(DATA_DIR, <span class="str">"sql_ddl.sql"</span>)
INSERT_FILE = os.path.join(DATA_DIR, <span class="str">"sql_insert.sql"</span>)

<span class="kw">def</span> <span class="fn">run_sql_file</span>(filepath):
    cmd = [<span class="str">"psql"</span>, <span class="str">"-h"</span>, DB_HOST, <span class="str">"-p"</span>, DB_PORT,
           <span class="str">"-U"</span>, DB_USER, <span class="str">"-d"</span>, DB_NAME, <span class="str">"-f"</span>, filepath]
    result = subprocess.run(cmd, capture_output=<span class="kw">True</span>, text=<span class="kw">True</span>)
    <span class="kw">return</span> result

<span class="kw">print</span>(<span class="str">"正在导入..."</span>)</pre>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- AI深度思考区 #4 - 网页搜索+MCP -->
          <div class="ai-section">
            <div class="thinking-header">
              <i class="fa-solid fa-rotate thinking-icon"></i>
              <span class="thinking-title">深度思考</span>
            </div>
            <p class="ai-text">执行导入并验证结果。</p>
            <div class="steps-panel">
              <div class="steps-trigger" @click="step4Open = !step4Open">
                <i class="fa-solid fa-chevron-right steps-arrow" :class="{ open: step4Open }"></i>
                <span>查看3个步骤</span>
              </div>
              <div v-if="step4Open" class="steps-content">
                <div class="step-item">
                  <div class="step-header">
                    <i class="fa-solid fa-circle-check step-status-icon success"></i>
                    <i class="fa-solid fa-globe step-type-icon"></i>
                    <span class="step-label">网页搜索</span>
                    <span class="step-status-tag success">成功</span>
                  </div>
                  <div class="step-desc"><code>psql import large SQL file</code></div>
                  <div class="step-result-toggle" @click="toggleResult('s4a')">
                    <i class="fa-solid fa-chevron-right result-arrow" :class="{ open: stepResults['s4a'] }"></i>
                    <span>查看结果</span>
                  </div>
                  <div v-if="stepResults['s4a']" class="step-result success">
                    <div class="search-results">
                      <div class="search-result-item">
                        <div class="search-favicon"><i class="fa-solid fa-globe"></i></div>
                        <div class="search-info">
                          <span class="search-title">PostgreSQL: Documentation - psql</span>
                          <span class="search-url">postgresql.org/docs/current/app-psql.html</span>
                        </div>
                      </div>
                      <div class="search-result-item">
                        <div class="search-favicon"><i class="fa-brands fa-stack-overflow"></i></div>
                        <div class="search-info">
                          <span class="search-title">How to import large SQL dump</span>
                          <span class="search-url">stackoverflow.com/questions/6842393</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="step-item">
                  <div class="step-header">
                    <i class="fa-solid fa-circle-check step-status-icon success"></i>
                    <i class="fa-solid fa-bolt step-type-icon"></i>
                    <span class="step-label">执行方法 (MCP)</span>
                    <span class="step-status-tag success">成功</span>
                  </div>
                  <div class="step-desc">调用 <code>database.execute_file('sql_ddl.sql')</code> <span class="mcp-badge">MCP</span></div>
                  <div class="step-result-toggle" @click="toggleResult('s4b')">
                    <i class="fa-solid fa-chevron-right result-arrow" :class="{ open: stepResults['s4b'] }"></i>
                    <span>查看结果</span>
                  </div>
                  <div v-if="stepResults['s4b']" class="step-result success">
                    <pre class="result-pre">CREATE TABLE ... OK (2 tables created)</pre>
                  </div>
                </div>
                <div class="step-item">
                  <div class="step-header">
                    <i class="fa-solid fa-circle-exclamation step-status-icon warning"></i>
                    <i class="fa-solid fa-bolt step-type-icon"></i>
                    <span class="step-label">执行方法 (MCP)</span>
                    <span class="step-status-tag warning">异常</span>
                  </div>
                  <div class="step-desc">调用 <code>database.execute_file('sql_insert.sql')</code> <span class="mcp-badge">MCP</span></div>
                  <div class="step-result-toggle" @click="toggleResult('s4c')">
                    <i class="fa-solid fa-chevron-right result-arrow" :class="{ open: stepResults['s4c'] }"></i>
                    <span>查看结果</span>
                  </div>
                  <div v-if="stepResults['s4c']" class="step-result warning">
                    <div class="result-error-msg">
                      <i class="fa-solid fa-triangle-exclamation"></i>
                      <span>已导入 15000/15234 条，234条因编码问题跳过</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- AI 总结 + 成果文件 -->
          <div class="ai-section">
            <div class="thinking-header">
              <i class="fa-solid fa-circle-check" style="color:#10b981;font-size:14px;"></i>
              <span class="thinking-title" style="color:#10b981;">任务完成</span>
              <span class="task-duration">用时 2m 8s</span>
            </div>
            <p class="ai-text">
              数据导入完成！已成功将 <code>15000</code> 条记录导入 PostgreSQL。
              有 234 条因编码问题跳过，详见报告。
            </p>

            <!-- 成果文件列表 -->
            <div class="output-files">
              <div class="output-label">生成文件</div>
              <div class="output-grid">
                <div
                  v-for="file in outputFiles"
                  :key="file.name"
                  class="output-file-card"
                  @click="openPreview(file)"
                >
                  <i :class="file.icon" :style="{ color: file.iconColor }"></i>
                  <span class="output-file-name">{{ file.name }}</span>
                  <i class="fa-solid fa-arrow-up-right-from-square output-open-icon"></i>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ===== 底部输入区 ===== -->
        <div class="chat-input-area">
          <div class="chat-input-card">
            <div class="input-top-row">
              <div class="folder-tag">
                <i class="fa-solid fa-folder folder-tag-icon"></i>
                <span>{{ workDirName }}</span>
              </div>
              <button class="add-context-btn"><i class="fa-solid fa-plus"></i></button>
            </div>
            <textarea
              v-model="chatInput"
              class="chat-textarea"
              placeholder="描述任务，/快捷调用，@添加上下文，标准模式经济高效"
              rows="3"
              @keydown="handleKeydown"
            ></textarea>
            <div class="input-bottom-row">
              <div class="mode-select"><span>标准</span><i class="fa-solid fa-chevron-down mode-arrow"></i></div>
              <button class="chat-send-btn" @click="sendMessage"><i class="fa-solid fa-paper-plane"></i></button>
            </div>
          </div>
        </div>
      </div>

      <!-- ====== 右侧任务监控区 ====== -->
      <aside class="chat-sidebar" v-if="!previewOpen">
        <div class="panel">
          <div class="panel-header" @click="todoOpen = !todoOpen">
            <span class="panel-title">待办</span>
            <i class="fa-solid fa-chevron-down panel-arrow" :class="{ collapsed: !todoOpen }"></i>
          </div>
          <div v-if="todoOpen" class="panel-body">
            <div class="todo-item completed"><i class="fa-solid fa-circle-check todo-check"></i><span>查看数据文件结构</span></div>
            <div class="todo-item completed"><i class="fa-solid fa-circle-check todo-check"></i><span>读取 SQL 文件内容</span></div>
            <div class="todo-item completed"><i class="fa-solid fa-circle-check todo-check"></i><span>编写导入脚本</span></div>
            <div class="todo-item completed"><i class="fa-solid fa-circle-check todo-check"></i><span>执行 DDL 创建表</span></div>
            <div class="todo-item completed"><i class="fa-solid fa-circle-check todo-check"></i><span>导入数据到 PostgreSQL</span></div>
            <div class="todo-item completed"><i class="fa-solid fa-circle-check todo-check"></i><span>生成报告文档</span></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-header" @click="artifactsOpen = !artifactsOpen">
            <span class="panel-title">产物</span>
            <i class="fa-solid fa-chevron-down panel-arrow" :class="{ collapsed: !artifactsOpen }"></i>
          </div>
          <div v-if="artifactsOpen" class="panel-body">
            <div class="artifact-item" v-for="file in outputFiles" :key="file.name" @click="openPreview(file)">
              <i :class="file.icon" :style="{ color: file.iconColor, fontSize: '14px' }"></i>
              <span>{{ file.name }}</span>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-header" @click="filesOpen = !filesOpen">
            <span class="panel-title">工作文件</span>
            <i class="fa-solid fa-chevron-down panel-arrow" :class="{ collapsed: !filesOpen }"></i>
          </div>
          <div v-if="filesOpen" class="panel-body">
            <div class="file-item"><i class="fa-solid fa-file-lines file-icon python"></i><span>import_sql.py</span></div>
            <div class="file-item folder-item" @click="dataFolderOpen = !dataFolderOpen">
              <i class="fa-solid fa-chevron-right folder-arrow" :class="{ open: dataFolderOpen }"></i>
              <i class="fa-solid fa-folder file-icon folder"></i><span>学生数据</span>
            </div>
            <div v-if="dataFolderOpen" class="file-children">
              <div class="file-item"><i class="fa-solid fa-file-lines file-icon sql"></i><span>sql_ddl.sql</span></div>
              <div class="file-item"><i class="fa-solid fa-file-lines file-icon sql"></i><span>sql_insert.sql</span></div>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-header" @click="skillsOpen = !skillsOpen">
            <span class="panel-title">技能与MCP</span>
            <i class="fa-solid fa-chevron-down panel-arrow" :class="{ collapsed: !skillsOpen }"></i>
          </div>
          <div v-if="skillsOpen" class="panel-body">
            <div class="skill-item"><i class="fa-solid fa-database skill-item-icon"></i><span>database</span></div>
            <div class="skill-item"><i class="fa-solid fa-wrench skill-item-icon"></i><span>create-skill</span></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-header" @click="contextOpen = !contextOpen">
            <span class="panel-title">上下文窗口</span>
            <i class="fa-solid fa-chevron-down panel-arrow" :class="{ collapsed: !contextOpen }"></i>
          </div>
          <div v-if="contextOpen" class="panel-body">
            <div class="context-bar">
              <div class="context-progress"><div class="progress-fill" style="width: 45%"></div></div>
              <div class="context-labels"><span>低</span><span>高</span></div>
            </div>
          </div>
        </div>
      </aside>

      <!-- ====== 预览面板 ====== -->
      <aside class="preview-panel" v-if="previewOpen && previewFile">
        <div class="preview-topbar">
          <div class="preview-title-area">
            <i class="fa-solid fa-file-lines preview-file-icon"></i>
            <span class="preview-filename">{{ previewFile.name }}</span>
          </div>
          <div class="preview-actions">
            <button class="preview-action-btn" title="下载"><i class="fa-solid fa-download"></i></button>
            <button class="preview-action-btn" title="新窗口打开"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
            <button class="preview-action-btn close" title="关闭" @click="closePreview"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>
        <div class="preview-body">
          <!-- Markdown 预览 -->
          <div v-if="previewFile.type === 'markdown'" class="preview-markdown">
            <MarkdownRenderer :content="previewFile.content" />
          </div>
          <!-- HTML 预览 - sandboxed iframe -->
          <div
            v-else-if="previewFile.type === 'html'"
            ref="chatHtmlPreviewRef"
            class="preview-html-sandbox"
          ></div>
          <!-- Excel 预览 -->
          <div v-else-if="previewFile.type === 'excel'" class="preview-table">
            <table class="excel-table">
              <thead><tr><th>表名</th><th>记录数</th><th>状态</th><th>耗时</th></tr></thead>
              <tbody>
                <tr><td>student_info</td><td>8,000</td><td class="status-ok">成功</td><td>12s</td></tr>
                <tr><td>student_score</td><td>7,000</td><td class="status-ok">成功</td><td>18s</td></tr>
                <tr><td>编码异常</td><td>234</td><td class="status-warn">跳过</td><td>-</td></tr>
              </tbody>
            </table>
          </div>
          <!-- Docx 预览 -->
          <div v-else-if="previewFile.type === 'docx'" class="preview-doc">
            <h1>数据导入说明</h1>
            <p>本文档描述了从SQL文件导入学生数据到PostgreSQL的完整流程。</p>
            <h2>1. 环境准备</h2>
            <p>需要 PostgreSQL 15+ 和 psql 命令行工具。</p>
            <h2>2. 数据结构</h2>
            <p>包含两个表：<strong>student_info</strong> 和 <strong>student_score</strong>。</p>
            <h2>3. 导入结果</h2>
            <p>共导入 15,000 条记录，成功率 98.5%。</p>
          </div>
          <!-- 图片预览 -->
          <div v-else-if="previewFile.type === 'image'" class="preview-image">
            <div class="image-placeholder">
              <i class="fa-solid fa-image"></i>
              <span>表结构关系图.png</span>
              <span class="img-size">1200 × 800 · 156KB</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.chat-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #FAFAFA;
}

.chat-topbar {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: none;
  background: #FAFAFA;
  flex-shrink: 0;
}
.topbar-title { font-size: 15px; font-weight: 600; color: #1A1A1A; }
.topbar-actions { display: flex; gap: 8px; }
.topbar-btn {
  width: 32px; height: 32px; border: none; background: transparent;
  border-radius: 6px; cursor: pointer; display: flex; align-items: center;
  justify-content: center; color: #999; font-size: 16px; transition: background 0.15s, color 0.15s;
}
.topbar-btn:hover { background: #F0F0F0; color: #333; }

.chat-body { flex: 1; display: flex; overflow: hidden; }
.chat-body.preview-active .chat-main { max-width: 420px; }

.chat-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.chat-messages { flex: 1; overflow-y: auto; padding: 24px 28px; max-width: 860px; margin: 0 auto; width: 100%; }

/* 用户消息 */
.message-user { margin-bottom: 24px; }
.user-bubble { background: #F3F3F3; border-radius: 12px; padding: 14px 18px; max-width: 85%; }
.user-text { font-size: 14px; color: #1A1A1A; margin: 0 0 6px 0; line-height: 1.5; }
.user-meta { font-size: 13px; color: #999; margin: 0; line-height: 1.4; }

/* AI区块 */
.ai-section { margin-bottom: 20px; }
.thinking-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.thinking-icon { font-size: 14px; color: #999; }
.thinking-title { font-size: 13px; font-weight: 500; color: #999; }
.task-duration { margin-left: auto; font-size: 12px; color: #999; background: #F3F3F3; padding: 2px 8px; border-radius: 8px; }
.ai-text { font-size: 14px; color: #1A1A1A; line-height: 1.7; margin: 0 0 10px 0; }
.ai-text.secondary { color: #666; }
.ai-list { margin: 0 0 10px 0; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #1A1A1A; }
.ai-sub-list { margin: 4px 0; padding-left: 18px; list-style-type: disc; }
code { background: #F3F3F3; padding: 2px 6px; border-radius: 4px; font-size: 13px; font-family: 'SF Mono', Monaco, monospace; color: #555; }

/* 步骤面板 */
.steps-panel { margin-top: 8px; margin-bottom: 8px; }
.steps-trigger { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: #F7F7F7; border-radius: 8px; font-size: 13px; color: #666; cursor: pointer; transition: background 0.15s; user-select: none; }
.steps-trigger:hover { background: #EFEFEF; }
.steps-arrow { font-size: 10px; transition: transform 0.2s; }
.steps-arrow.open { transform: rotate(90deg); }
.steps-content { margin-top: 10px; display: flex; flex-direction: column; gap: 12px; }

.step-item { background: #FFF; border: 1px solid #F0F0F0; border-radius: 10px; padding: 12px 14px; }
.step-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.step-status-icon { font-size: 14px; flex-shrink: 0; }
.step-status-icon.success { color: #10b981; }
.step-status-icon.error { color: #ef4444; }
.step-status-icon.warning { color: #f59e0b; }
.step-type-icon { font-size: 13px; color: #999; }
.step-label { font-size: 13px; font-weight: 500; color: #1A1A1A; }
.step-detail { font-size: 12px; color: #999; margin-left: auto; }
.step-status-tag { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 500; margin-left: auto; }
.step-status-tag.success { background: #d1fae5; color: #059669; }
.step-status-tag.error { background: #fee2e2; color: #dc2626; }
.step-status-tag.warning { background: #fef3c7; color: #d97706; }
.step-desc { font-size: 13px; color: #555; line-height: 1.5; margin-bottom: 8px; padding-left: 22px; }
.mcp-badge { display: inline-block; padding: 1px 5px; background: #EDE9FE; color: #7C3AED; border-radius: 4px; font-size: 10px; font-weight: 600; margin-left: 6px; }

.step-result-toggle { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; margin-left: 22px; font-size: 12px; color: #999; cursor: pointer; border-radius: 6px; transition: background 0.12s; user-select: none; }
.step-result-toggle:hover { background: #F5F5F5; color: #666; }
.result-arrow { font-size: 9px; transition: transform 0.2s; }
.result-arrow.open { transform: rotate(90deg); }

.step-result { margin-top: 8px; margin-left: 22px; border-radius: 8px; padding: 10px 12px; font-size: 13px; }
.step-result.success { background: #f0fdf4; border: 1px solid #d1fae5; }
.step-result.error { background: #fef2f2; border: 1px solid #fee2e2; }
.step-result.warning { background: #fffbeb; border: 1px solid #fef3c7; }
.result-pre { margin: 0; font-size: 12px; font-family: 'SF Mono', Monaco, monospace; color: #374151; white-space: pre-wrap; line-height: 1.6; }
.result-error-msg { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 1.5; }
.result-error-msg i { margin-top: 2px; flex-shrink: 0; }
.step-result.warning .result-error-msg i { color: #f59e0b; }
.step-result.warning .result-error-msg span { color: #92400e; }

/* 代码编辑器 */
.code-editor { display: flex; margin: 8px 0 0 22px; background: #1e1e1e; border-radius: 8px; overflow: hidden; max-height: 240px; overflow-y: auto; }
.code-lines { display: flex; flex-direction: column; padding: 12px 0; background: #252526; min-width: 36px; text-align: right; }
.line-num { padding: 0 10px 0 8px; font-size: 11px; font-family: 'SF Mono', Monaco, monospace; color: #858585; line-height: 1.6; user-select: none; }
.code-content { margin: 0; padding: 12px 14px; font-size: 12px; font-family: 'SF Mono', Monaco, monospace; color: #d4d4d4; line-height: 1.6; white-space: pre; overflow-x: auto; flex: 1; }
.code-content .kw { color: #569cd6; }
.code-content .str { color: #ce9178; }
.code-content .comment { color: #6a9955; }
.code-content .fn { color: #dcdcaa; }

/* 网页搜索 */
.search-results { display: flex; flex-direction: column; gap: 8px; }
.search-result-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: #FFF; border: 1px solid #E8E8E8; border-radius: 8px; }
.search-favicon { width: 24px; height: 24px; border-radius: 4px; background: #F5F5F5; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #666; }
.search-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.search-title { font-size: 13px; color: #1A1A1A; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.search-url { font-size: 11px; color: #999; }

/* 成果文件 */
.output-files { margin-top: 12px; }
.output-label { font-size: 12px; color: #999; font-weight: 500; margin-bottom: 10px; }
.output-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.output-file-card {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px;
  background: #FFF; border: 1px solid #EAEAEA; border-radius: 10px;
  cursor: pointer; transition: all 0.15s; font-size: 13px; color: #555;
}
.output-file-card:hover { border-color: #CCC; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.output-file-card i:first-child { font-size: 18px; }
.output-file-name { font-weight: 500; }
.output-open-icon { font-size: 10px; color: #BBB; margin-left: 4px; }

/* 底部输入区 */
.chat-input-area {
  padding: 12px 28px 16px;
  border-top: none;
  background: transparent;
  max-width: 860px;
  margin: 0 auto;
  width: 100%;
}
.chat-input-card { border: 1px solid #E8E8E8; border-radius: 15px; padding: 10px 14px; background: #FFF; transition: border-color 0.2s; }
.chat-input-card:focus-within { border-color: #CCC; }
.input-top-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.folder-tag { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; background: #F3F3F3; border-radius: 6px; font-size: 12px; color: #555; }
.folder-tag-icon { font-size: 11px; color: #999; }
.add-context-btn { width: 22px; height: 22px; border: 1px dashed #DDD; background: transparent; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #BBB; font-size: 11px; transition: all 0.15s; }
.add-context-btn:hover { border-color: #999; color: #666; }
.chat-textarea { width: 100%; border: none; outline: none; resize: none; font-size: 14px; font-family: inherit; color: #1A1A1A; line-height: 1.5; height: 80px; background: transparent; }
.chat-textarea::placeholder { color: #BBB; }
.input-bottom-row { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 6px; }
.mode-select { display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 6px; font-size: 12px; color: #999; cursor: pointer; transition: background 0.15s; }
.mode-select:hover { background: #F5F5F5; }
.mode-arrow { font-size: 9px; }
.chat-send-btn { width: 28px; height: 28px; border: none; background: #1A1A1A; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #FFF; font-size: 12px; transition: background 0.15s; }
.chat-send-btn:hover { background: #333; }

/* 右侧任务监控 */
.chat-sidebar { width: 280px; min-width: 280px; border-radius: 12px; background: #FFF; overflow-y: auto; padding: 8px 0; margin: 8px 8px 8px 0; }
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; cursor: pointer; user-select: none; border-radius: 8px; margin: 0 6px; transition: background 0.12s; }
.panel-header:hover { background: #F7F7F7; }
.panel-title { font-size: 13px; font-weight: 600; color: #1A1A1A; }
.panel-arrow { font-size: 10px; color: #999; transition: transform 0.2s; }
.panel-arrow.collapsed { transform: rotate(-90deg); }
.panel-body { padding: 0 16px 12px; }

.todo-item { display: flex; align-items: flex-start; gap: 8px; padding: 5px 0; font-size: 13px; color: #555; line-height: 1.4; }
.todo-item.completed { color: #999; }
.todo-item.completed span { text-decoration: line-through; }
.todo-check { color: #10b981; font-size: 14px; margin-top: 1px; flex-shrink: 0; }

.artifact-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #555; padding: 6px 8px; border-radius: 6px; cursor: pointer; transition: background 0.12s; }
.artifact-item:hover { background: #F5F5F5; }

.file-item { display: flex; align-items: center; gap: 8px; padding: 5px 4px; font-size: 13px; color: #555; border-radius: 4px; }
.file-item:hover { background: #F9F9F9; }
.file-icon { font-size: 14px; color: #999; width: 16px; text-align: center; }
.file-icon.python { color: #3776AB; }
.file-icon.folder { color: #F59E0B; }
.file-icon.sql { color: #336791; }
.folder-item { cursor: pointer; }
.folder-arrow { font-size: 9px; color: #999; transition: transform 0.2s; }
.folder-arrow.open { transform: rotate(90deg); }
.file-children { padding-left: 28px; }
.skill-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #555; padding: 5px 4px; }
.skill-item-icon { font-size: 13px; color: #999; }
.context-bar { padding-top: 4px; }
.context-progress { height: 6px; background: #F0F0F0; border-radius: 3px; overflow: hidden; margin-bottom: 6px; }
.progress-fill { height: 100%; background: #10b981; border-radius: 3px; transition: width 0.3s; }
.context-labels { display: flex; justify-content: space-between; font-size: 11px; color: #999; }

/* ====== 预览面板 ====== */
.preview-panel {
  flex: 1;
  min-width: 400px;
  background: #FFF;
  border-radius: 12px;
  margin: 8px 8px 8px 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.preview-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid #F0F0F0; flex-shrink: 0;
}
.preview-title-area { display: flex; align-items: center; gap: 8px; }
.preview-file-icon { font-size: 16px; color: #666; }
.preview-filename { font-size: 14px; font-weight: 600; color: #1A1A1A; }
.preview-actions { display: flex; gap: 4px; }
.preview-action-btn { width: 30px; height: 30px; border: none; background: transparent; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #999; font-size: 14px; transition: all 0.15s; }
.preview-action-btn:hover { background: #F0F0F0; color: #333; }
.preview-action-btn.close:hover { background: #fee2e2; color: #ef4444; }

.preview-body { flex: 1; overflow-y: auto; padding: 20px; }

/* Markdown */
.preview-markdown { font-size: 14px; line-height: 1.7; color: #333; }
.md-content h1 { font-size: 22px; font-weight: 700; margin: 0 0 12px; color: #1A1A1A; }
.md-content h2 { font-size: 17px; font-weight: 600; margin: 16px 0 8px; color: #333; }
.md-content code { background: #F3F3F3; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
.md-content li { margin: 4px 0; }

/* HTML */
.preview-iframe { width: 100%; height: 100%; border: none; min-height: 400px; }
.preview-html-sandbox { width: 100%; min-height: 300px; background: #fff; border-radius: 8px; overflow: hidden; }
.preview-html-sandbox :deep(iframe) { width: 100%; border: none; display: block; min-height: 300px; }

/* Excel */
.preview-table { overflow-x: auto; }
.excel-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.excel-table th { background: #F9FAFB; padding: 10px 14px; border: 1px solid #E5E7EB; text-align: left; font-weight: 600; color: #374151; }
.excel-table td { padding: 10px 14px; border: 1px solid #E5E7EB; color: #555; }
.excel-table .status-ok { color: #10b981; font-weight: 500; }
.excel-table .status-warn { color: #f59e0b; font-weight: 500; }

/* Doc */
.preview-doc { font-size: 14px; line-height: 1.8; color: #333; }
.preview-doc h1 { font-size: 22px; font-weight: 700; margin: 0 0 12px; }
.preview-doc h2 { font-size: 17px; font-weight: 600; margin: 20px 0 8px; color: #333; }
.preview-doc p { margin: 8px 0; }

/* Image */
.preview-image { display: flex; align-items: center; justify-content: center; height: 100%; }
.image-placeholder { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #999; }
.image-placeholder i { font-size: 48px; color: #DDD; }
.image-placeholder span { font-size: 14px; }
.img-size { font-size: 12px; color: #BBB; }
</style>
