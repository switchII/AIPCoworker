//! 任务持久化模块 — 任务数据的磁盘存储与加载。

use std::fs;
use std::path::PathBuf;

use crate::common::get_memory_base;

// ─── 辅助函数 ──────────────────────────────────────────────────

fn get_tasks_dir() -> PathBuf {
    get_memory_base().join("tasks")
}

// ─── Tauri 命令 ────────────────────────────────────────────────

#[tauri::command]
pub fn save_task(task_id: String, task_json: String) -> Result<(), String> {
    let tasks_dir = get_tasks_dir();
    let details_dir = tasks_dir.join("details");
    fs::create_dir_all(&details_dir).map_err(|e| format!("创建任务目录失败: {}", e))?;
    
    // 读取并更新索引
    let index_path = tasks_dir.join("index.json");
    let mut index: Vec<serde_json::Value> = if index_path.exists() {
        let content = fs::read_to_string(&index_path).map_err(|e| format!("读取索引失败: {}", e))?;
        serde_json::from_str(&content).unwrap_or_else(|_| vec![])
    } else {
        vec![]
    };
    
    // 解析完整任务数据
    let task_data: serde_json::Value = serde_json::from_str(&task_json)
        .map_err(|e| format!("解析任务数据失败: {}", e))?;
    
    // 提取摘要信息
    let summary = serde_json::json!({
        "id": task_data["id"],
        "title": task_data["title"],
        "status": task_data["status"],
        "startTime": task_data["startTime"],
        "dir": task_data["dir"],
        "input": task_data["input"],
        "elapsedSeconds": task_data["elapsedSeconds"],
        "report": task_data["report"]
    });
    
    // 更新或添加索引
    if let Some(pos) = index.iter().position(|t| t["id"] == task_id) {
        index[pos] = summary;
    } else {
        index.push(summary);
    }
    
    // 保存索引
    let index_json = serde_json::to_string_pretty(&index)
        .map_err(|e| format!("序列化索引失败: {}", e))?;
    fs::write(&index_path, &index_json).map_err(|e| format!("写入索引失败: {}", e))?;
    
    // 保存完整任务详情
    let detail_path = details_dir.join(format!("{}.json", task_id));
    fs::write(&detail_path, &task_json).map_err(|e| format!("写入任务详情失败: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub fn load_tasks(limit: Option<usize>) -> Result<String, String> {
    let tasks_dir = get_tasks_dir();
    let index_path = tasks_dir.join("index.json");
    let details_dir = tasks_dir.join("details");
    
    if !index_path.exists() {
        return Ok("[]".to_string());
    }
    
    // 读取索引
    let index_content = fs::read_to_string(&index_path)
        .map_err(|e| format!("读取任务索引失败: {}", e))?;
    let mut index: Vec<serde_json::Value> = serde_json::from_str(&index_content)
        .unwrap_or_else(|_| vec![]);
    
    // 按 startTime 降序排序
    index.sort_by(|a, b| {
        let a_time = a["startTime"].as_i64().unwrap_or(0);
        let b_time = b["startTime"].as_i64().unwrap_or(0);
        b_time.cmp(&a_time)
    });
    
    // 截取最新 N 条
    let limit = limit.unwrap_or(20);
    index.truncate(limit);
    
    // 加载完整详情
    let mut tasks: Vec<serde_json::Value> = vec![];
    for summary in index {
        if let Some(id) = summary["id"].as_str() {
            let detail_path = details_dir.join(format!("{}.json", id));
            if detail_path.exists() {
                if let Ok(content) = fs::read_to_string(&detail_path) {
                    if let Ok(task) = serde_json::from_str::<serde_json::Value>(&content) {
                        tasks.push(task);
                    }
                }
            }
        }
    }
    
    serde_json::to_string(&tasks).map_err(|e| format!("序列化任务失败: {}", e))
}

#[tauri::command]
pub fn delete_task(task_id: String) -> Result<(), String> {
    let tasks_dir = get_tasks_dir();
    let details_dir = tasks_dir.join("details");
    let index_path = tasks_dir.join("index.json");

    // 删除详情文件
    let detail_path = details_dir.join(format!("{}.json", task_id));
    if detail_path.exists() {
        fs::remove_file(&detail_path).map_err(|e| format!("删除任务详情失败: {}", e))?;
    }

    // 更新索引
    if index_path.exists() {
        let content = fs::read_to_string(&index_path)
            .map_err(|e| format!("读取索引失败: {}", e))?;
        let mut index: Vec<serde_json::Value> =
            serde_json::from_str(&content).unwrap_or_else(|_| vec![]);
        index.retain(|t| t["id"].as_str() != Some(&task_id));
        let index_json = serde_json::to_string_pretty(&index)
            .map_err(|e| format!("序列化索引失败: {}", e))?;
        fs::write(&index_path, &index_json).map_err(|e| format!("写入索引失败: {}", e))?;
    }

    Ok(())
}
