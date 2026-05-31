/**
 * 技能管理工具定义与执行器
 *
 * 为 Agent 提供 6 个技能管理工具：
 *   - skill_create:    创建新技能（直接生效或草稿）
 *   - skill_patch:     局部修改技能内容（查找替换）
 *   - skill_edit:      整文件重写
 *   - skill_write_file: 给技能添加附属文件
 *   - skill_remove_file: 删除技能附属文件
 *   - skill_delete:    删除整个技能
 *
 * 工具定义遵循 src/data/tool-definitions/ 的模式，
 * 执行器委托给 SkillManager 单例。
 */

import type { ToolDefinition } from '../llm/llmClient'
import type { ToolResult } from '../core/reactAgent'
import type { CreateMode, SkillManifest } from './skillManager'
import { getSkillManager } from './skillManager'
import { loadSkillsByIdentifiers } from './skillLoader'

// ─── 工具定义 ──────────────────────────────────────────────────────

const skillCreateTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'skill_create',
    description:
      'Create a new Agent Skill following the SKILL.md community specification (agentskills.io).' +
      '\n\nParameters:' +
      '\n- id: Unique identifier (kebab-case, e.g. "code-review")' +
      '\n- name: Display name for the skill' +
      '\n- description: Short description of what the skill does' +
      '\n- content: Markdown content for SKILL.md (instructions, steps, examples)' +
      '\n- license: Optional license identifier (e.g. "MIT")' +
      '\n- version: Optional semver version (default: "1.0.0")' +
      '\n- author: Optional author name' +
      '\n- homepage: Optional project homepage URL' +
      '\n- tags: Optional array of category tags (e.g. ["code", "review"])' +
      '\n- platforms: Optional supported platforms (e.g. ["cursor", "claude"])' +
      '\n- mode: "active" to activate immediately (default), "draft" for review',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Unique skill identifier (kebab-case: lowercase, digits, hyphens, max 64 chars)',
        },
        name: {
          type: 'string',
          description: 'Display name for the skill',
        },
        description: {
          type: 'string',
          description: 'Short description of what the skill does',
        },
        content: {
          type: 'string',
          description: 'Full Markdown content for SKILL.md (instructions, steps, examples)',
        },
        license: {
          type: 'string',
          description: 'License identifier (e.g. "MIT", "Apache-2.0")',
        },
        version: {
          type: 'string',
          description: 'Semver version string (default: "1.0.0")',
        },
        author: {
          type: 'string',
          description: 'Author or organization name',
        },
        homepage: {
          type: 'string',
          description: 'Project homepage URL',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Category tags (e.g. ["code", "review", "quality"])',
        },
        platforms: {
          type: 'array',
          items: { type: 'string' },
          description: 'Supported platforms (e.g. ["cursor", "claude", "copilot"])',
        },
        mode: {
          type: 'string',
          enum: ['active', 'draft'],
          description: 'Creation mode: active=immediate (default), draft=requires review',
        },
      },
      required: ['id', 'name', 'description', 'content'],
    },
  },
}

const skillPatchTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'skill_patch',
    description:
      '局部修改技能文件内容。通过查找一段旧文本并替换为新文本来实现精确修改。' +
      '适合小范围修正，不需要重写整个文件。' +
      '\n\n注意：如果修改的是用户创建的技能，系统会自动复制到 AI 专属目录后再修改，原技能不受影响。',
    parameters: {
      type: 'object',
      properties: {
        skill_id: {
          type: 'string',
          description: '要修改的技能 ID',
        },
        file_path: {
          type: 'string',
          description: '要修改的文件路径（相对于技能目录，如 "SKILL.md"）',
        },
        old_text: {
          type: 'string',
          description: '要被替换的旧文本（必须精确匹配文件中的内容）',
        },
        new_text: {
          type: 'string',
          description: '替换后的新文本',
        },
      },
      required: ['skill_id', 'file_path', 'old_text', 'new_text'],
    },
  },
}

const skillEditTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'skill_edit',
    description:
      '整文件重写技能内容。用全新的内容替换指定文件的全部内容。' +
      '适合大范围修改或当 patch 不稳定时使用。' +
      '比 skill_patch 更可靠，但需要提供完整的文件内容。' +
      '\n\n注意：如果修改的是用户创建的技能，系统会自动复制到 AI 专属目录后再修改。',
    parameters: {
      type: 'object',
      properties: {
        skill_id: {
          type: 'string',
          description: '要修改的技能 ID',
        },
        file_path: {
          type: 'string',
          description: '要重写的文件路径（相对于技能目录，如 "SKILL.md"）',
        },
        content: {
          type: 'string',
          description: '完整的文件新内容',
        },
      },
      required: ['skill_id', 'file_path', 'content'],
    },
  },
}

const skillWriteFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'skill_write_file',
    description:
      '给技能添加附属文件。支持写入模板文件、脚本、参考资料、配置文件等。' +
      '文件路径相对于技能目录，支持子目录（如 "templates/email.md"）。' +
      '\n\n用途示例：' +
      '\n- 为邮件技能添加邮件模板' +
      '\n- 为数据分析技能添加 Python 脚本' +
      '\n- 为任何技能添加参考文档',
    parameters: {
      type: 'object',
      properties: {
        skill_id: {
          type: 'string',
          description: '目标技能 ID',
        },
        file_path: {
          type: 'string',
          description: '文件路径（相对于技能目录，如 "templates/report.html"）',
        },
        content: {
          type: 'string',
          description: '文件内容',
        },
      },
      required: ['skill_id', 'file_path', 'content'],
    },
  },
}

const skillRemoveFileTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'skill_remove_file',
    description:
      '删除技能的附属文件。不能删除 manifest.json（技能清单）。' +
      '适合清理不再需要的模板、脚本或参考资料。',
    parameters: {
      type: 'object',
      properties: {
        skill_id: {
          type: 'string',
          description: '目标技能 ID',
        },
        file_path: {
          type: 'string',
          description: '要删除的文件路径（相对于技能目录）',
        },
      },
      required: ['skill_id', 'file_path'],
    },
  },
}

const skillDeleteTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'skill_delete',
    description:
      '删除整个技能（包括所有文件）。操作不可恢复，请谨慎使用。' +
      '\n\n只能删除 AI 创建的技能，不能删除用户安装的技能或内置技能。',
    parameters: {
      type: 'object',
      properties: {
        skill_id: {
          type: 'string',
          description: '要删除的技能 ID',
        },
      },
      required: ['skill_id'],
    },
  },
}

const skillLoadTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'skill_load',
    description:
      '加载指定技能的完整 SKILL.md 内容，包括技能目录路径。' +
      '\n\n当你需要使用某个技能时，调用此工具获取详细的操作指令。' +
      '\n返回结果中包含技能的安装目录路径，技能中引用的脚本和文件均相对于该目录。' +
      '\n技能 ID 可以从可用技能索引中获取。' +
      '\n\n示例：skill_load({ skill_id: "pdf-processor" })',
    parameters: {
      type: 'object',
      properties: {
        skill_id: {
          type: 'string',
          description: '要加载的技能 ID（kebab-case，如 "pdf-processor"）',
        },
      },
      required: ['skill_id'],
    },
  },
}

/** 所有技能管理工具定义列表 */
export function buildSkillToolDefinitions(): ToolDefinition[] {
  return [
    skillCreateTool,
    skillPatchTool,
    skillEditTool,
    skillWriteFileTool,
    skillRemoveFileTool,
    skillDeleteTool,
    skillLoadTool,
  ]
}

// ─── 工具执行器 ─────────────────────────────────────────────────────

/**
 * 执行技能管理工具调用。
 * @returns ToolResult，如果工具名不匹配则返回 null
 */
export async function executeSkillTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult | null> {
  const sm = getSkillManager()
  await sm.init()

  switch (name) {
    case 'skill_create': {
      const id = args.id as string
      const skillName = args.name as string
      const description = args.description as string
      const content = args.content as string
      const license = args.license as string | undefined
      const version = (args.version as string) || '1.0.0'
      const author = (args.author as string) || 'AI Agent'
      const homepage = args.homepage as string | undefined
      const tags = args.tags as string[] | undefined
      const platforms = args.platforms as string[] | undefined
      const mode = (args.mode as CreateMode) || 'active'

      if (!id || !skillName || !description || !content) {
        return { success: false, output: '创建技能需要提供 id、name、description 和 content 参数' }
      }

      const manifest: SkillManifest = {
        id,
        name: skillName,
        description,
        license,
        version,
        author,
        homepage,
        tags,
        platforms,
        created_by: 'ai',
      }

      const result = await sm.createSkill(manifest, content, mode)
      return { success: result.success, output: result.message }
    }

    case 'skill_patch': {
      const skillId = args.skill_id as string
      const filePath = args.file_path as string
      const oldText = args.old_text as string
      const newText = args.new_text as string

      if (!skillId || !filePath || !oldText || newText === undefined) {
        return { success: false, output: '修改技能需要提供 skill_id、file_path、old_text 和 new_text 参数' }
      }

      const result = await sm.patchSkill(skillId, filePath, oldText, newText)
      return { success: result.success, output: result.message }
    }

    case 'skill_edit': {
      const skillId = args.skill_id as string
      const filePath = args.file_path as string
      const content = args.content as string

      if (!skillId || !filePath || !content) {
        return { success: false, output: '重写技能需要提供 skill_id、file_path 和 content 参数' }
      }

      const result = await sm.editSkill(skillId, filePath, content)
      return { success: result.success, output: result.message }
    }

    case 'skill_write_file': {
      const skillId = args.skill_id as string
      const filePath = args.file_path as string
      const content = args.content as string

      if (!skillId || !filePath || !content) {
        return { success: false, output: '写入技能文件需要提供 skill_id、file_path 和 content 参数' }
      }

      const result = await sm.writeSkillFile(skillId, filePath, content)
      return { success: result.success, output: result.message }
    }

    case 'skill_remove_file': {
      const skillId = args.skill_id as string
      const filePath = args.file_path as string

      if (!skillId || !filePath) {
        return { success: false, output: '删除技能文件需要提供 skill_id 和 file_path 参数' }
      }

      const result = await sm.removeSkillFile(skillId, filePath)
      return { success: result.success, output: result.message }
    }

    case 'skill_delete': {
      const skillId = args.skill_id as string

      if (!skillId) {
        return { success: false, output: '删除技能需要提供 skill_id 参数' }
      }

      const result = await sm.deleteSkill(skillId)
      return { success: result.success, output: result.message }
    }

    case 'skill_load': {
      const skillId = args.skill_id as string

      if (!skillId) {
        return { success: false, output: '加载技能需要提供 skill_id 参数' }
      }

      const skills = await loadSkillsByIdentifiers([skillId])
      if (skills.length === 0) {
        return { success: false, output: `未找到技能: ${skillId}，请检查技能 ID 是否正确` }
      }

      const skill = skills[0]
      const output = [
        `# ${skill.name}`,
        '',
        skill.description ? `> ${skill.description}` : '',
        '',
        `**版本**: ${skill.version || '未指定'}`,
        `**作者**: ${skill.author || '未指定'}`,
        `**命名空间**: ${skill.namespace}`,
        `**技能目录**: ${skill.dirPath}`,
        '',
        '> 重要：技能中引用的所有脚本和文件路径均相对于上述技能目录。',
        '> 执行脚本时，请使用绝对路径（技能目录 + 相对路径）。',
        '',
        '---',
        '',
        skill.content,
      ].join('\n')

      return { success: true, output }
    }

    default:
      return null
  }
}
