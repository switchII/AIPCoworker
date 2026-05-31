/**
 * TaskRunner → ExecutionBlock 桥接器
 *
 * 将 TaskRunner 的实时事件映射到 store 中的 ThinkingBlock，
 * 实现 ReAct Agent 推理过程的可视化。
 *
 * 职责：
 *   1. 监听 TaskRunner 事件（thinking / toolCallStart / toolCallEnd / step / complete）
 *   2. 创建和更新 ThinkingBlock（深度思考块）
 *   3. 将工具调用映射为 ExecutionStep
 *   4. 管理计时器（任务耗时、块耗时）
 */

import { useAgentStore } from '../../../stores/agentStore'
import type { TaskRunner, ClarificationRequest, SubAgentStartPayload, SubAgentEndPayload, SubAgentIterationPayload } from '../../../agent/core/taskRunner'
import type { ReActStep, ReActResult, ToolResult } from '../../../agent/core/reactAgent'
import type { ToolCall, ChatMessage } from '../../../agent/llm/llmClient'
import type { ExecutionStep, ClarificationAnswer, PlanItem, SubAgentStep } from '../../../types/task'
import type { TaskRecord, ExecutionBlock } from '../../../types/task'
import { parseConnectorToolName, formatConnectorToolName, formatMCPToolName, isConnectorToolName, buildToolDisplayLabel } from '../../../data/tool-definitions/connectorTools'

// ─── 工具函数 ──────────────────────────────────────────────

let bridgeIdCounter = 0
function bridgeId(): string {
  return `bridge-${Date.now()}-${++bridgeIdCounter}`
}

/** 判断是否是连接器工具名 */
const isConnectorTool = isConnectorToolName

/** 根据工具名推断步骤类型 */
function inferStepType(toolName: string): ExecutionStep['type'] {
  if (toolName === 'read_file') return 'file_read'
  if (toolName === 'write_file') return 'file_write'
  if (toolName === 'list_directory') return 'file_read'
  if (toolName === 'run_command') return 'command'
  if (toolName === 'glob_search') return 'file_read'
  if (toolName === 'ripgrep_search') return 'file_read'
  if (toolName === 'delete_path') return 'file_write'
  if (toolName === 'copy_path') return 'file_write'
  if (toolName === 'move_path') return 'file_write'
  if (toolName === 'web_search' || toolName === 'http_fetch') return 'web_search'
  if (toolName === 'ask_user') return 'command'
  if (toolName.startsWith('mcp_')) return 'mcp_execute'
  // 连接器工具
  if (toolName.startsWith('ssh_exec') || toolName.startsWith('ssh_read_file')) return 'command'
  if (toolName.startsWith('mysql_') || toolName.startsWith('pg_')) return 'mcp_execute'
  return 'command'
}

/** 根据工具名生成就成可读标签（含参数） */
function inferStepLabel(toolName: string, args: Record<string, unknown>, connName?: string): string {
  return buildToolDisplayLabel(toolName, args, connName)
}

/** 每个任务独立的 bridge 状态，支持多任务并行 */
interface PerTaskState {
  currentBlockId: string | null
  currentBlockStartTime: number
  accumulatedThinking: string
  accumulatedTokens: string
  fileGenBlockId: string | null
  planOutputBlockId: string | null
  planOutputStartTime: number
  taskTimer: ReturnType<typeof setInterval> | null
  taskStartTime: number
  currentSubAgentBlockId: string | null
  subAgentStartTime: number
  activeSubAgentBlocks: Map<string, { blockId: string; startTime: number }>
}

/** 创建一份全新的 per-task 状态 */
function createPerTaskState(): PerTaskState {
  return {
    currentBlockId: null,
    currentBlockStartTime: 0,
    accumulatedThinking: '',
    accumulatedTokens: '',
    fileGenBlockId: null,
    planOutputBlockId: null,
    planOutputStartTime: 0,
    taskTimer: null,
    taskStartTime: 0,
    currentSubAgentBlockId: null,
    subAgentStartTime: 0,
    activeSubAgentBlocks: new Map(),
  }
}

// ─── 桥接器主函数 ──────────────────────────────────────────

export function useTaskRunnerBridge() {
  const store = useAgentStore()

  /** 从 store 中根据 connectorId 解析连接器名称 */
  function resolveConnectorName(toolName: string): string | undefined {
    const parsed = parseConnectorToolName(toolName)
    if (!parsed) return undefined
    const conn = store.connectors.find(c => c.id === parsed.connectorId)
    return conn?.name
  }

  // ── 直接操作 store 响应式数据的辅助函数 ──
  // 避免依赖新增的 store action（Pinia HMR 可能丢失新增方法）

  function findTask(taskId: string): TaskRecord | undefined {
    return store.tasks.find(t => t.id === taskId)
  }

  function findBlock(taskId: string, blockId: string): ExecutionBlock | undefined {
    return findTask(taskId)?.blocks.find(b => b.id === blockId)
  }

  function mutateBlock(taskId: string, blockId: string, updates: Partial<ExecutionBlock>) {
    const block = findBlock(taskId, blockId)
    if (block) Object.assign(block, updates)
  }

  /** 创建新的 ThinkingBlock */
  function createThinkingBlock(taskId: string, state: PerTaskState) {
    const blockId = bridgeId()
    state.currentBlockId = blockId
    state.currentBlockStartTime = Date.now()
    state.accumulatedThinking = ''
    state.accumulatedTokens = ''

    store.addBlock(taskId, {
      id: blockId,
      type: 'thinking',
      expanded: true,
      status: 'running',
      text: '',
      steps: [],
    } as any)

    return blockId
  }

  /** 确保当前有 ThinkingBlock，没有则创建 */
  function ensureThinkingBlock(taskId: string, state: PerTaskState): string {
    if (!state.currentBlockId) {
      return createThinkingBlock(taskId, state)
    }
    return state.currentBlockId
  }

  /** 结算当前 ThinkingBlock（step 完成时调用） */
  function finalizeThinkingBlock(taskId: string, state: PerTaskState, step: ReActStep) {
    if (!state.currentBlockId) return

    const duration = Math.round((Date.now() - state.currentBlockStartTime) / 1000)
    const hasFailed = step.toolResults.some(r => !r.success)
    const status = hasFailed ? 'failed' : 'success'

    // 优先使用 accumulatedThinking（真正的思考内容），
    // step.text 在有工具调用时是 LLM 的中间回复文本，不应覆盖思考内容
    const blockText = state.accumulatedThinking || step.text || ''

    mutateBlock(taskId, state.currentBlockId, {
      status,
      duration,
      text: blockText.trim() || '思考完成',
    })

    state.currentBlockId = null
  }

  /** 启动全局任务计时器 */
  function startTaskTimer(taskId: string, state: PerTaskState) {
    state.taskStartTime = Date.now()
    if (state.taskTimer) clearInterval(state.taskTimer)
    state.taskTimer = setInterval(() => {
      const elapsed = Math.round((Date.now() - state.taskStartTime) / 1000)
      store.updateTask(taskId, { elapsedSeconds: elapsed })
    }, 1000)
  }

  /** 停止任务计时器 */
  function stopTaskTimer(state: PerTaskState) {
    if (state.taskTimer) {
      clearInterval(state.taskTimer)
      state.taskTimer = null
    }
  }

  /** 创建澄清问题 Block */
  function createClarificationBlock(taskId: string, state: PerTaskState, request: ClarificationRequest) {
    if (state.currentBlockId) {
      const duration = Math.round((Date.now() - state.currentBlockStartTime) / 1000)
      mutateBlock(taskId, state.currentBlockId, {
        status: 'success',
        duration,
        text: state.accumulatedThinking.trim() || '思考中...',
      })
      state.currentBlockId = null
    }

    const blockId = bridgeId()
    store.addBlock(taskId, {
      id: blockId,
      type: 'clarification',
      expanded: true,
      status: 'running',
      text: '需要你的确认',
      steps: [],
      clarification: {
        questions: request.questions,
        answered: false,
      },
    } as any)

    return blockId
  }

  /** 用户回答澄清问题后更新 block */
  function onClarificationSubmitted(taskId: string, blockId: string, answers: ClarificationAnswer[]) {
    const block = findBlock(taskId, blockId)
    if (block && block.clarification) {
      block.clarification.answered = true
      block.clarification.answers = answers
    }
    mutateBlock(taskId, blockId, { status: 'success' })
  }

  /** 子代理开始生成 */
  function onSubAgentStart(taskId: string, state: PerTaskState, payload: SubAgentStartPayload, toolCallId?: string) {
    if (state.currentBlockId) {
      const duration = Math.round((Date.now() - state.currentBlockStartTime) / 1000)
      mutateBlock(taskId, state.currentBlockId, {
        status: 'success',
        duration,
        text: state.accumulatedThinking.trim() || '思考中...',
      })
      state.currentBlockId = null
    }

    const blockId = bridgeId()
    const startTime = Date.now()
    if (toolCallId) {
      state.activeSubAgentBlocks.set(toolCallId, { blockId, startTime })
    } else {
      state.currentSubAgentBlockId = blockId
      state.subAgentStartTime = startTime
    }

    const blockType = payload.type
    store.addBlock(taskId, {
      id: blockId,
      type: blockType,
      expanded: true,
      status: 'running',
      text: payload.description,
      subagentStatus: 'generating',
      steps: [],
      ...(payload.type === 'sub_agent' ? {
        subAgentSteps: [],
        currentIteration: 0,
        maxIterations: payload.maxIterations ?? 15,
      } : {}),
    } as any)
  }

  /** 子代理生成完成 */
  function onSubAgentEnd(taskId: string, state: PerTaskState, payload: SubAgentEndPayload, toolCallId?: string) {
    let blockId: string | null = null
    let startTime: number = 0
    if (toolCallId && state.activeSubAgentBlocks.has(toolCallId)) {
      const entry = state.activeSubAgentBlocks.get(toolCallId)!
      blockId = entry.blockId
      startTime = entry.startTime
      state.activeSubAgentBlocks.delete(toolCallId)
    } else if (state.currentSubAgentBlockId) {
      blockId = state.currentSubAgentBlockId
      startTime = state.subAgentStartTime
      state.currentSubAgentBlockId = null
    }

    if (!blockId) return
    const duration = Math.round((Date.now() - startTime) / 1000)

    if (payload.type === 'sub_agent') {
      // assign_to_subagent 结果处理：显示子代理返回的文本结果
      const existingBlock = findBlock(taskId, blockId)
      if (payload.success) {
        mutateBlock(taskId, blockId, {
          status: 'success', duration, subagentStatus: 'complete', generationDuration: duration,
          text: existingBlock?.text || '子代理执行完成',
        })
      } else {
        mutateBlock(taskId, blockId, {
          status: 'failed', duration, subagentStatus: 'complete', generationDuration: duration,
          text: existingBlock?.text || '子代理执行失败',
          extraText: payload.error ? `错误: ${payload.error}` : undefined,
        })
      }
      return
    }

    if (payload.success && payload.result) {
      const updates: Partial<ExecutionBlock> = {
        status: 'success', duration, subagentStatus: 'complete', generationDuration: duration,
      }
      if (payload.type === 'html_render') {
        updates.htmlContent = payload.result.htmlContent
        updates.text = payload.result.title || '网页生成完成'
        updates.extraText = undefined
        const htmlTitle = payload.result.title || 'generated_page'
        const safeName = htmlTitle.replace(/[<>:"/\\|?*]/g, '_')
        addFileToGenBlock(taskId, state, { name: `${safeName}.html`, type: 'html', content: payload.result.htmlContent || '', filePath: payload.result.filePath })
      } else {
        updates.code = payload.result.code
        updates.language = payload.result.language
        updates.fileName = payload.result.fileName
        updates.text = payload.result.fileName || '代码生成完成'
        updates.extraText = undefined
        const codeFileName = payload.result.fileName || 'generated_code'
        const { type } = extractFileInfo(codeFileName)
        addFileToGenBlock(taskId, state, { name: codeFileName, type, content: payload.result.code || '', filePath: payload.result.filePath })
      }
      mutateBlock(taskId, blockId, updates)
    } else {
      mutateBlock(taskId, blockId, {
        status: 'failed', duration, subagentStatus: 'complete', generationDuration: duration,
        text: `生成失败: ${payload.error || '未知错误'}`, extraText: undefined,
      })
    }
  }

  /** 子代理流式 token 输出 */
  function onSubAgentToken(taskId: string, state: PerTaskState, token: string, toolCallId?: string) {
    let blockId: string | null = null
    if (toolCallId && state.activeSubAgentBlocks.has(toolCallId)) {
      blockId = state.activeSubAgentBlocks.get(toolCallId)!.blockId
    } else if (state.currentSubAgentBlockId) {
      blockId = state.currentSubAgentBlockId
    }
    if (!blockId) return
    const task = store.tasks.find(t => t.id === taskId)
    if (!task) return
    const block = task.blocks.find(b => b.id === blockId)
    if (!block) return
    block.extraText = (block.extraText || '') + token
  }

  /** 子代理 ReAct 迭代完成（仅 sub_agent 类型） */
  function onSubAgentIteration(taskId: string, state: PerTaskState, payload: SubAgentIterationPayload) {
    let blockId: string | null = null
    if (payload.toolCallId && state.activeSubAgentBlocks.has(payload.toolCallId)) {
      blockId = state.activeSubAgentBlocks.get(payload.toolCallId)!.blockId
    } else if (state.currentSubAgentBlockId) {
      blockId = state.currentSubAgentBlockId
    }
    if (!blockId) return

    const block = findBlock(taskId, blockId)
    if (!block || block.type !== 'sub_agent') return

    // 构建 SubAgentStep 并追加到 subAgentSteps
    const step: SubAgentStep = {
      iteration: payload.iteration,
      thinking: payload.thinking,
      toolNames: payload.toolNames,
      toolResults: payload.toolResults,
      completed: true,
    }
    if (!block.subAgentSteps) block.subAgentSteps = []
    block.subAgentSteps.push(step)
    block.currentIteration = payload.iteration

    // 迭代完成后，清空 extraText（思考内容已保存在 step.thinking 中，由时间线渲染）
    block.extraText = ''
  }

  /** 计划生成开始 */
  function onPlanStart(taskId: string, state: PerTaskState) {
    const blockId = bridgeId()
    state.planOutputBlockId = blockId
    state.planOutputStartTime = Date.now()
    store.addBlock(taskId, {
      id: blockId, type: 'plan_output', expanded: false, resultExpanded: false,
      status: 'running', text: '正在分析任务...', extraText: '', planThinking: '', steps: [],
    } as any)
  }

  /** 计划阶段的思考 token */
  function onPlanThinking(taskId: string, state: PerTaskState, thinking: string) {
    if (!state.planOutputBlockId) return
    const block = findBlock(taskId, state.planOutputBlockId)
    if (block) { block.planThinking = (block.planThinking || '') + thinking }
  }

  /** 计划生成阶段的流式 token（JSON 输出） */
  function onPlanToken(taskId: string, state: PerTaskState, token: string) {
    if (!state.planOutputBlockId) return
    const block = findBlock(taskId, state.planOutputBlockId)
    if (block) {
      block.extraText = (block.extraText || '') + token
      if (block.text === '正在分析任务...') { block.text = '正在生成执行计划...' }
    }
  }

  // ── 事件处理器（绑定到 TaskRunner） ──

  function onThinking(taskId: string, state: PerTaskState, text: string) {
    state.accumulatedThinking += text
    const blockId = ensureThinkingBlock(taskId, state)
    const displayText = state.accumulatedThinking.length > 500
      ? '...' + state.accumulatedThinking.slice(-500)
      : state.accumulatedThinking
    mutateBlock(taskId, blockId, { text: displayText })
  }

  function onToken(taskId: string, state: PerTaskState, token: string) {
    state.accumulatedTokens += token
    const blockId = ensureThinkingBlock(taskId, state)
    const task = store.tasks.find(t => t.id === taskId)
    if (task) {
      const block = task.blocks.find(b => b.id === blockId)
      if (block) { block.extraText = (block.extraText || '') + token }
    }
  }

  function onToolCallStart(taskId: string, state: PerTaskState, tc: ToolCall) {
    if (tc.name === 'ask_user') return
    const blockId = ensureThinkingBlock(taskId, state)
    let args: Record<string, unknown> = {}
    try { args = tc.arguments ? JSON.parse(tc.arguments) : {} } catch { args = {} }
    const connName = resolveConnectorName(tc.name)
    const stepId = bridgeId()
    const step: ExecutionStep = {
      id: stepId, type: inferStepType(tc.name),
      label: inferStepLabel(tc.name, args, connName),
      target: tc.name.startsWith('mcp_') ? formatMCPToolName(tc.name) : isConnectorTool(tc.name) ? formatConnectorToolName(tc.name, connName) : tc.name,
      status: 'running', resultExpanded: false, result: '',
    }
    const block = findBlock(taskId, blockId)
    if (block) block.steps.push(step)
  }

  // ── 文件生成 Block 管理 ──────────────────────────────────

  /** 从文件路径提取文件名和扩展数 */
  function extractFileInfo(filePath: string): { name: string; type: string } {
    const normalized = filePath.replace(/\\/g, '/')
    const name = normalized.split('/').pop() || filePath
    const dotIdx = name.lastIndexOf('.')
    const type = dotIdx > 0 ? name.substring(dotIdx + 1).toLowerCase() : 'txt'
    return { name, type }
  }
  
  /** 格式化文件大小为可读字符串 */
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  /** 确保 file_gen block 存在，不存在则创建 */
  function ensureFileGenBlock(taskId: string, state: PerTaskState): string {
    if (state.fileGenBlockId) {
      const existing = findBlock(taskId, state.fileGenBlockId)
      if (existing) return state.fileGenBlockId
    }
    const blockId = bridgeId()
    state.fileGenBlockId = blockId
    store.addBlock(taskId, {
      id: blockId, type: 'file_gen', expanded: true, status: 'running',
      text: '生成文件', steps: [], genFiles: [],
    } as any)
    return blockId
  }

  /** 向 file_gen block 添加一个生成的文件 */
  function addFileToGenBlock(taskId: string, state: PerTaskState, file: { name: string; type: string; content: string; filePath?: string }) {
    const blockId = ensureFileGenBlock(taskId, state)
    const block = findBlock(taskId, blockId)
    if (!block) return
    if (!block.genFiles) block.genFiles = []
    const existingIdx = block.genFiles.findIndex(f => f.name === file.name)
    if (existingIdx >= 0) { block.genFiles[existingIdx] = file } else { block.genFiles.push(file) }
    mutateBlock(taskId, blockId, { status: 'success', text: `已生成 ${block.genFiles.length} 个文件` })
    const task = findTask(taskId)
    if (task) {
      if (!task.genFiles) task.genFiles = []
      const taskExistingIdx = task.genFiles.findIndex(f => f.name === file.name)
      if (taskExistingIdx >= 0) { task.genFiles[taskExistingIdx] = file } else { task.genFiles.push(file) }
    }
  }

  /** 文件被 move_path 重命名/移动后，更新 genFiles 中的名称和路径 */
  function renameFileInGenBlock(taskId: string, state: PerTaskState, sourcePath: string, destPath: string) {
    const srcNorm = sourcePath.replace(/\\/g, '/')
    const srcInfo = extractFileInfo(srcNorm)
    const destNorm = destPath.replace(/\\/g, '/')
    const destInfo = extractFileInfo(destNorm)
    const task = findTask(taskId)
    const workDir = task?.dir || ''
    const isDestAbsolute = destNorm.startsWith('/') || /^[A-Za-z]:/.test(destNorm)
    const destAbsPath = isDestAbsolute ? destNorm : workDir ? `${workDir}/${destNorm}`.replace(/\\/g, '/') : destNorm

    const blockId = state.fileGenBlockId
    if (!blockId) return
    const block = findBlock(taskId, blockId)
    if (!block || !block.genFiles) return
    let fileEntry = block.genFiles.find(f => f.name === srcInfo.name)
    if (!fileEntry) { fileEntry = block.genFiles.find(f => f.filePath && f.filePath.replace(/\\/g, '/').endsWith(srcNorm)) }
    if (fileEntry) {
      fileEntry.name = destInfo.name; fileEntry.type = destInfo.type; fileEntry.filePath = destAbsPath
      if (fileEntry.content && fileEntry.content.startsWith('[文件]')) { fileEntry.content = `[文件] ${destNorm}` }
    }
    if (task && task.genFiles) {
      let taskEntry = task.genFiles.find(f => f.name === srcInfo.name)
      if (!taskEntry) { taskEntry = task.genFiles.find(f => f.filePath && f.filePath.replace(/\\/g, '/').endsWith(srcNorm)) }
      if (taskEntry) {
        taskEntry.name = destInfo.name; taskEntry.type = destInfo.type; taskEntry.filePath = destAbsPath
        if (taskEntry.content && taskEntry.content.startsWith('[文件]')) { taskEntry.content = `[文件] ${destNorm}` }
      }
    }
  }

  /** 文件被 delete_path 删除后，从 genFiles 中移除 */
  function removeFileFromGenBlock(taskId: string, state: PerTaskState, filePath: string) {
    const pathNorm = filePath.replace(/\\/g, '/')
    const fileInfo = extractFileInfo(pathNorm)
    const blockId = state.fileGenBlockId
    if (!blockId) return
    const block = findBlock(taskId, blockId)
    if (!block || !block.genFiles) return
    const idx = block.genFiles.findIndex(f => f.name === fileInfo.name || (f.filePath && f.filePath.replace(/\\/g, '/').endsWith(pathNorm)))
    if (idx >= 0) {
      block.genFiles.splice(idx, 1)
      mutateBlock(taskId, blockId, { text: block.genFiles.length > 0 ? `已生成 ${block.genFiles.length} 个文件` : '生成文件' })
    }
    const task = findTask(taskId)
    if (task && task.genFiles) {
      const tIdx = task.genFiles.findIndex(f => f.name === fileInfo.name || (f.filePath && f.filePath.replace(/\\/g, '/').endsWith(pathNorm)))
      if (tIdx >= 0) { task.genFiles.splice(tIdx, 1) }
    }
  }

  function onToolCallEnd(taskId: string, state: PerTaskState, tc: ToolCall, result: ToolResult) {
    if (!state.currentBlockId) return
    const task = store.tasks.find(t => t.id === taskId)
    if (!task) return
    const block = task.blocks.find(b => b.id === state.currentBlockId)
    if (!block) return
    const connName = resolveConnectorName(tc.name)
    const formattedTarget = tc.name.startsWith('mcp_') ? formatMCPToolName(tc.name) : isConnectorTool(tc.name) ? formatConnectorToolName(tc.name, connName) : tc.name
    const runningStep = [...block.steps].reverse().find(
      s => s.status === 'running' && (s.target === tc.name || s.target === formattedTarget)
    )
    if (!runningStep) return
    Object.assign(runningStep, { status: result.success ? 'success' : 'failed', result: result.output, resultLanguage: inferResultLanguage(tc.name) })

    if (tc.name === 'write_file' && result.success) {
      try {
        const args = tc.arguments ? JSON.parse(tc.arguments) : {}
        const filePath = (args.path as string) || ''
        const content = (args.content as string) || ''
        if (filePath) {
          const { name, type } = extractFileInfo(filePath)
          const task = findTask(taskId); const workDir = task?.dir || ''
          const normPath = filePath.replace(/\\/g, '/')
          const isAbsolute = normPath.startsWith('/') || /^[A-Za-z]:/.test(normPath)
          const absPath = isAbsolute ? normPath : workDir ? `${workDir}/${normPath}`.replace(/\\/g, '/') : normPath
          addFileToGenBlock(taskId, state, { name, type, content, filePath: absPath })
        }
      } catch { /* ignore */ }
    }

    if (tc.name === 'run_command' && result.success && result.newFiles && result.newFiles.length > 0) {
      const task = findTask(taskId); const workDir = task?.dir || ''
      const skipExts = new Set(['log', 'tmp', 'pyc', 'pyo'])
      const skipPrefixes = ['__pycache__/', '.cache/', 'node_modules/']
      for (const nf of result.newFiles) {
        const { name, type } = extractFileInfo(nf.path)
        if (skipExts.has(type)) continue
        if (skipPrefixes.some(p => nf.path.startsWith(p))) continue
        const absPath = workDir ? `${workDir}/${nf.path}`.replace(/\\/g, '/') : nf.path
        addFileToGenBlock(taskId, state, { name, type, content: `[文件] ${nf.path} (${formatFileSize(nf.size)})`, filePath: absPath })
      }
    }

    if (tc.name === 'move_path' && result.success) {
      try {
        const args = tc.arguments ? JSON.parse(tc.arguments) : {}
        const source = (args.source as string) || ''; const destination = (args.destination as string) || ''
        if (source && destination) { renameFileInGenBlock(taskId, state, source, destination) }
      } catch { /* ignore */ }
    }

    if (tc.name === 'delete_path' && result.success) {
      try {
        const args = tc.arguments ? JSON.parse(tc.arguments) : {}
        const path = (args.path as string) || ''
        if (path) { removeFileFromGenBlock(taskId, state, path) }
      } catch { /* ignore */ }
    }
  }

  function onStep(taskId: string, state: PerTaskState, step: ReActStep) {
    if (step.toolCalls.length === 0) {
      const blockId = ensureThinkingBlock(taskId, state)
      const duration = Math.round((Date.now() - state.currentBlockStartTime) / 1000)
      const thinkingContent = state.accumulatedThinking.trim()
      const outputContent = (step.text || '').trim()
      mutateBlock(taskId, blockId, {
        status: 'success', duration,
        text: thinkingContent || undefined,
        extraText: outputContent || undefined,
      })
      state.currentBlockId = null
      return
    }
    finalizeThinkingBlock(taskId, state, step)
  }

  /** 将未完成的 planItems 标记为 failed（任务中止/失败时调用） */
  function failRemainingPlanItems(taskId: string) {
    const task = findTask(taskId)
    if (!task || !task.planItems || task.planItems.length === 0) return
    let changed = false
    for (const item of task.planItems) {
      if (item.status === 'pending' || item.status === 'in_progress') {
        item.status = 'failed'
        changed = true
      }
    }
    if (changed) {
      store.updateTask(taskId, { planItems: [...task.planItems] })
    }
  }

  function onComplete(taskId: string, state: PerTaskState, result: ReActResult) {
    stopTaskTimer(state)

    if (state.planOutputBlockId) {
      const duration = Math.round((Date.now() - state.planOutputStartTime) / 1000)
      mutateBlock(taskId, state.planOutputBlockId, { status: 'success', duration, text: '执行计划生成完成' })
      state.planOutputBlockId = null
    }

    if (state.currentBlockId) {
      const duration = Math.round((Date.now() - state.currentBlockStartTime) / 1000)
      const block = findBlock(taskId, state.currentBlockId)
      const existingExtra = block?.extraText?.trim()
      const thinkingContent = state.accumulatedThinking.trim()
      const finalOutput = (result.text || '').trim()
      // 优先使用完整的 accumulatedThinking，而非流式阶段截断的 block.text
      mutateBlock(taskId, state.currentBlockId, {
        status: result.finished ? 'success' : 'failed', duration,
        text: thinkingContent || block?.text?.trim() || undefined,
        extraText: existingExtra || finalOutput || undefined,
      })
      state.currentBlockId = null
    }

    store.updateTask(taskId, { status: result.finished ? 'completed' : 'failed', report: result.text || '任务完成' })
    if (!result.finished) {
      failRemainingPlanItems(taskId)
      addErrorBlock(taskId, '任务未正常完成', result.text || 'Agent 未正常结束（可能达到最大迭代次数或上下文超出限制）', `迭代次数: ${result.iterations}`)
    }
    store.saveTaskNow(taskId)
  }

  /** 在对话末尾添加错误输出 Block */
  function addErrorBlock(taskId: string, title: string, errorMessage: string, detail?: string) {
    const blockId = bridgeId()
    store.addBlock(taskId, { id: blockId, type: 'error', expanded: true, status: 'failed', text: title, errorMessage, extraText: detail, steps: [] } as any)
    return blockId
  }

  function onError(taskId: string, state: PerTaskState, error: Error) {
    stopTaskTimer(state)
    if (state.planOutputBlockId) {
      mutateBlock(taskId, state.planOutputBlockId, { status: 'failed', text: '执行计划生成失败' })
      state.planOutputBlockId = null
    }
    if (state.currentBlockId) {
      const duration = Math.round((Date.now() - state.currentBlockStartTime) / 1000)
      mutateBlock(taskId, state.currentBlockId, { status: 'failed', duration, text: `错误: ${error.message}` })
      state.currentBlockId = null
    }
    failRemainingPlanItems(taskId)
    addErrorBlock(taskId, '任务执行异常', error.message, error.stack ? error.stack.slice(0, 1000) : undefined)
    store.updateTask(taskId, { status: 'failed' })
    store.saveTaskNow(taskId)
  }

  // ── 计划事件处理 ──

  function onPlanCreated(taskId: string, state: PerTaskState, planItems: PlanItem[]) {
    if (state.planOutputBlockId) {
      const duration = Math.round((Date.now() - state.planOutputStartTime) / 1000)
      const text = planItems.length > 0 ? `执行计划已生成（${planItems.length} 个步骤）` : '简单任务，无需规划'
      mutateBlock(taskId, state.planOutputBlockId, { status: 'success', duration, text })
      state.planOutputBlockId = null
    }
    if (planItems.length === 0) { console.log('[TaskRunnerBridge] 简单任务，无需规划'); return }
    console.log('[TaskRunnerBridge] onPlanCreated 被调用，步骤数:', planItems.length)
    store.updateTask(taskId, { planItems })
    const updatedTask = store.tasks.find(t => t.id === taskId)
    if (updatedTask && updatedTask.planItems) {
      console.log('[TaskRunnerBridge] 验证成功：task.planItems 已更新，数量:', updatedTask.planItems.length)
    } else {
      console.error('[TaskRunnerBridge] 验证失败：task.planItems 未正确更新')
    }
    console.log(`[TaskRunnerBridge] 计划已创建，共 ${planItems.length} 个步骤`)
  }

  function onPlanItemUpdate(taskId: string, updatedItem: PlanItem) {
    const task = findTask(taskId)
    if (!task || !task.planItems) return
    task.planItems = task.planItems.map(item => item.id === updatedItem.id ? { ...item, ...updatedItem } : item)
    store.updateTask(taskId, { planItems: task.planItems })
  }

  function onPlanItemRemove(taskId: string, removedItemId: string) {
    const task = findTask(taskId)
    if (!task || !task.planItems) return
    task.planItems = task.planItems.filter(item => item.id !== removedItemId)
    task.planItems.forEach((item, idx) => { item.order = idx })
    store.updateTask(taskId, { planItems: task.planItems })
  }

  // ── 绑定 / 解绑 ──

  /** 将 TaskRunner 事件绑定到 store 更新（每个任务独立的 state） */
  function bind(runner: TaskRunner, taskId: string, options?: { onCompleteHistory?: (history: ChatMessage[]) => void }) {
    // 为该任务创建独立的 bridge 状态
    const state = createPerTaskState()
    startTaskTimer(taskId, state)

    runner.on('clarification', (request: ClarificationRequest) => {
      const clarificationBlockId = createClarificationBlock(taskId, state, request)
      ;(runner as any).__clarificationBlockId = clarificationBlockId
    })

    runner
      .on('thinking', (text: string) => onThinking(taskId, state, text))
      .on('token', (token: string) => onToken(taskId, state, token))
      .on('toolCallStart', (tc: ToolCall) => onToolCallStart(taskId, state, tc))
      .on('toolCallEnd', (tc: ToolCall, result: ToolResult) => onToolCallEnd(taskId, state, tc, result))
      .on('step', (step: ReActStep) => onStep(taskId, state, step))
      .on('subagentStart', (payload: SubAgentStartPayload) => onSubAgentStart(taskId, state, payload, payload.toolCallId))
      .on('subagentToken', (token: string, toolCallId?: string) => onSubAgentToken(taskId, state, token, toolCallId))
      .on('subagentIteration', (payload: SubAgentIterationPayload) => onSubAgentIteration(taskId, state, payload))
      .on('subagentEnd', (payload: SubAgentEndPayload) => onSubAgentEnd(taskId, state, payload, payload.toolCallId))
      .on('planCreated', (planItems: PlanItem[]) => onPlanCreated(taskId, state, planItems))
      .on('planStart', () => onPlanStart(taskId, state))
      .on('planThinking', (thinking: string) => onPlanThinking(taskId, state, thinking))
      .on('planToken', (token: string) => onPlanToken(taskId, state, token))
      .on('planItemUpdate', (item: PlanItem) => onPlanItemUpdate(taskId, item))
      .on('planItemRemove', (itemId: string) => onPlanItemRemove(taskId, itemId))
      .on('complete', (result: ReActResult) => {
        // ⚠️ 关键顺序：先保存对话历史，再更新任务状态。
        // onComplete 会将 status 设为 'completed'，触发 TaskView 的 watch(task.status)，
        // 该 watch 可能同步调用 sendFollowUpWith（pending follow-up 场景）。
        // 如果先更新状态，sendFollowUpWith 读取 conversationHistory 时拿到的是旧的（上一轮之前的）历史，
        // 导致多轮对话上下文丢失。先保存历史可确保 sendFollowUpWith 读到完整历史。
        if (options?.onCompleteHistory && result.history) {
          console.log(`[TaskRunnerBridge] onCompleteHistory: saving ${result.history.length} messages for task ${taskId}`)
          options.onCompleteHistory(result.history)
        }
        onComplete(taskId, state, result)
      })
      .on('error', (error: Error) => {
        // 同 complete 处理：先保存历史再更新状态，防止 watch 触发 sendFollowUpWith 时读到旧历史
        // 注意：error 时 runner 不返回 result.history，但 runningHistory 仍可通过其他方式获取
        onError(taskId, state, error)
      })
      .on('abort', () => {
        stopTaskTimer(state)
        if (state.planOutputBlockId) {
          mutateBlock(taskId, state.planOutputBlockId, { status: 'failed', text: '计划已取消' })
          state.planOutputBlockId = null
        }
        if (state.currentBlockId) {
          store.updateBlockStatus(taskId, state.currentBlockId, 'failed')
          const b = findBlock(taskId, state.currentBlockId)
          if (b) b.text = '任务已取消'
          state.currentBlockId = null
        }
        failRemainingPlanItems(taskId)
        addErrorBlock(taskId, '任务已取消', '用户手动中止了任务执行')
        store.updateTask(taskId, { status: 'failed' })
        store.saveTaskNow(taskId)
      })
  }

  return {
    bind,
    /** 提交澄清回答后更新对应 block */
    submitClarificationAnswer(taskId: string, blockId: string, answers: ClarificationAnswer[]) {
      onClarificationSubmitted(taskId, blockId, answers)
    },
  }
}

/** 根据工具名推断结果语言（用于代码高亮） */
function inferResultLanguage(toolName: string): string | undefined {
  if (toolName === 'read_file') return undefined // 自动检测
  if (toolName === 'run_command') return 'text'
  if (toolName.startsWith('ssh_exec') || toolName.startsWith('ssh_read_file')) return 'text'
  if (toolName.startsWith('mysql_') || toolName.startsWith('pg_')) return 'text'
  return undefined
}
