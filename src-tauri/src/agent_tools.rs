//! Agent 工具命令模块 — 文件操作、Shell 执行、Glob/Ripgrep 搜索。

use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Windows CREATE_NO_WINDOW 标志，防止弹出控制台窗口
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// ─── 数据结构 ──────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct DirEntry {
    pub name: String,
    pub r#type: String, // "file" | "directory" | "symlink"
    pub size: Option<u64>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct GlobResult {
    pub path: String,
    pub r#type: String,
    pub size: Option<u64>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SearchResult {
    pub path: String,
    pub line_number: usize,
    pub line_content: String,
    pub context_before: Vec<String>,
    pub context_after: Vec<String>,
}

/// run_command 执行后发现到的新文件
#[derive(Debug, Clone, serde::Serialize)]
pub struct NewFileInfo {
    pub path: String,
    pub size: u64,
}

/// agent_run_command 的返回结构（包含输出和新文件列表）
#[derive(Debug, Clone, serde::Serialize)]
pub struct CommandResult {
    pub output: String,
    pub new_files: Vec<NewFileInfo>,
}

// ─── 安全检查 ──────────────────────────────────────────────────

/// 检查搜索路径是否为危险路径（系统根目录或关键系统目录）
fn is_dangerous_search_path(path: &str) -> bool {
    let normalized = path.replace('\\', "/");
    let trimmed = normalized.trim_end_matches('/');
    
    if trimmed.is_empty() || trimmed == "/" {
        return true;
    }
    
    if trimmed.len() <= 3 {
        let upper = trimmed.to_uppercase();
        if upper == "C:" || upper == "D:" || upper == "E:" || upper == "F:" 
           || upper == "G:" || upper == "H:" {
            return true;
        }
        if upper == "C:/" || upper == "D:/" || upper == "E:/" || upper == "F:/"
           || upper == "G:/" || upper == "H:/" {
            return true;
        }
    }
    
    let lower = trimmed.to_lowercase();
    
    // 用户目录：只精确拦截目录本身，不拦截子目录（用户工作区必然在 C:/Users/xxx/ 下）
    let user_dirs_exact = ["/users", "/home", "/root", "c:/users"];
    for dir in &user_dirs_exact {
        if lower == *dir {
            return true;
        }
    }
    
    // 系统目录：拦截目录及所有子目录
    let system_dirs_prefix = [
        "/windows", "/program files", "/program files (x86)",
        "/system", "c:/windows", "c:/program files", "c:/program files (x86)",
        "c:/system32",
    ];
    
    for dir in &system_dirs_prefix {
        if lower == *dir || lower.starts_with(&format!("{}/", dir)) {
            return true;
        }
    }
    
    false
}

// ─── 文件操作命令 ──────────────────────────────────────────────

#[tauri::command]
pub async fn agent_read_file(
    path: String,
    offset: Option<u32>,
    limit: Option<u32>,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let content = fs::read_to_string(&path).map_err(|e| format!("读取文件失败 '{}': {}", path, e))?;

        // 如果没有 offset/limit 参数，直接返回全部内容
        if offset.is_none() && limit.is_none() {
            return Ok(content);
        }

        // 按行分割并根据 offset/limit 截取
        let lines: Vec<&str> = content.lines().collect();
        let total_lines = lines.len();
        let start = offset.unwrap_or(0) as usize;
        let end = match limit {
            Some(n) => std::cmp::min(start + n as usize, total_lines),
            None => total_lines,
        };

        if start >= total_lines {
            return Ok(format!("[文件共 {} 行，指定的起始行 {} 超出范围]", total_lines, start));
        }

        let selected: String = lines[start..end].join("\n");
        let remaining_info = if end < total_lines {
            format!("，剩余 {} 行未显示", total_lines - end)
        } else {
            String::new()
        };
        let info = format!(
            "[显示第 {}-{} 行，共 {} 行{}]",
            start + 1,
            end,
            total_lines,
            remaining_info
        );
        Ok(format!("{}\n{}", info, selected))
    })
    .await
    .map_err(|e| format!("任务执行异常: {}", e))?
}

// ─── 读取图片文件（base64 编码）────────────────────────────────────────

#[tauri::command]
pub async fn read_image_base64(path: String) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    tokio::task::spawn_blocking(move || {
        let bytes = fs::read(&path).map_err(|e| format!("读取图片失败 '{}': {}", path, e))?;
        Ok(STANDARD.encode(&bytes))
    })
    .await
    .map_err(|e| format!("任务执行异常: {}", e))?
}

#[tauri::command]
pub async fn agent_write_file(path: String, content: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        if let Some(parent) = std::path::Path::new(&path).parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
        }
        fs::write(&path, &content).map_err(|e| format!("写入文件失败 '{}': {}", path, e))?;
        Ok(format!("成功写入 {} 字节到 {}", content.len(), path))
    })
    .await
    .map_err(|e| format!("任务执行异常: {}", e))?
}

#[tauri::command]
pub async fn agent_list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    tokio::task::spawn_blocking(move || {
        let dir = std::path::Path::new(&path);
        if !dir.exists() {
            return Err(format!("目录不存在: {}", path));
        }
        let mut entries: Vec<DirEntry> = Vec::new();
        let read_dir = fs::read_dir(dir).map_err(|e| format!("读取目录失败 '{}': {}", path, e))?;
        for entry in read_dir.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name == ".DS_Store" {
                continue;
            }
            let file_type = entry.file_type().ok();
            let type_str = if file_type.as_ref().map(|t| t.is_dir()).unwrap_or(false) {
                "directory"
            } else if file_type.as_ref().map(|t| t.is_symlink()).unwrap_or(false) {
                "symlink"
            } else {
                "file"
            };
            let size = entry.metadata().ok().map(|m| m.len());
            entries.push(DirEntry {
                name,
                r#type: type_str.to_string(),
                size,
            });
        }
        entries.sort_by(|a, b| {
            if a.r#type != b.r#type {
                if a.r#type == "directory" { std::cmp::Ordering::Less }
                else { std::cmp::Ordering::Greater }
            } else {
                a.name.cmp(&b.name)
            }
        });
        Ok(entries)
    })
    .await
    .map_err(|e| format!("任务执行异常: {}", e))?
}

// ─── 目录快照（用于检测 run_command 产生的新文件）──────────────

/// 递归扫描目录，收集文件路径和修改时间（最多扫描 4 层深度）
fn snapshot_files(dir: &std::path::Path, base: &std::path::Path, depth: u8) -> std::collections::HashMap<String, u64> {
    let mut map = std::collections::HashMap::new();
    if depth > 4 { return map; }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            // 跳过常见的构建/缓存目录和隐藏目录
            if name.starts_with('.') || name == "node_modules" || name == "__pycache__"
                || name == "target" || name == "dist" || name == ".git" {
                continue;
            }
            let path = entry.path();
            if path.is_file() {
                if let Ok(meta) = path.metadata() {
                    let mtime: u64 = meta.modified().ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    let rel = path.strip_prefix(base)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .to_string()
                        .replace('\\', "/");
                    map.insert(rel, mtime);
                }
            } else if path.is_dir() {
                map.extend(snapshot_files(&path, base, depth + 1));
            }
        }
    }
    map
}

/// 强制杀死指定 PID 及其整个进程树（防止子进程泄漏）。
#[cfg(target_os = "windows")]
fn kill_process_tree(pid: u32) {
    // 使用 taskkill /T 杀死进程树，/F 强制终止
    let mut cmd = Command::new("taskkill");
    cmd.args(["/PID", &pid.to_string(), "/T", "/F"]);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let _ = cmd.output();
}

#[cfg(not(target_os = "windows"))]
fn kill_process_tree(pid: u32) {
    // 先尝试杀死进程组（负 PID）
    let _ = Command::new("kill")
        .args(["-TERM", &format!("-{}", pid)])
        .output();
    // 再直接杀死进程本身
    let _ = Command::new("kill")
        .args(["-KILL", &pid.to_string()])
        .output();
}

/// 危险命令黑名单（不区分大小写匹配）。
/// 包含会对系统造成不可逆损害的命令模式。
const BLOCKED_COMMANDS: &[&str] = &[
    // 磁盘格式化
    "format ",
    // 批量删除系统文件
    "del /s /q c:",
    "del /s /q d:",
    "rmdir /s /q c:\\windows",
    "rmdir /s /q c:\\program",
    "rd /s /q c:\\windows",
    "rd /s /q c:\\program",
    // 注册表大规模删除
    "reg delete hkml",
    "reg delete hklm",
    // 系统用户/密码操作
    "net user administrator",
    "net localgroup administrators",
    // PowerShell 绕过执行策略
    "powershell -executionpolicy bypass",
    "powershell -ep bypass",
    "pwsh -executionpolicy bypass",
    "pwsh -ep bypass",
    // 磁盘低级操作
    "diskpart",
    // 系统关键目录全删
    "rm -rf /",
    "rm -rf /*",
    "mkfs.",
    ":(){:|:&};:",
];

/// 检查命令是否命中黑名单
fn is_command_blocked(command: &str) -> bool {
    let lower = command.to_lowercase();
    BLOCKED_COMMANDS.iter().any(|pattern| lower.contains(pattern))
}

#[tauri::command]
pub async fn agent_run_command(command: String, work_dir: String) -> Result<CommandResult, String> {
    // 安全检查：拦截危险命令
    if is_command_blocked(&command) {
        return Err(format!(
            "⚠️ 安全拦截：命令包含高危操作，已拒绝执行。\n命令: {}",
            command
        ));
    }

    tokio::task::spawn_blocking(move || {
        let work_path = std::path::Path::new(&work_dir);

        // 执行前快照
        let before = snapshot_files(work_path, work_path, 0);

        let child = if cfg!(target_os = "windows") {
            // 先执行 chcp 65001 切换到 UTF-8 代码页，解决中文输出乱码问题
            // 用 >nul 抑制 "Active code page: 65001" 的多余输出
            let cmd_with_utf8 = format!("chcp 65001 >nul && {}", &command);
            let mut cmd = Command::new("cmd");
            cmd.args(["/C", &cmd_with_utf8])
                .current_dir(&work_dir)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped());
            #[cfg(target_os = "windows")]
            cmd.creation_flags(CREATE_NO_WINDOW);
            cmd.spawn()
        } else {
            Command::new("sh")
                .args(["-c", &command])
                .current_dir(&work_dir)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
        }.map_err(|e| format!("命令启动失败: {}", e))?;

        let child_pid = child.id();
        let timeout = Duration::from_secs(30);
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let output = child.wait_with_output();
            let _ = tx.send(output);
        });

        match rx.recv_timeout(timeout) {
            Ok(Ok(out)) => {
                let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                let status = if out.status.success() { "✅ 成功" } else { "❌ 失败" };
                let exit_code = out.status.code().unwrap_or(-1);
                let mut result = format!("[{}] 退出码: {}\n", status, exit_code);
                if !stdout.is_empty() {
                    result.push_str(&format!("stdout:\n{}", stdout));
                }
                if !stderr.is_empty() {
                    result.push_str(&format!("stderr:\n{}", stderr));
                }
                if stdout.is_empty() && stderr.is_empty() {
                    result.push_str("(无输出)");
                }

                // 执行后快照，检测新文件
                let after = snapshot_files(work_path, work_path, 0);
                let mut new_files: Vec<NewFileInfo> = Vec::new();
                for path in after.keys() {
                    if !before.contains_key(path) {
                        let abs = work_path.join(path.replace('/', std::path::MAIN_SEPARATOR_STR));
                        let size = abs.metadata().map(|m| m.len()).unwrap_or(0);
                        new_files.push(NewFileInfo {
                            path: path.clone(),
                            size,
                        });
                    }
                }
                // 按路径排序，确保顺序稳定
                new_files.sort_by(|a, b| a.path.cmp(&b.path));

                Ok(CommandResult { output: result, new_files })
            }
            Ok(Err(e)) => Err(format!("命令执行失败: {}", e)),
            Err(_) => {
                // 超时：强制杀死子进程及其进程树，防止进程泄漏
                kill_process_tree(child_pid);
                Err(format!(
                    "命令执行超时（30秒），已强制终止进程 (PID: {})。请检查命令是否会无限运行。",
                    child_pid
                ))
            }
        }
    })
    .await
    .map_err(|e| format!("任务执行异常: {}", e))?
}

// ─── 搜索命令 ──────────────────────────────────────────────────

#[tauri::command]
pub async fn agent_glob_search(pattern: String, work_dir: Option<String>) -> Result<Vec<GlobResult>, String> {
    tokio::task::spawn_blocking(move || {
        let base = work_dir.unwrap_or_else(|| ".".to_string());

        if is_dangerous_search_path(&base) {
            return Err(format!("安全限制：禁止在系统根目录或危险路径下搜索。当前路径: {}", base));
        }
        let base_path = std::path::Path::new(&base);

        let full_pattern = if pattern.starts_with('/') || pattern.contains(':') {
            pattern.clone()
        } else {
            format!("{}/{}", base, pattern)
        };

        let mut results: Vec<GlobResult> = Vec::new();
        let max_results = 200;

        for entry in glob::glob(&full_pattern).map_err(|e| format!("无效的模式: {}", e))? {
            if results.len() >= max_results {
                break;
            }
            match entry {
                Ok(path) => {
                    let meta = path.metadata().ok();
                    let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
                    let size = meta.as_ref().map(|m| m.len());

                    let path_str = path.to_string_lossy().to_string();
                    let rel_path = if let Ok(rel) = path.strip_prefix(base_path) {
                        rel.to_string_lossy().to_string()
                    } else {
                        path_str
                    };

                    results.push(GlobResult {
                        path: rel_path,
                        r#type: if is_dir { "directory" } else { "file" }.to_string(),
                        size,
                    });
                }
                Err(e) => {
                    eprintln!("Glob 警告: {}", e);
                }
            }
        }

        results.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(results)
    })
    .await
    .map_err(|e| format!("任务执行异常: {}", e))?
}

#[tauri::command]
pub async fn agent_ripgrep_search(
    pattern: String,
    work_dir: String,
    include: Option<String>,
    case_sensitive: Option<bool>,
    context_lines: Option<usize>,
    max_results: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    tokio::task::spawn_blocking(move || {
        if is_dangerous_search_path(&work_dir) {
            return Err(format!("安全限制：禁止在系统根目录或危险路径下搜索。当前路径: {}", work_dir));
        }
    use grep_matcher::Matcher;
    use grep_regex::RegexMatcherBuilder;
    use grep_searcher::sinks::UTF8;
    use grep_searcher::SearcherBuilder;
    
    let ctx = context_lines.unwrap_or(2);
    let max = max_results.unwrap_or(50);
    let case = case_sensitive.unwrap_or(true);
    
    let mut matcher_builder = RegexMatcherBuilder::new();
    if !case {
        matcher_builder.case_insensitive(true);
    }
    let matcher = matcher_builder.build(&pattern)
        .map_err(|e| format!("无效的正则表达式: {}", e))?;
    
    // 单线程环境，直接用 Vec 即可，无需 Arc<Mutex<>>（原实现 Arc 引用计数 > 1 导致 panic）
    let mut search_results: Vec<SearchResult> = Vec::new();
    
    let mut searcher = SearcherBuilder::new()
        .line_number(true)
        .before_context(ctx)
        .after_context(ctx)
        .build();
    
    // 收集要搜索的文件
    let mut files_to_search: Vec<PathBuf> = Vec::new();
    let work_path = std::path::Path::new(&work_dir);
    
    if let Some(inc_pattern) = include {
        let glob_pattern = format!("{}/{}", work_dir, inc_pattern);
        for entry in glob::glob(&glob_pattern).map_err(|e| format!("无效的 include 模式: {}", e))? {
            if let Ok(path) = entry {
                if path.is_file() {
                    files_to_search.push(path);
                }
            }
        }
    } else {
        fn collect_files(dir: &std::path::Path, files: &mut Vec<PathBuf>) {
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let name = entry.file_name().to_string_lossy().to_string();
                    
                    if name.starts_with('.') || name == "node_modules" || name == "target" || name == "dist" {
                        continue;
                    }
                    
                    if path.is_dir() {
                        collect_files(&path, files);
                    } else if path.is_file() {
                        if let Ok(meta) = path.metadata() {
                            if meta.len() < 10 * 1024 * 1024 {
                                files.push(path);
                            }
                        }
                    }
                }
            }
        }
        collect_files(work_path, &mut files_to_search);
    }
    
    let mut total_count = 0usize;
    for file_path in &files_to_search {
        if total_count >= max {
            break;
        }
        
        let rel_path = file_path.strip_prefix(work_path)
            .unwrap_or(file_path)
            .to_string_lossy()
            .to_string();
        
        let mut context_before: Vec<String> = Vec::new();
        let mut last_match_line: usize = 0;
        
        let result = searcher.search_path(
            &matcher,
            file_path,
            UTF8(|line_num, line| {
                let line_str = line.to_string();
                
                let is_match = matcher.find(line.as_bytes())
                    .map(|m| m.is_some())
                    .unwrap_or(false);
                
                if is_match {
                    let sr = SearchResult {
                        path: rel_path.clone(),
                        line_number: line_num as usize,
                        line_content: line_str,
                        context_before: context_before.clone(),
                        context_after: Vec::new(),
                    };
                    search_results.push(sr);
                    last_match_line = line_num as usize;
                    context_before.clear();
                    total_count += 1;
                } else {
                    if line_num as usize > last_match_line && last_match_line > 0 {
                        if let Some(last_sr) = search_results.last_mut() {
                            if last_sr.path == rel_path {
                                last_sr.context_after.push(line_str.clone());
                            }
                        }
                    } else {
                        context_before.push(line_str);
                        if context_before.len() > ctx {
                            context_before.remove(0);
                        }
                    }
                }
                
                Ok(total_count < max)
            }),
        );
        
        if let Err(e) = result {
            eprintln!("搜索文件失败 {}: {}", rel_path, e);
        }
    }
    
    Ok(search_results)
    })
    .await
    .map_err(|e| format!("任务执行异常: {}", e))?
}

// ─── 文件增删移命令 ────────────────────────────────────────────

#[tauri::command]
pub async fn agent_delete_path(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let p = std::path::Path::new(&path);
        if !p.exists() {
            return Err(format!("路径不存在: {}", path));
        }

        if p.is_dir() {
            fs::remove_dir_all(&path).map_err(|e| format!("删除目录失败 '{}': {}", path, e))?;
            Ok(format!("✅ 已删除目录: {}", path))
        } else {
            fs::remove_file(&path).map_err(|e| format!("删除文件失败 '{}': {}", path, e))?;
            Ok(format!("✅ 已删除文件: {}", path))
        }
    })
    .await
    .map_err(|e| format!("任务执行异常: {}", e))?
}

#[tauri::command]
pub async fn agent_copy_path(source: String, destination: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let src = std::path::Path::new(&source);
        let dst = std::path::Path::new(&destination);

        if !src.exists() {
            return Err(format!("源路径不存在: {}", source));
        }

        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目标目录失败: {}", e))?;
        }

        if src.is_dir() {
            fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<u64, String> {
                let mut count = 0u64;
                fs::create_dir_all(dst).map_err(|e| format!("创建目录失败: {}", e))?;

                for entry in fs::read_dir(src).map_err(|e| format!("读取目录失败: {}", e))? {
                    let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
                    let src_path = entry.path();
                    let dst_path = dst.join(entry.file_name());

                    if src_path.is_dir() {
                        count += copy_dir_recursive(&src_path, &dst_path)?;
                    } else {
                        fs::copy(&src_path, &dst_path)
                            .map_err(|e| format!("复制文件失败 '{}': {}", src_path.display(), e))?;
                        count += 1;
                    }
                }
                Ok(count)
            }

            let count = copy_dir_recursive(src, dst)?;
            Ok(format!("✅ 已复制目录 '{}' 到 '{}' ({} 个文件)", source, destination, count))
        } else {
            fs::copy(&source, &destination).map_err(|e| format!("复制文件失败: {}", e))?;
            Ok(format!("✅ 已复制文件 '{}' 到 '{}'", source, destination))
        }
    })
    .await
    .map_err(|e| format!("任务执行异常: {}", e))?
}

#[tauri::command]
pub async fn agent_move_path(source: String, destination: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let src = std::path::Path::new(&source);

        if !src.exists() {
            return Err(format!("源路径不存在: {}", source));
        }

        if let Some(parent) = std::path::Path::new(&destination).parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目标目录失败: {}", e))?;
        }

        fs::rename(&source, &destination).map_err(|e| format!("移动/重命名失败: {}", e))?;

        let action = if src.is_dir() { "目录" } else { "文件" };
        Ok(format!("✅ 已移动{} '{}' 到 '{}'", action, source, destination))
    })
    .await
    .map_err(|e| format!("任务执行异常: {}", e))?
}

// ─── 环境变量 ──────────────────────────────────────────────────

#[tauri::command]
pub fn get_env_var(name: String) -> Result<String, String> {
    std::env::var(&name).map_err(|_| format!("环境变量 {} 未找到", name))
}

// ─── 连接器工具命令 ────────────────────────────────────────────

// ── SSH ──

#[tauri::command]
pub async fn agent_ssh_exec(
    host: String,
    port: u16,
    username: String,
    auth_type: String,
    password: String,
    private_key_path: String,
    passphrase: String,
    command: String,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        use ssh2::Session;
        use std::io::Read;
        use std::net::TcpStream;

        let addr = format!("{}:{}", host, port);
        let tcp = TcpStream::connect_timeout(
            &addr.parse().map_err(|e| format!("地址解析失败: {}", e))?,
            std::time::Duration::from_secs(10),
        ).map_err(|e| format!("SSH 连接失败 ({}): {}", addr, e))?;

        let mut sess = Session::new()
            .map_err(|e| format!("创建 SSH 会话失败: {}", e))?;

        // 设置超时（30 秒，覆盖认证和命令执行）
        sess.set_timeout(30_000);

        sess.set_tcp_stream(tcp);
        sess.handshake()
            .map_err(|e| format!("SSH 握手失败: {}", e))?;

        // 认证
        if auth_type == "private_key" {
            let key_path = std::path::Path::new(&private_key_path);
            let pass = if passphrase.is_empty() { None } else { Some(passphrase.as_str()) };
            sess.userauth_pubkey_file(&username, None, key_path, pass)
                .map_err(|e| format!("SSH 公钥认证失败: {}", e))?;
        } else {
            sess.userauth_password(&username, &password)
                .map_err(|e| format!("SSH 密码认证失败: {}", e))?;
        }

        if !sess.authenticated() {
            return Err("SSH 认证未通过".to_string());
        }

        let mut channel = sess.channel_session()
            .map_err(|e| format!("打开 SSH 通道失败: {}", e))?;
        channel.exec(&command)
            .map_err(|e| format!("执行命令失败: {}", e))?;

        let mut stdout = String::new();
        channel.read_to_string(&mut stdout).ok();

        let mut stderr = String::new();
        channel.stderr().read_to_string(&mut stderr).ok();

        channel.wait_close().ok();
        let exit_code = channel.exit_status().unwrap_or(-1);

        let status = if exit_code == 0 { "✅ 成功" } else { "❌ 失败" };
        let mut result = format!("[{}] 退出码: {}\n", status, exit_code);
        if !stdout.is_empty() {
            result.push_str(&format!("stdout:\n{}", stdout));
        }
        if !stderr.is_empty() {
            result.push_str(&format!("stderr:\n{}", stderr));
        }
        if stdout.is_empty() && stderr.is_empty() {
            result.push_str("(无输出)");
        }
        Ok(result)
    })
    .await
    .map_err(|e| format!("SSH 任务执行异常: {}", e))?
}

#[tauri::command]
pub async fn agent_ssh_read_file(
    host: String,
    port: u16,
    username: String,
    auth_type: String,
    password: String,
    private_key_path: String,
    passphrase: String,
    path: String,
    lines: i32,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        use ssh2::Session;
        use std::io::Read;
        use std::net::TcpStream;

        let addr = format!("{}:{}", host, port);
        let tcp = TcpStream::connect_timeout(
            &addr.parse().map_err(|e| format!("地址解析失败: {}", e))?,
            std::time::Duration::from_secs(10),
        ).map_err(|e| format!("SSH 连接失败 ({}): {}", addr, e))?;

        let mut sess = Session::new()
            .map_err(|e| format!("创建 SSH 会话失败: {}", e))?;

        // 设置超时（30 秒，覆盖认证和文件读取）
        sess.set_timeout(30_000);

        sess.set_tcp_stream(tcp);
        sess.handshake()
            .map_err(|e| format!("SSH 握手失败: {}", e))?;

        if auth_type == "private_key" {
            let key_path = std::path::Path::new(&private_key_path);
            let pass = if passphrase.is_empty() { None } else { Some(passphrase.as_str()) };
            sess.userauth_pubkey_file(&username, None, key_path, pass)
                .map_err(|e| format!("SSH 公钥认证失败: {}", e))?;
        } else {
            sess.userauth_password(&username, &password)
                .map_err(|e| format!("SSH 密码认证失败: {}", e))?;
        }

        if !sess.authenticated() {
            return Err("SSH 认证未通过".to_string());
        }

        // 使用 SFTP 读取文件
        let sftp = sess.sftp()
            .map_err(|e| format!("SFTP 初始化失败: {}", e))?;

        let remote_path = std::path::Path::new(&path);
        let mut file = sftp.open(remote_path)
            .map_err(|e| format!("打开远程文件失败 '{}': {}", path, e))?;

        let mut content = String::new();
        file.read_to_string(&mut content)
            .map_err(|e| format!("读取远程文件失败 '{}': {}", path, e))?;

        // 按 lines 参数截取
        if lines != 0 {
            let all_lines: Vec<&str> = content.lines().collect();
            if lines > 0 {
                // 从开头取 lines 行
                let taken: Vec<&str> = all_lines.into_iter().take(lines as usize).collect();
                content = taken.join("\n");
            } else {
                // 从尾部取 |lines| 行
                let n = (-lines) as usize;
                let start = if all_lines.len() > n { all_lines.len() - n } else { 0 };
                let taken: Vec<&str> = all_lines[start..].to_vec();
                content = taken.join("\n");
            }
        }

        Ok(content)
    })
    .await
    .map_err(|e| format!("SSH 任务执行异常: {}", e))?
}

// ── MySQL ──

#[tauri::command]
pub async fn agent_mysql_query(
    host: String,
    port: u16,
    username: String,
    password: String,
    database: String,
    use_ssl: bool,
    sql: String,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        use mysql::*;
        use mysql::prelude::*;

        let mut opts_builder = OptsBuilder::new()
            .ip_or_hostname(Some(&host))
            .tcp_port(port)
            .user(Some(&username))
            .pass(Some(&password))
            .db_name(Some(&database));

        if use_ssl {
            opts_builder = opts_builder.ssl_opts(SslOpts::default());
        }

        let opts = Opts::from(opts_builder);
        let mut conn = Conn::new(opts)
            .map_err(|e| format!("MySQL 连接失败: {}", e))?;

        // 判断是否为查询语句
        let sql_upper = sql.trim().to_uppercase();
        let is_query = sql_upper.starts_with("SELECT")
            || sql_upper.starts_with("SHOW")
            || sql_upper.starts_with("DESCRIBE")
            || sql_upper.starts_with("EXPLAIN");

        if is_query {
            let result = conn.query_iter(&sql)
                .map_err(|e| format!("SQL 执行失败: {}", e))?;

            let columns: Vec<String> = result.columns().as_ref()
                .iter()
                .map(|c| c.name_str().to_string())
                .collect();

            let mut rows: Vec<Vec<String>> = Vec::new();
            for row in result {
                let row = row.map_err(|e| format!("读取行失败: {}", e))?;
                let values: Vec<String> = (0..columns.len())
                    .map(|i| {
                        row.get_opt::<String, _>(i)
                            .map(|v| v.unwrap_or_else(|_| "NULL".to_string()))
                            .unwrap_or_else(|| "NULL".to_string())
                    })
                    .collect();
                rows.push(values);
            }

            // 格式化输出
            let mut output = String::new();
            output.push_str(&format!("查询结果 ({} 行, {} 列):\n\n", rows.len(), columns.len()));

            // 列头
            output.push_str("| ");
            output.push_str(&columns.join(" | "));
            output.push_str(" |\n");
            output.push_str("| ");
            output.push_str(&columns.iter().map(|c| "-".repeat(c.len())).collect::<Vec<_>>().join(" | "));
            output.push_str(" |\n");

            // 数据行
            for row in &rows {
                output.push_str("| ");
                output.push_str(&row.join(" | "));
                output.push_str(" |\n");
            }

            Ok(output)
        } else {
            conn.query_drop(&sql)
                .map_err(|e| format!("SQL 执行失败: {}", e))?;
            let affected = conn.affected_rows();
            Ok(format!("✅ SQL 执行成功，影响 {} 行", affected))
        }
    })
    .await
    .map_err(|e| format!("MySQL 任务执行异常: {}", e))?
}

#[tauri::command]
pub async fn agent_mysql_list_tables(
    host: String,
    port: u16,
    username: String,
    password: String,
    database: String,
    use_ssl: bool,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        use mysql::*;
        use mysql::prelude::*;

        let mut opts_builder = OptsBuilder::new()
            .ip_or_hostname(Some(&host))
            .tcp_port(port)
            .user(Some(&username))
            .pass(Some(&password))
            .db_name(Some(&database));

        if use_ssl {
            opts_builder = opts_builder.ssl_opts(SslOpts::default());
        }

        let opts = Opts::from(opts_builder);
        let mut conn = Conn::new(opts)
            .map_err(|e| format!("MySQL 连接失败: {}", e))?;

        let tables: Vec<(String, u64)> = conn.query(
            "SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name"
        ).map_err(|e| format!("查询表列表失败: {}", e))?;

        let mut output = format!("数据库 [{}] 中的表 ({} 个):\n\n", database, tables.len());
        output.push_str("| 表名 | 行数估计 |\n| ---- | -------- |\n");
        for (name, rows) in &tables {
            output.push_str(&format!("| {} | {} |\n", name, rows));
        }
        Ok(output)
    })
    .await
    .map_err(|e| format!("MySQL 任务执行异常: {}", e))?
}

// ── PostgreSQL ──

#[tauri::command]
pub async fn agent_pg_query(
    host: String,
    port: u16,
    username: String,
    password: String,
    database: String,
    use_ssl: bool,
    sql: String,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        use postgres::{Client, NoTls};

        let ssl_mode = if use_ssl { "require" } else { "disable" };
        let conn_str = format!(
            "host={} port={} user={} password={} dbname={} sslmode={}",
            host, port, username, password, database, ssl_mode
        );

        let mut client = Client::connect(&conn_str, NoTls)
            .map_err(|e| format!("PostgreSQL 连接失败: {}", e))?;

        let sql_upper = sql.trim().to_uppercase();
        let is_query = sql_upper.starts_with("SELECT")
            || sql_upper.starts_with("TABLE")
            || sql_upper.starts_with("VALUES")
            || sql_upper.starts_with("WITH");

        if is_query {
            let rows = client.query(&sql, &[])
                .map_err(|e| format!("SQL 执行失败: {}", e))?;

            if rows.is_empty() {
                return Ok("查询结果: 0 行".to_string());
            }

            let columns: Vec<String> = rows[0].columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect();

            let mut output = format!("查询结果 ({} 行, {} 列):\n\n", rows.len(), columns.len());
            output.push_str("| ");
            output.push_str(&columns.join(" | "));
            output.push_str(" |\n");
            output.push_str("| ");
            output.push_str(&columns.iter().map(|c| "-".repeat(c.len())).collect::<Vec<_>>().join(" | "));
            output.push_str(" |\n");

            for row in &rows {
                output.push_str("| ");
                let values: Vec<String> = (0..columns.len())
                    .map(|i| {
                        // 尝试多种类型
                        if let Ok(v) = row.try_get::<_, Option<String>>(i) {
                            v.unwrap_or_else(|| "NULL".to_string())
                        } else if let Ok(v) = row.try_get::<_, Option<i64>>(i) {
                            v.map(|n| n.to_string()).unwrap_or_else(|| "NULL".to_string())
                        } else if let Ok(v) = row.try_get::<_, Option<i32>>(i) {
                            v.map(|n| n.to_string()).unwrap_or_else(|| "NULL".to_string())
                        } else if let Ok(v) = row.try_get::<_, Option<f64>>(i) {
                            v.map(|n| n.to_string()).unwrap_or_else(|| "NULL".to_string())
                        } else if let Ok(v) = row.try_get::<_, Option<bool>>(i) {
                            v.map(|b| b.to_string()).unwrap_or_else(|| "NULL".to_string())
                        } else {
                            "?".to_string()
                        }
                    })
                    .collect();
                output.push_str(&values.join(" | "));
                output.push_str(" |\n");
            }

            Ok(output)
        } else {
            let affected = client.execute(&sql, &[])
                .map_err(|e| format!("SQL 执行失败: {}", e))?;
            Ok(format!("✅ SQL 执行成功，影响 {} 行", affected))
        }
    })
    .await
    .map_err(|e| format!("PostgreSQL 任务执行异常: {}", e))?
}

#[tauri::command]
pub async fn agent_pg_list_tables(
    host: String,
    port: u16,
    username: String,
    password: String,
    database: String,
    use_ssl: bool,
    schema: String,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        use postgres::{Client, NoTls};

        let ssl_mode = if use_ssl { "require" } else { "disable" };
        let conn_str = format!(
            "host={} port={} user={} password={} dbname={} sslmode={}",
            host, port, username, password, database, ssl_mode
        );

        let mut client = Client::connect(&conn_str, NoTls)
            .map_err(|e| format!("PostgreSQL 连接失败: {}", e))?;

        let query = format!(
            "SELECT tablename, schemaname FROM pg_tables WHERE schemaname = '{}' ORDER BY tablename",
            schema
        );

        let rows = client.query(&query, &[])
            .map_err(|e| format!("查询表列表失败: {}", e))?;

        let mut output = format!("PostgreSQL [{}] schema [{}] 中的表 ({} 个):\n\n", database, schema, rows.len());
        output.push_str("| 表名 | Schema |\n| ---- | ------ |\n");
        for row in &rows {
            let tablename: String = row.get(0);
            let schemaname: String = row.get(1);
            output.push_str(&format!("| {} | {} |\n", tablename, schemaname));
        }
        Ok(output)
    })
    .await
    .map_err(|e| format!("PostgreSQL 任务执行异常: {}", e))?
}

// ─── 主目录工具 ─────────────────────────────────────────────────────

/// 获取用户主目录路径
#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    let home = crate::common::dirs_next_home();
    Ok(home.to_string_lossy().to_string())
}
