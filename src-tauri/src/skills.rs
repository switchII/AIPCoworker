//! 技能管理模块 — 技能的 CRUD、命名空间隔离、Copy-on-Modify。
//!
//! 遵循社区 SKILL.md 规范（agentskills.io）：
//!   - 元数据存储在 SKILL.md 文件的 YAML frontmatter 中
//!   - 不再使用 manifest.json
//!
//! 统一存储路径 ~/.aipcowork/skills/：
//!   ~/.aipcowork/skills/builtin/  → 内置技能（从应用资源复制）
//!   ~/.aipcowork/skills/user/     → 用户安装的技能 (git等)
//!   ~/.aipcowork/skills/ai/       → AI 创建的技能
//!   ~/.aipcowork/skills/drafts/   → 草稿

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Windows CREATE_NO_WINDOW 标志，防止弹出控制台窗口
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

use crate::common::{copy_dir_recursive, get_memory_base};

// ─── 数据结构（遵循社区 SKILL.md 规范）────────────────────

/// SkillManifest 对应 SKILL.md frontmatter 中的元数据 + 内部字段
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SkillManifest {
    /// 必需：技能唯一标识（小写字母+连字符）
    pub name: String,
    /// 必需：技能描述
    pub description: String,

    // ── 社区规范可选字段 ──
    #[serde(default)]
    pub license: String,
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub homepage: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub platforms: Vec<String>,
    #[serde(default)]
    pub requires: Vec<String>,

    // ── 内部字段（不存储在 frontmatter 中）──
    /// 技能 ID（从目录名派生）
    #[serde(default)]
    pub id: String,
    /// 图标（Font Awesome 类名）
    #[serde(default)]
    pub icon: String,
    /// 分类
    #[serde(default)]
    pub category: String,
    /// 创建者: 'builtin' | 'user' | 'ai'
    #[serde(default)]
    pub created_by: String,
    /// Copy-on-Modify 来源 ID
    #[serde(default)]
    pub source: String,
    /// 是否为草稿
    #[serde(default)]
    pub draft: bool,
}

fn default_version() -> String {
    "1.0.0".to_string()
}

// ─── 路径解析 ──────────────────────────────────────────────────

/// 获取 skills 根目录 ~/.aipcowork/skills/
fn get_skills_root() -> PathBuf {
    get_memory_base().join("skills")
}

/// 获取内置技能目录 ~/.aipcowork/skills/builtin/
fn get_builtin_skills_dir() -> PathBuf {
    get_skills_root().join("builtin")
}

/// 获取用户技能目录 ~/.aipcowork/skills/user/
fn get_user_skills_dir() -> PathBuf {
    get_skills_root().join("user")
}

/// 获取 AI 技能目录 ~/.aipcowork/skills/ai/
fn get_ai_skills_dir() -> PathBuf {
    get_skills_root().join("ai")
}

/// 获取草稿目录 ~/.aipcowork/skills/drafts/
fn get_drafts_dir() -> PathBuf {
    get_skills_root().join("drafts")
}

/// 根据命名空间获取对应目录
fn get_skill_dir_for_namespace(namespace: &str) -> PathBuf {
    match namespace {
        "builtin" => get_builtin_skills_dir(),
        "ai" => get_ai_skills_dir(),
        "draft" | "drafts" => get_drafts_dir(),
        _ => get_user_skills_dir(), // "user" or default
    }
}

// ─── 辅助函数 ──────────────────────────────────────────────────

/// 从 SKILL.md 文件中解析 YAML frontmatter 并提取 SkillManifest
///
/// 返回 None 如果:
///   - 文件不存在
///   - 没有有效的 frontmatter
///   - 缺少必需字段 (name, description)
fn parse_skill_md(path: &Path) -> Option<SkillManifest> {
    let content = fs::read_to_string(path).ok()?;
    let trimmed = content.trim_start();

    // 检查是否以 --- 开头
    if !trimmed.starts_with("---") {
        return None;
    }

    // 找到第二个 ---
    let after_first = &trimmed[3..];
    let second_delim = after_first.find("\n---")?;
    let yaml_block = &after_first[..second_delim];

    // 解析 YAML
    let manifest: SkillManifest = serde_yaml::from_str(yaml_block).ok()?;

    // 校验必需字段
    if manifest.name.is_empty() || manifest.description.is_empty() {
        return None;
    }

    Some(manifest)
}

/// 扫描指定目录下的所有技能子目录
fn scan_skill_dirs(base: &Path, created_by: &str) -> Vec<SkillManifest> {
    let mut skills: Vec<SkillManifest> = Vec::new();
    let entries = match fs::read_dir(base) {
        Ok(e) => e,
        Err(_) => return skills,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let skill_id = entry.file_name().to_string_lossy().to_string();
        let skill_md_path = path.join("SKILL.md");

        // 尝试从 SKILL.md 的 frontmatter 解析元数据
        if let Some(mut manifest) = parse_skill_md(&skill_md_path) {
            manifest.id = skill_id;
            manifest.created_by = created_by.to_string();
            skills.push(manifest);
        } else {
            eprintln!("跳过无效技能目录 {}: SKILL.md 缺少有效 frontmatter", skill_id);
        }
    }
    skills
}

/// 确保目录存在，不存在则创建
fn ensure_dir(dir: &Path) -> Result<(), String> {
    if !dir.exists() {
        fs::create_dir_all(dir).map_err(|e| format!("创建目录失败 {:?}: {}", dir, e))?;
    }
    Ok(())
}

fn validate_skill_id(id: &str) -> Result<(), String> {
    if id.contains("..") || id.contains('/') || id.contains('\\') {
        Err("技能 ID 包含非法字符".to_string())
    } else {
        Ok(())
    }
}

fn list_files_recursive(base: &Path, current: &Path, out: &mut Vec<String>) -> Result<(), String> {
    let entries = fs::read_dir(current).map_err(|e| format!("读取目录失败: {}", e))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') { continue; }
        if path.is_dir() {
            list_files_recursive(base, &path, out)?;
        } else {
            if let Ok(rel) = path.strip_prefix(base) {
                out.push(rel.to_string_lossy().to_string());
            }
        }
    }
    Ok(())
}

// ─── Tauri 命令 ────────────────────────────────────────────────

/// 加载内置技能（从 ~/.aipcowork/skills/builtin/ 读取）
#[tauri::command]
pub fn load_builtin_skills() -> Result<Vec<SkillManifest>, String> {
    let base = get_builtin_skills_dir();
    if !base.exists() {
        return Ok(vec![]);
    }
    Ok(scan_skill_dirs(&base, "builtin"))
}

/// 加载用户安装的技能
#[tauri::command]
pub fn load_user_skills() -> Result<Vec<SkillManifest>, String> {
    let base = get_user_skills_dir();
    ensure_dir(&base)?;
    Ok(scan_skill_dirs(&base, "user"))
}

/// 加载 AI 创建的技能
#[tauri::command]
pub fn load_ai_skills() -> Result<Vec<SkillManifest>, String> {
    let base = get_ai_skills_dir();
    ensure_dir(&base)?;
    Ok(scan_skill_dirs(&base, "ai"))
}

/// 加载草稿技能
#[tauri::command]
pub fn load_draft_skills() -> Result<Vec<SkillManifest>, String> {
    let base = get_drafts_dir();
    ensure_dir(&base)?;
    Ok(scan_skill_dirs(&base, "draft"))
}

/// 从 Git 仓库安装社区技能到 ~/.aipcowork/skills/user/
///
/// 流程：
///   1. 验证 repo_url 格式
///   2. git clone --depth 1 到临时目录
///   3. 验证 SKILL.md 存在且包含有效 frontmatter
///   4. 复制到 ~/.aipcowork/skills/user/{skill_name}/
///   5. 返回解析后的 SkillManifest
#[tauri::command]
pub fn install_skill_from_git(repo_url: String, skill_name: String) -> Result<SkillManifest, String> {
    // 验证 URL 格式
    if !repo_url.starts_with("https://") && !repo_url.starts_with("git@") {
        return Err("无效的 Git 仓库 URL，必须以 https:// 或 git@ 开头".to_string());
    }

    validate_skill_id(&skill_name)?;

    // 创建临时目录
    let temp_dir = std::env::temp_dir().join(format!("aipcowork-skill-install-{}", skill_name));
    if temp_dir.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
    }

    // git clone --depth 1
    let status = {
        let mut cmd = Command::new("git");
        cmd.args(["clone", "--depth", "1", &repo_url])
            .arg(&temp_dir)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.status()
    }
    .map_err(|e| format!("执行 git clone 失败: {}", e))?;

    if !status.success() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(format!("git clone 失败，退出码: {:?}", status.code()));
    }

    // 验证 SKILL.md 存在
    let skill_md_path = temp_dir.join("SKILL.md");
    if !skill_md_path.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
        return Err("仓库中未找到 SKILL.md 文件".to_string());
    }

    // 解析 frontmatter
    let manifest = match parse_skill_md(&skill_md_path) {
        Some(m) => m,
        None => {
            let _ = fs::remove_dir_all(&temp_dir);
            return Err("SKILL.md 缺少有效的 YAML frontmatter（必须包含 name 和 description）".to_string());
        }
    };

    // 复制到用户技能目录 ~/.aipcowork/skills/user/{skill_name}/
    let target_dir = get_user_skills_dir().join(&skill_name);
    ensure_dir(&get_user_skills_dir())?;
    
    if target_dir.exists() {
        let _ = fs::remove_dir_all(&target_dir);
    }
    copy_dir_recursive(&temp_dir, &target_dir)?;

    // 清理临时目录
    let _ = fs::remove_dir_all(&temp_dir);

    let mut result = manifest;
    result.id = skill_name;
    result.created_by = "user".to_string();
    Ok(result)
}

/// 卸载用户安装的技能
#[tauri::command]
pub fn uninstall_skill(skill_id: String) -> Result<(), String> {
    let skill_dir = get_user_skills_dir().join(&skill_id);
    if !skill_dir.exists() {
        return Err(format!("技能不存在: {}", skill_id));
    }
    fs::remove_dir_all(&skill_dir).map_err(|e| format!("删除技能目录失败: {}", e))
}

/// 保存技能内容（SKILL.md with frontmatter）
///
/// 参数：
///   - skill_id: 技能 ID（目录名）
///   - content: 完整的 SKILL.md 内容（包含 YAML frontmatter）
///   - namespace: 命名空间 ('user' | 'ai' | 'draft' | 'builtin')
#[tauri::command]
pub fn skill_save(skill_id: String, content: String, namespace: String) -> Result<String, String> {
    validate_skill_id(&skill_id)?;

    // 验证内容包含有效 frontmatter
    if !content.trim_start().starts_with("---") {
        return Err("SKILL.md 内容必须以 YAML frontmatter 开头 (---)".to_string());
    }

    let base = get_skill_dir_for_namespace(&namespace);
    ensure_dir(&base)?;
    
    let skill_dir = base.join(&skill_id);
    ensure_dir(&skill_dir)?;

    // 写入 SKILL.md
    let skill_md_path = skill_dir.join("SKILL.md");
    let tmp_path = skill_dir.join("SKILL.md.tmp");
    fs::write(&tmp_path, &content)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;
    fs::rename(&tmp_path, &skill_md_path)
        .map_err(|e| format!("重命名 SKILL.md 失败: {}", e))?;

    Ok(skill_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn skill_delete(skill_id: String, namespace: String) -> Result<(), String> {
    validate_skill_id(&skill_id)?;
    let base = get_skill_dir_for_namespace(&namespace);
    let skill_dir = base.join(&skill_id);
    if !skill_dir.exists() {
        return Err(format!("技能不存在: {} (namespace: {})", skill_id, namespace));
    }
    fs::remove_dir_all(&skill_dir).map_err(|e| format!("删除技能目录失败: {}", e))
}

#[tauri::command]
pub fn skill_copy(skill_id: String, from_namespace: String, to_namespace: String) -> Result<String, String> {
    validate_skill_id(&skill_id)?;
    let src_dir = get_skill_dir_for_namespace(&from_namespace).join(&skill_id);
    let dst_dir = get_skill_dir_for_namespace(&to_namespace).join(&skill_id);
    if !src_dir.exists() {
        return Err(format!("源技能不存在: {} (namespace: {})", skill_id, from_namespace));
    }
    copy_dir_recursive(&src_dir, &dst_dir)?;
    Ok(dst_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn skill_exists(skill_id: String, namespace: String) -> Result<bool, String> {
    validate_skill_id(&skill_id)?;
    let base = get_skill_dir_for_namespace(&namespace);
    Ok(base.join(&skill_id).exists())
}

#[tauri::command]
pub fn skill_list_files(skill_id: String, namespace: String) -> Result<Vec<String>, String> {
    validate_skill_id(&skill_id)?;
    let base = get_skill_dir_for_namespace(&namespace);
    let skill_dir = base.join(&skill_id);
    if !skill_dir.exists() {
        return Err(format!("技能不存在: {}", skill_id));
    }
    let mut files: Vec<String> = Vec::new();
    list_files_recursive(&skill_dir, &skill_dir, &mut files)?;
    Ok(files)
}

#[tauri::command]
pub fn get_aipcowork_base() -> Result<String, String> {
    Ok(get_memory_base().to_string_lossy().to_string())
}

#[tauri::command]
pub fn skill_publish_draft(draft_id: String) -> Result<String, String> {
    validate_skill_id(&draft_id)?;
    let draft_dir = get_drafts_dir().join(&draft_id);
    if !draft_dir.exists() {
        return Err(format!("草稿不存在: {}", draft_id));
    }
    let ai_dir = get_ai_skills_dir().join(&draft_id);
    copy_dir_recursive(&draft_dir, &ai_dir)?;
    let _ = fs::remove_dir_all(&draft_dir);
    Ok(ai_dir.to_string_lossy().to_string())
}
