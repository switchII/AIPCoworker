import { ref } from 'vue'

/** 图片文件类型列表 */
const IMAGE_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp']

/** 判断是否为图片类型 */
export function isImageType(type: string): boolean {
  return IMAGE_TYPES.includes(type)
}

/** Word 文档类型 */
const DOCX_TYPES = ['docx', 'doc']
export function isDocxType(type: string): boolean {
  return DOCX_TYPES.includes(type.toLowerCase())
}

/** PPT 演示文稿类型 */
const PPTX_TYPES = ['pptx', 'ppt']
export function isPptxType(type: string): boolean {
  return PPTX_TYPES.includes(type.toLowerCase())
}

/** Excel 表格类型 */
const EXCEL_TYPES = ['xlsx', 'xls', 'csv']
export function isExcelType(type: string): boolean {
  return EXCEL_TYPES.includes(type.toLowerCase())
}

/** PDF 类型 */
export function isPdfType(type: string): boolean {
  return type.toLowerCase() === 'pdf'
}

/** 判断是否为 Office/PDF 文档类型（需要二进制解析） */
export function isDocumentType(type: string): boolean {
  const t = type.toLowerCase()
  return isDocxType(t) || isPptxType(t) || isExcelType(t) || isPdfType(t)
}

/** 预览文件类型（含画廊支持） */
export interface PreviewFileInfo {
  name: string
  type: string
  content: string
  filePath?: string
  gallery?: { name: string; type: string; filePath?: string }[]
}

/**
 * File-related helpers: preview panel, file-type labels, file icons/colors.
 * Used by PreviewPanel, FileGenBlock, SidePanel artifacts, and report sections.
 */
export function useFileUtils() {
  const showPreview = ref(false)
  const previewFile = ref<PreviewFileInfo | null>(null)

  function openPreview(file: { name: string; type: string; content?: string; filePath?: string; gallery?: { name: string; type: string; filePath?: string }[] }) {
    // 如果有真实内容，直接使用；否则回退到模拟内容
    const content = file.content || getPreviewContent(file)
    previewFile.value = {
      name: file.name,
      type: file.type,
      content,
      filePath: file.filePath,
      gallery: file.gallery,
    }
    showPreview.value = true
  }

  function closePreview() {
    showPreview.value = false
    previewFile.value = null
  }

  /** 在系统默认浏览器中打开 HTML 文件 */
  async function openInBrowser(file: { filePath?: string; content?: string; name?: string }) {
    const { openPath } = await import('@tauri-apps/plugin-opener')

    if (file.filePath) {
      try {
        await openPath(file.filePath)
        return
      } catch (e) {
        console.warn('[useFileUtils] openPath 失败:', e)
      }
    }

    if (file.content) {
      // 写入临时文件，再用系统浏览器打开
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const fileName = file.name || `preview-${Date.now()}.html`
        const tmpPath = await invoke<string>('get_temp_file_path', { name: fileName })
        await invoke('agent_write_file', { path: tmpPath, content: file.content })
        await openPath(tmpPath)
      } catch (e) {
        console.warn('[useFileUtils] 临时文件方式打开失败:', e)
        // 回退：window.open
        try {
          const blob = new Blob([file.content], { type: 'text/html' })
          const url = URL.createObjectURL(blob)
          window.open(url, '_blank')
          setTimeout(() => URL.revokeObjectURL(url), 60000)
        } catch (e2) {
          console.warn('[useFileUtils] window.open 回退也失败:', e2)
        }
      }
    }
  }

  function getPreviewContent(file: { name: string; type: string }): string {
    switch (file.type) {
      case 'html':
        return `<html><body><h1>数据可视化报告</h1><p>学生信息数据库包含 2,847 条记录...</p><div style="background:#f0f9ff;padding:20px;border-radius:8px;margin-top:20px;"><h3>数据概览</h3><ul><li>学生总数: 2,847</li><li>院系数量: 12</li><li>专业数量: 48</li></ul></div></body></html>`
      case 'md':
        return `# 数据导入报告\n\n## 概述\n成功将学生数据导入到 PostgreSQL 数据库。\n\n## 导入统计\n- 总记录数: 2,847\n- DDL表数量: 2\n- 导入耗时: 12.3秒\n\n## 表结构\n### student_info\n| 字段 | 类型 | 描述 |\n|------|------|------|\n| id | SERIAL | 主键 |\n| name | VARCHAR(50) | 姓名 |\n| student_no | VARCHAR(20) | 学号 |\n| department | VARCHAR(50) | 院系 |`
      case 'docx':
        return '数据导入报告\n\n一、项目概述\n本次任务将学生管理系统的数据从SQL文件导入PostgreSQL数据库...\n\n二、执行步骤\n1. 分析数据文件结构\n2. 创建数据库表\n3. 导入数据记录\n4. 验证数据完整性\n\n三、结果统计\n导入记录总数: 2,847条\n成功率: 100%'
      case 'xlsx':
        return '学生数据概览表\n\n学号\t姓名\t院系\t专业\t年级\n2021001\t张三\t计算机学院\t软件工程\t2021\n2021002\t李四\t计算机学院\t计算机科学\t2021\n2021003\t王五\t数学学院\t应用数学\t2021\n...(共2847条记录)'
      case 'pptx':
      case 'ppt':
        return '汇报演示文稿\n\n第1页 - 封面\n标题：学生数据导入成果汇报\n副标题：PostgreSQL 数据库迁移项目\n\n第2页 - 项目背景\n· 原有数据存储在 SQL 文件中\n· 需迁移至 PostgreSQL 数据库\n· 涉及 2,847 条学生记录\n\n第3页 - 执行过程\n· DDL 建表 → 数据导入 → 完整性校验\n· 总耗时 12.3 秒\n\n第4页 - 成果总结\n· 导入成功率: 100%\n· 数据表: 2 张\n· 索引: 2 个'
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'svg':
      case 'webp':
      case 'bmp':
        return '[图片预览]\n\n文件名: ' + file.name + '\n类型: ' + file.type.toUpperCase() + ' 图片\n\n该文件为图片格式，包含数据趋势可视化图表。'
      case 'zip':
      case 'rar':
      case '7z':
      case 'tar':
      case 'gz':
        return '[压缩包内容]\n\n文件名: ' + file.name + '\n类型: ' + file.type.toUpperCase() + ' 压缩包\n\n包含文件列表:\n├── sql_ddl.sql (4.2 KB)\n├── sql_insert.sql (3.1 MB)\n├── import_sql.py (1.8 KB)\n└── README.md (0.6 KB)\n\n总大小: 3.2 MB\n文件数量: 4 个'
      default:
        return '文件预览内容'
    }
  }

  function getFileTypeLabel(type: string): string {
    const map: Record<string, string> = {
      'html': 'HTML',
      'md': 'Markdown',
      'docx': 'Word文档',
      'xlsx': 'Excel表格',
      'pdf': 'PDF文档',
      'pptx': 'PPT演示',
      'ppt': 'PPT演示',
      'png': 'PNG图片',
      'jpg': 'JPG图片',
      'jpeg': 'JPEG图片',
      'gif': 'GIF图片',
      'svg': 'SVG图片',
      'webp': 'WebP图片',
      'bmp': 'BMP图片',
      'zip': 'ZIP压缩包',
      'rar': 'RAR压缩包',
      '7z': '7Z压缩包',
      'tar': 'TAR归档',
      'gz': 'GZ压缩包',
    }
    return map[type] || type.toUpperCase()
  }

  function getGenFileIcon(type: string): string {
    const map: Record<string, string> = {
      'docx': 'fa-solid fa-file-word',
      'xlsx': 'fa-solid fa-file-excel',
      'md': 'fa-solid fa-file-lines',
      'html': 'fa-solid fa-file-code',
      'pptx': 'fa-solid fa-file-powerpoint',
      'png': 'fa-solid fa-file-image',
      'jpg': 'fa-solid fa-file-image',
      'jpeg': 'fa-solid fa-file-image',
      'gif': 'fa-solid fa-file-image',
      'svg': 'fa-solid fa-file-image',
      'webp': 'fa-solid fa-file-image',
      'bmp': 'fa-solid fa-file-image',
      'zip': 'fa-solid fa-file-zipper',
      'py': 'fa-solid fa-file-code',
      'csv': 'fa-solid fa-file-csv',
      'txt': 'fa-solid fa-file-lines',
      'sql': 'fa-solid fa-file-code',
    }
    return map[type] || 'fa-solid fa-file'
  }

  function getGenFileColor(type: string): string {
    const map: Record<string, string> = {
      'docx': '#2B579A',
      'xlsx': '#217346',
      'md': '#555',
      'html': '#E44D26',
      'pptx': '#D24726',
      'png': '#8E44AD',
      'jpg': '#8E44AD',
      'jpeg': '#8E44AD',
      'gif': '#8E44AD',
      'svg': '#8E44AD',
      'webp': '#8E44AD',
      'bmp': '#8E44AD',
      'zip': '#F39C12',
      'py': '#306998',
      'csv': '#217346',
      'txt': '#555',
      'sql': '#2B579A',
    }
    return map[type] || '#555'
  }

  return {
    showPreview,
    previewFile,
    openPreview,
    closePreview,
    openInBrowser,
    getPreviewContent,
    getFileTypeLabel,
    getGenFileIcon,
    getGenFileColor,
  }
}
