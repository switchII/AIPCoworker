//! 公共工具模块 — 跨模块共享的路径解析和文件操作辅助函数。

use std::fs;
use std::io::Read;
use std::net::{TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

/// 获取用户 home 目录（跨平台）
pub fn dirs_next_home() -> PathBuf {
    if cfg!(target_os = "windows") {
        std::env::var("USERPROFILE")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."))
    } else {
        std::env::var("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."))
    }
}

/// 获取 ~/.aipcowork 基础目录
pub fn get_memory_base() -> PathBuf {
    dirs_next_home().join(".aipcowork")
}

/// 获取 MCP 配置文件路径
pub fn get_mcp_config_path() -> PathBuf {
    get_memory_base().join("mcp").join("servers.json")
}

/// 获取连接器配置文件路径
pub fn get_connectors_config_path() -> PathBuf {
    get_memory_base().join("connectors").join("connectors.json")
}

pub fn get_suites_config_path() -> PathBuf {
    get_memory_base().join("suites").join("suites.json")
}

/// 获取设置配置文件路径 (~/.aipcowork/settings/settings.json)
pub fn get_settings_config_path() -> PathBuf {
    get_memory_base().join("settings").join("settings.json")
}

/// 获取默认工作空间路径 ~/AipWorkspace（不存在则自动创建）
pub fn get_default_workspace() -> PathBuf {
    dirs_next_home().join("AipWorkspace")
}

/// 返回系统临时目录下的文件路径（用于浏览器预览等场景）
#[tauri::command]
pub fn get_temp_file_path(name: &str) -> Result<String, String> {
    let tmp_dir = std::env::temp_dir().join("aipcowork");
    fs::create_dir_all(&tmp_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;
    // 加时间戳避免文件名冲突
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let file_name = format!("{}_{}", timestamp, name);
    let path = tmp_dir.join(file_name);
    Ok(path.to_string_lossy().to_string())
}

/// 返回默认工作空间路径字符串，并确保目录存在
#[tauri::command]
pub fn get_default_workspace_path() -> Result<String, String> {
    let path = get_default_workspace();
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| format!("创建默认工作空间失败: {}", e))?;
    }
    Ok(path.to_string_lossy().to_string())
}

/// 使用系统原生文件管理器打开目录（openPath 的备用方案）
#[tauri::command]
pub fn shell_open(path: &str) -> Result<(), String> {
    let path_buf = PathBuf::from(path);
    if !path_buf.exists() {
        return Err(format!("路径不存在: {}", path));
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| format!("打开目录失败: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("打开目录失败: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("打开目录失败: {}", e))?;
    }

    Ok(())
}

/// 递归复制目录
pub fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("创建目录失败: {}", e))?;
    let entries = fs::read_dir(src).map_err(|e| format!("读取源目录失败: {}", e))?;
    for entry in entries.flatten() {
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("复制文件失败 {} -> {}: {}", src_path.display(), dst_path.display(), e))?;
        }
    }
    Ok(())
}

// ─── 系统信息 ────────────────────────────────────────────────────

/// 系统信息响应结构
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SystemInfo {
    /// 操作系统名称（如 "macOS", "Windows", "Linux"）
    pub os: String,
    /// 操作系统完整版本（如 "macOS 14.0 Sonoma"）
    pub os_version: String,
    /// 内核版本
    pub kernel_version: String,
    /// 主机名
    pub hostname: String,
    /// CPU 型号
    pub cpu_brand: String,
    /// CPU 核心数
    pub cpu_cores: usize,
    /// 总内存（MB）
    pub total_memory_mb: u64,
    /// 可用内存（MB）
    pub available_memory_mb: u64,
    /// 当前用户名
    pub username: String,
    /// 系统架构（如 "aarch64", "x86_64"）
    pub arch: String,
    /// 当前时间（本地时区）
    pub current_time: String,
}

/// 收集系统信息
#[tauri::command]
pub fn get_system_info() -> Result<SystemInfo, String> {
    use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};

    // 刷新需要的信息（避免不必要的刷新）
    let cpu_refresh = CpuRefreshKind::new().with_cpu_usage();
    let mem_refresh = MemoryRefreshKind::new().with_ram();
    let refresh = RefreshKind::new()
        .with_cpu(cpu_refresh)
        .with_memory(mem_refresh);

    let mut sys = System::new_with_specifics(refresh);
    // 等待一小段时间让 CPU 使用率计算更准确
    std::thread::sleep(std::time::Duration::from_millis(100));
    sys.refresh_cpu_usage();

    let os_name = System::name().unwrap_or_else(|| "Unknown".to_string());
    let os_version = System::long_os_version().unwrap_or_else(|| "Unknown".to_string());
    let kernel_version = System::kernel_version().unwrap_or_else(|| "Unknown".to_string());
    let hostname = System::host_name().unwrap_or_else(|| "Unknown".to_string());
    let arch = System::cpu_arch().unwrap_or_else(|| std::env::consts::ARCH.to_string());

    let cpus = sys.cpus();
    let cpu_brand = if !cpus.is_empty() {
        cpus[0].brand().to_string()
    } else {
        "Unknown".to_string()
    };

    let total_memory_mb = sys.total_memory() / 1024 / 1024;
    let available_memory_mb = sys.available_memory() / 1024 / 1024;

    let username = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "Unknown".to_string());

    let current_time = chrono::Local::now().format("%Y-%m-%d %H:%M:%S %Z").to_string();

    Ok(SystemInfo {
        os: os_name,
        os_version,
        kernel_version,
        hostname,
        cpu_brand,
        cpu_cores: cpus.len(),
        total_memory_mb,
        available_memory_mb,
        username,
        arch,
        current_time,
    })
}

// ─── 连接器测试 ────────────────────────────────────────────

/// 连接器测试结果
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConnectorTestResult {
    pub success: bool,
    pub message: String,
    pub latency_ms: u64,
    pub details: Option<String>,
}

/// 测试连接器可达性（TCP 连接 + 协议握手探测 + SSH 认证测试）
#[tauri::command]
pub async fn test_connector(
    conn_type: String,
    host: String,
    port: u16,
    // SSH 认证参数（可选）
    username: Option<String>,
    password: Option<String>,
    auth_type: Option<String>,
    private_key_path: Option<String>,
    passphrase: Option<String>,
) -> Result<ConnectorTestResult, String> {
    let addr_str = format!("{}:{}", host, port);
    let addr = addr_str
        .to_socket_addrs()
        .map_err(|e| format!("域名解析失败: {}", e))?
        .next()
        .ok_or_else(|| "无法解析地址".to_string())?;

    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(10);

    let stream = TcpStream::connect_timeout(&addr, timeout)
        .map_err(|e| format!("连接失败: {}", e))?;

    let latency_ms = start.elapsed().as_millis() as u64;
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .ok();

    // SSH 类型：执行完整的握手 + 认证测试
    if conn_type.as_str() == "ssh" {
        return test_ssh_auth(stream, latency_ms, username, password, auth_type, private_key_path, passphrase);
    }

    // 非 SSH 类型：协议探测
    let mut stream_clone = stream.try_clone().map_err(|e| format!("克隆流失败: {}", e))?;
    let mut buf = [0u8; 256];
    let details = match conn_type.as_str() {
        "mysql" => {
            // MySQL 服务端会发送 handshake 包，第一个字节是包长度，第5个字节是协议版本
            match stream_clone.read(&mut buf) {
                Ok(n) if n > 4 => {
                    let protocol_version = buf[4];
                    // 提取服务端版本字符串（从第6字节开始，到 null 终止）
                    let version_end = buf[5..n].iter().position(|&b| b == 0).unwrap_or(n - 5);
                    let version = String::from_utf8_lossy(&buf[5..5 + version_end]).to_string();
                    if protocol_version == 10 || protocol_version == 9 {
                        Some(format!("MySQL 协议 v{}, 版本: {}", protocol_version, version))
                    } else {
                        Some(format!("已连接，协议字节: {}", protocol_version))
                    }
                }
                _ => Some("已建立 TCP 连接".to_string()),
            }
        }
        "postgresql" => {
            // PostgreSQL 需要客户端发送 startup message，服务端才会响应
            // 发送一个简单的 SSLRequest 消息（8字节）来探测
            let ssl_request: [u8; 8] = [0, 0, 0, 8, 4, 210, 22, 47]; // SSLRequest: length=8, code=80877103
            use std::io::Write;
            if let Ok(mut w) = stream.try_clone() {
                w.write_all(&ssl_request).ok();
                w.flush().ok();
            }
            match stream_clone.read(&mut buf) {
                Ok(n) if n > 0 => {
                    // 'S' = SSL supported, 'N' = SSL not supported
                    let response = buf[0] as char;
                    Some(format!("PostgreSQL 响应: {} (SSL {})", response, if response == 'S' { "支持" } else { "不支持" }))
                }
                _ => Some("已建立 TCP 连接".to_string()),
            }
        }
        _ => Some("已建立 TCP 连接".to_string()),
    };

    Ok(ConnectorTestResult {
        success: true,
        message: format!("连接成功 ({} ms)", latency_ms),
        latency_ms,
        details,
    })
}

/// SSH 认证测试（握手 + 实际认证）
fn test_ssh_auth(
    tcp: std::net::TcpStream,
    latency_ms: u64,
    username: Option<String>,
    password: Option<String>,
    auth_type: Option<String>,
    private_key_path: Option<String>,
    passphrase: Option<String>,
) -> Result<ConnectorTestResult, String> {
    use ssh2::Session;

    let mut sess = Session::new()
        .map_err(|e| format!("创建 SSH 会话失败: {}", e))?;

    // 设置超时（10 秒）
    sess.set_timeout(10_000);

    sess.set_tcp_stream(tcp);
    sess.handshake()
        .map_err(|e| format!("SSH 握手失败: {}", e))?;

    // 读取 SSH banner
    let banner = sess.banner().unwrap_or("unknown").to_string();

    let user = username.unwrap_or_default();
    if user.is_empty() {
        return Ok(ConnectorTestResult {
            success: true,
            message: format!("SSH 握手成功 ({} ms)", latency_ms),
            latency_ms,
            details: Some(format!("SSH 服务: {}（未提供用户名，跳过认证测试）", banner)),
        });
    }

    // 执行认证
    let auth = auth_type.unwrap_or_else(|| "password".to_string());
    if auth == "private_key" {
        let key_path_str = private_key_path.unwrap_or_default();
        if key_path_str.is_empty() {
            return Err("SSH 认证失败：选择了私钥认证但未提供私钥路径".to_string());
        }
        let key_path = std::path::Path::new(&key_path_str);
        let pass = passphrase.as_deref().filter(|s| !s.is_empty());
        sess.userauth_pubkey_file(&user, None, key_path, pass)
            .map_err(|e| format!("SSH 公钥认证失败: {}", e))?;
    } else {
        let pwd = password.unwrap_or_default();
        sess.userauth_password(&user, &pwd)
            .map_err(|e| format!("SSH 密码认证失败: {}", e))?;
    }

    if !sess.authenticated() {
        return Err("SSH 认证未通过：服务器拒绝了认证".to_string());
    }

    // 认证成功后尝试执行一个简单命令验证通道可用
    let mut channel = sess.channel_session()
        .map_err(|e| format!("打开 SSH 通道失败: {}", e))?;
    channel.exec("echo ok")
        .map_err(|e| format!("执行测试命令失败: {}", e))?;

    let mut output = String::new();
    channel.read_to_string(&mut output).ok();
    channel.wait_close().ok();

    let auth_method = if auth == "private_key" { "公钥" } else { "密码" };
    Ok(ConnectorTestResult {
        success: true,
        message: format!("SSH 认证成功 ({} ms)", latency_ms),
        latency_ms,
        details: Some(format!("SSH 服务: {}\n认证方式: {}\n用户: {}", banner, auth_method, user)),
    })
}
