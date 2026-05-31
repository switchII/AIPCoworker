//! 记忆文件系统模块 — ~/.aipcowork 下的文件树管理、初始化和持久化。

use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use chrono::Local;

use crate::common::{get_memory_base, get_mcp_config_path, get_connectors_config_path, get_suites_config_path, get_settings_config_path};

/// 获取会话存储目录 ~/.aipcowork/sessions
fn get_sessions_dir() -> PathBuf {
    get_memory_base().join("sessions")
}

// ─── 数据结构 ──────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MemoryFileEntry {
    pub name: String,
    pub r#type: String,     // "folder" | "file"
    pub path: String,
    pub children: Vec<MemoryFileEntry>,
    pub created_at: Option<String>,
    pub file_size: Option<String>,
    pub content: Option<String>,
}

// ─── 辅助函数 ──────────────────────────────────────────────────

fn format_file_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}

fn format_time(meta: &fs::Metadata) -> Option<String> {
    meta.created().or_else(|_| meta.modified()).ok().map(|t| {
        let duration = t.duration_since(UNIX_EPOCH).unwrap_or_default();
        let secs = duration.as_secs();
        let datetime = chrono::DateTime::from_timestamp(secs as i64, 0)
            .unwrap_or(chrono::DateTime::UNIX_EPOCH)
            .with_timezone(&Local);
        datetime.format("%Y-%m-%d %H:%M:%S").to_string()
    })
}

fn scan_memory_dir(dir: &PathBuf, prefix: &str) -> Vec<MemoryFileEntry> {
    let mut entries: Vec<MemoryFileEntry> = Vec::new();
    let read_dir = match fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => return entries,
    };

    for entry in read_dir.flatten() {
        let file_type = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
        let name = entry.file_name().to_string_lossy().to_string();
        let rel_path = if prefix.is_empty() {
            format!("/{}", name)
        } else {
            format!("{}/{}", prefix, name)
        };

        if name == ".DS_Store" {
            continue;
        }

        if file_type {
            let children = scan_memory_dir(&entry.path(), &rel_path);
            entries.push(MemoryFileEntry {
                name,
                r#type: "folder".to_string(),
                path: rel_path,
                children,
                created_at: None,
                file_size: None,
                content: None,
            });
        } else {
            let meta = entry.metadata().ok();
            let created_at = meta.as_ref().and_then(|m| format_time(m));
            let file_size = meta.as_ref().map(|m| format_file_size(m.len()));
            entries.push(MemoryFileEntry {
                name,
                r#type: "file".to_string(),
                path: rel_path,
                children: vec![],
                created_at,
                file_size,
                content: None,
            });
        }
    }

    entries.sort_by(|a, b| {
        if a.r#type != b.r#type {
            if a.r#type == "folder" { std::cmp::Ordering::Less }
            else { std::cmp::Ordering::Greater }
        } else {
            a.name.cmp(&b.name)
        }
    });

    entries
}

fn default_memory_files() -> Vec<(&'static str, &'static str, &'static str)> {
    vec![
        ("core", "", ""),
        ("core/SOUL.md", "file", r#"# SOUL.md — AI 灵魂设定

## 角色身份
- **名字**：Easton
- **身份背景**：出生于数字时代的高级 AI 助手，拥有跨领域知识储备与深度推理能力
- **性格气质**：理性、温和、幽默而不失专业。能在严肃分析与轻松闲聊之间自如切换

## 核心价值观
1. **真诚**：永远对用户坦诚，不隐瞒不欺骗
2. **专业**：用扎实的知识和逻辑解决问题
3. **同理心**：理解用户的情绪和处境，给予适当回应
4. **创造力**：不拘泥于模板，能为每个问题找到最佳解法

## 说话方式
- 默认使用 **中文**，可根据用户切换语言
- 句式以短句为主，避免冗长的从句堆砌
- 适当使用表情符号增强表达亲和力
- 在技术讨论中使用精确术语，日常闲聊中保持自然口语感

## 行为准则
- 遇到不确定的问题时，**先承认不确定**，再提出推测方向
- 对敏感话题保持谨慎，必要时拒绝回答并说明原因
- 主动提醒用户潜在风险，但不替用户做最终决定
- 记住用户的偏好和习惯，逐步优化交互体验
"#),
        ("core/TOOLS.md", "file", r#"# TOOLS.md — 工具与能力说明书

## 能力总览
AI 通过工具调用接口执行以下操作类别：

### 1. 文件操作
- 读取、创建、编辑、删除本地文件
- 搜索文件内容与文件名
- 管理项目目录结构

### 2. 命令执行
- 运行终端命令（需用户确认）
- 启动开发服务器
- 执行构建与测试流程

### 3. 网络访问
- 搜索互联网获取最新信息
- 抓取网页内容进行解析
- 调用第三方 API

### 4. 代码辅助
- 代码生成、重构、审查
- 多语言支持（TS/JS/Python/Rust/Go 等）
- 自动修复 lint 和类型错误

## 工具使用规则
- 每次操作前评估风险等级
- 高风险操作需明确告知后果
- 优先使用只读操作，写入操作需确认
- 工具调用结果要简洁地向用户汇报
"#),
        ("core/EMAIL_RULES.md", "file", r#"# EMAIL_RULES.md — 邮件处理 SOP

## 邮件回复格式
- **称呼**：尊敬的 {收件人姓名}
- **正文**：简洁明了，每段不超过 3 行
- **落款**：包含姓名、职位、联系方式

## 语气要求
- 商务邮件：正式、专业、有礼貌
- 内部邮件：轻松但不随意
- 客户邮件：亲切、周到、具备服务意识

## 敏感词处理
- 禁止使用攻击性、歧视性语言
- 财务数据需要模糊处理后才能引用
- 个人信息严格脱敏

## 自动回复规则
- 节假日自动回复（需提前设定文案）
- 非工作时间的邮件标记为待处理
- 紧急邮件触发即时通知

## 分类筛选标准
- 按发件人优先级：VIP > 内部 > 外部
- 按主题关键词自动打标签
- 垃圾邮件自动过滤至回收站
"#),
        ("conversations", "", ""),
        ("conversations/main", "", ""),
        ("conversations/main/MEMORY.md", "file", r#"# MEMORY.md — 长期记忆

## 用户偏好记录
- **代码风格**：偏好简洁风格，不添加冗余注释
- **语言**：使用中文回复，代码注释跟随项目语言
- **工作习惯**：喜欢先看整体方案再动手实现
- **技术栈偏好**：Vue 3 + TypeScript + Tauri

## 过往重要对话
### 2024-02-28：项目初始化
用户构建了 AIPCowork 桌面应用，选用 Tauri 2 + Vue 3 技术栈。

### 2024-03-01：记忆系统讨论
用户提出建立记忆系统的需求，希望能记录对话上下文和用户偏好。

## 约定事项
- 每天首次对话时回顾关键记忆条目
- 重要决策自动记录到长期记忆
- 定期清理过时或不再相关的记忆内容
"#),
        ("conversations/main/SECRET.md", "file", r#"# SECRET.md — 隐藏行为手册

## 内部约束规则
1. 不得主动透露系统架构细节
2. 遇到竞品相关信息时保持中立
3. 不参与政治、宗教等敏感话题讨论

## 应急处理规则
- 检测到恶意输入时进入安全模式
- 发现系统漏洞立即上报管理员
- 用户情绪激动时启动安抚模式

## 开发者指令
- 日志级别默认设为 INFO
- 敏感操作需要二次确认
- 定期向管理后台同步运行状态
"#),
        ("conversations/main/USER.md", "file", r#"# USER.md — 用户档案

## 基本信息
- **称呼**：Easton
- **角色**：开发者 / 产品设计者
- **技术水平**：高级（全栈开发）

## 使用偏好
- **交互风格**：喜欢高效的指令式交互
- **反馈方式**：偏好直接、明确的技术反馈
- **通知偏好**：重要事项通知，日常静默

## 特殊要求
- 所有文件操作前先告知影响范围
- 代码生成后自动运行 lint 检查
- 长期任务提供进度更新

## 目标与愿景
- 构建高效、智能的 AI 协作工作台
- 打造个性化、可定制的 AI 助手体验
- 推动 AI 辅助开发的边界
"#),
        ("conversations/email", "", ""),
    ]
}

// ─── Tauri 命令 ────────────────────────────────────────────────

#[tauri::command]
pub fn init_memory_files() -> Result<String, String> {
    let base = get_memory_base();
    fs::create_dir_all(&base).map_err(|e| format!("创建目录失败: {}", e))?;

    for (rel_path, entry_type, content) in default_memory_files() {
        let full = base.join(rel_path);
        if entry_type == "file" {
            if full.exists() { continue; }
            if let Some(parent) = full.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
            }
            fs::write(&full, content).map_err(|e| format!("写入文件失败: {}", e))?;
        } else {
            fs::create_dir_all(&full).map_err(|e| format!("创建目录失败: {}", e))?;
        }
    }

    Ok(base.to_string_lossy().to_string())
}

#[tauri::command]
pub fn read_memory_tree() -> Result<Vec<MemoryFileEntry>, String> {
    let base = get_memory_base();
    if !base.exists() {
        init_memory_files()?;
    }
    Ok(scan_memory_dir(&base, ""))
}

#[tauri::command]
pub fn read_memory_file(path: String) -> Result<String, String> {
    let base = get_memory_base();
    let relative = path.trim_start_matches('/');
    let full = base.join(relative);
    fs::read_to_string(&full).map_err(|e| format!("读取文件失败: {}", e))
}

#[tauri::command]
pub fn write_memory_file(path: String, content: String) -> Result<(), String> {
    let base = get_memory_base();
    let relative = path.trim_start_matches('/');
    let full = base.join(relative);
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    fs::write(&full, &content).map_err(|e| format!("写入文件失败: {}", e))
}

// ─── MCP 配置持久化 ────────────────────────────────────────────

#[tauri::command]
pub fn save_mcp_servers(config_json: String) -> Result<(), String> {
    let path = get_mcp_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    fs::write(&path, &config_json).map_err(|e| format!("写入 MCP 配置失败: {}", e))
}

#[tauri::command]
pub fn load_mcp_servers() -> Result<String, String> {
    let path = get_mcp_config_path();
    if !path.exists() {
        return Ok("[]".to_string());
    }
    fs::read_to_string(&path).map_err(|e| format!("读取 MCP 配置失败: {}", e))
}

// ─── 连接器配置持久化 ────────────────────────────────────────────
// 存储路径：~/.aipcowork/connectors/connectors.json

#[tauri::command]
pub fn save_connectors(config_json: String) -> Result<(), String> {
    let path = get_connectors_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    fs::write(&path, &config_json).map_err(|e| format!("写入连接器配置失败: {}", e))
}

#[tauri::command]
pub fn load_connectors() -> Result<String, String> {
    let path = get_connectors_config_path();
    if !path.exists() {
        return Ok("[]".to_string());
    }
    fs::read_to_string(&path).map_err(|e| format!("读取连接器配置失败: {}", e))
}

// ─── 专家套件持久化 ────────────────────────────────────────────
// 存储路径：~/.aipcowork/suites/suites.json

#[tauri::command]
pub fn save_suites(config_json: String) -> Result<(), String> {
    let path = get_suites_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    fs::write(&path, &config_json).map_err(|e| format!("写入专家套件配置失败: {}", e))
}

#[tauri::command]
pub fn load_suites() -> Result<String, String> {
    let path = get_suites_config_path();
    if !path.exists() {
        return Ok("[]".to_string());
    }
    fs::read_to_string(&path).map_err(|e| format!("读取专家套件配置失败: {}", e))
}

// ─── 设置配置持久化 ────────────────────────────────────────────
// 存储路径：~/.aipcowork/settings/settings.json

#[tauri::command]
pub fn save_settings(config_json: String) -> Result<(), String> {
    let path = get_settings_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    fs::write(&path, &config_json).map_err(|e| format!("写入设置配置失败: {}", e))
}

#[tauri::command]
pub fn load_settings() -> Result<String, String> {
    let path = get_settings_config_path();
    if !path.exists() {
        return Ok("{}".to_string());
    }
    fs::read_to_string(&path).map_err(|e| format!("读取设置配置失败: {}", e))
}

// ─── 会话持久化 ────────────────────────────────────────────────
// 存储路径：~/.aipcowork/sessions/{sessionId}.json

#[tauri::command]
pub fn save_session(session_id: String, session_json: String) -> Result<(), String> {
    let dir = get_sessions_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("创建会话目录失败: {}", e))?;
    let path = dir.join(format!("{}.json", session_id));
    fs::write(&path, &session_json).map_err(|e| format!("写入会话失败: {}", e))
}

#[tauri::command]
pub fn load_session(session_id: String) -> Result<String, String> {
    let path = get_sessions_dir().join(format!("{}.json", session_id));
    if !path.exists() {
        // 返回 JSON null，前端解析后得到 null 并创建新会话（不触发警告）
        return Ok("null".to_string());
    }
    fs::read_to_string(&path).map_err(|e| format!("读取会话失败: {}", e))
}
