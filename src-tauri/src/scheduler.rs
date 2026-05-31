//! 定时任务调度模块 — 后台调度器、任务执行和 Tauri 命令。

use std::collections::HashMap;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Windows CREATE_NO_WINDOW 标志，防止弹出控制台窗口
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

use std::str::FromStr;
use std::sync::Mutex;
use std::time::Duration;

use chrono::{Local, Utc};
use cron::Schedule;
use tauri::Manager;

// ─── 数据结构 ──────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ScheduledTask {
    pub id: String,
    pub name: String,
    pub description: String,
    pub schedule_type: String,
    pub expression: String,
    pub command: String,
    pub message: String,
    pub enabled: bool,
    pub last_run: Option<String>,
    pub next_run: Option<String>,
}

pub struct SchedulerState {
    pub tasks: Mutex<HashMap<String, ScheduledTask>>,
    pub log: Mutex<Vec<String>>,
}

// ─── 辅助函数 ──────────────────────────────────────────────────

fn compute_next_run(expression: &str) -> Option<String> {
    let schedule = Schedule::from_str(expression).ok()?;
    schedule.upcoming(Utc).next().map(|dt| {
        dt.with_timezone(&Local).format("%Y-%m-%d %H:%M:%S").to_string()
    })
}

fn execute_command(cmd: &str) -> (bool, String) {
    let output = if cfg!(target_os = "windows") {
        // 先执行 chcp 65001 切换到 UTF-8 代码页，解决中文输出乱码问题
        let cmd_with_utf8 = format!("chcp 65001 >nul && {}", cmd);
        let mut c = Command::new("cmd");
        c.args(["/C", &cmd_with_utf8]);
        #[cfg(target_os = "windows")]
        c.creation_flags(CREATE_NO_WINDOW);
        c.output()
    } else {
        Command::new("sh").args(["-c", cmd]).output()
    };

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            let result = if stdout.is_empty() && stderr.is_empty() {
                "(no output)".to_string()
            } else if stderr.is_empty() {
                stdout.trim().to_string()
            } else if stdout.is_empty() {
                stderr.trim().to_string()
            } else {
                format!("stdout:\n{}\nstderr:\n{}", stdout.trim(), stderr.trim())
            };
            (out.status.success(), result)
        }
        Err(e) => (false, format!("执行失败: {}", e)),
    }
}

fn run_due_tasks(state: &SchedulerState) {
    let now = Utc::now();
    let mut tasks = state.tasks.lock().unwrap();
    let mut logs = state.log.lock().unwrap();

    for (_id, task) in tasks.iter_mut() {
        if !task.enabled {
            continue;
        }

        let should_run = match task.schedule_type.as_str() {
            "once" => task.last_run.is_none(),
            "cron" => {
                if task.next_run.is_none() {
                    task.next_run = compute_next_run(&task.expression);
                }
                if let Some(ref next) = task.next_run {
                    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(next, "%Y-%m-%d %H:%M:%S") {
                        dt.and_local_timezone(Local).single().map(|lt| lt.with_timezone(&Utc)).unwrap_or(dt.and_utc()) <= now
                    } else {
                        false
                    }
                } else {
                    false
                }
            }
            "interval" => {
                if let Some(ref last) = task.last_run {
                    if let Ok(last_dt) = chrono::NaiveDateTime::parse_from_str(last, "%Y-%m-%d %H:%M:%S") {
                        if let Some(interval) = task.expression.parse::<i64>().ok() {
                            let last_utc = last_dt.and_local_timezone(Local).single()
                                .map(|lt| lt.with_timezone(&Utc))
                                .unwrap_or(last_dt.and_utc());
                            let elapsed = (now - last_utc).num_seconds();
                            elapsed >= interval
                        } else {
                            false
                        }
                    } else {
                        true
                    }
                } else {
                    true
                }
            }
            _ => false,
        };

        if should_run {
            let (success, output) = execute_command(&task.command);
            let now_str = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            task.last_run = Some(now_str.clone());

            if task.schedule_type == "cron" {
                task.next_run = compute_next_run(&task.expression);
            } else if task.schedule_type == "once" {
                task.next_run = None;
            } else if task.schedule_type == "interval" {
                if let Ok(interval) = task.expression.parse::<i64>() {
                    let next = Utc::now() + chrono::Duration::seconds(interval);
                    task.next_run = Some(next.with_timezone(&Local).format("%Y-%m-%d %H:%M:%S").to_string());
                }
            }

            let log_entry = format!(
                "[{}] 任务 '{}' {} | 输出: {}",
                now_str,
                task.name,
                if success { "执行成功" } else { "执行失败" },
                output
            );
            logs.push(log_entry.clone());
            if logs.len() > 200 {
                logs.remove(0);
            }
            println!("{}", log_entry);
        }
    }
}

pub fn start_background_scheduler(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_secs(30));
            let state = app.state::<SchedulerState>();
            run_due_tasks(&state);
        }
    });
}

// ─── Tauri 命令 ────────────────────────────────────────────────

#[tauri::command]
pub fn sync_tasks(state: tauri::State<SchedulerState>, tasks: Vec<ScheduledTask>) -> Result<Vec<ScheduledTask>, String> {
    let mut map = state.tasks.lock().unwrap();
    map.clear();
    for mut task in tasks {
        if task.schedule_type == "cron" && task.next_run.is_none() {
            task.next_run = compute_next_run(&task.expression);
        }
        map.insert(task.id.clone(), task);
    }
    let result: Vec<ScheduledTask> = map.values().cloned().collect();
    Ok(result)
}

#[tauri::command]
pub fn trigger_task(state: tauri::State<SchedulerState>, id: String) -> Result<String, String> {
    let mut tasks = state.tasks.lock().unwrap();
    let mut logs = state.log.lock().unwrap();

    if let Some(task) = tasks.get_mut(&id) {
        let (success, output) = execute_command(&task.command);
        let now_str = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        task.last_run = Some(now_str.clone());

        if task.schedule_type == "cron" {
            task.next_run = compute_next_run(&task.expression);
        } else if task.schedule_type == "once" {
            task.next_run = None;
        }

        let log_entry = format!(
            "[{}] 任务 '{}' (手动触发) {} | 输出: {}",
            now_str,
            task.name,
            if success { "执行成功" } else { "执行失败" },
            output
        );
        logs.push(log_entry.clone());
        println!("{}", log_entry);
        Ok(output)
    } else {
        Err(format!("未找到任务: {}", id))
    }
}

#[tauri::command]
pub fn get_scheduler_logs(state: tauri::State<SchedulerState>) -> Result<Vec<String>, String> {
    let logs = state.log.lock().unwrap();
    Ok(logs.clone())
}
