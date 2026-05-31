// ─── Module declarations ─────────────────────────────────────────────────────
mod common;
mod scheduler;
mod memory_fs;
mod task_persistence;
mod agent_tools;
mod skills;

// ─── Re-exports used by the application entry-point ──────────────────────────
use scheduler::{SchedulerState, start_background_scheduler};
use std::collections::HashMap;
use std::sync::Mutex;

// ─── Trivial built-in command ────────────────────────────────────────────────
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// ─── Application entry-point ─────────────────────────────────────────────────
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .manage(SchedulerState {
            tasks: Mutex::new(HashMap::new()),
            log: Mutex::new(Vec::new()),
        })
        .setup(|app| {
            start_background_scheduler(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // built-in
            greet,
            // system info
            common::get_system_info,
            // default workspace
            common::get_default_workspace_path,
            // open directory with native file manager (fallback)
            common::shell_open,
            // temp file path (for browser preview)
            common::get_temp_file_path,
            // connector test
            common::test_connector,
            // scheduler
            scheduler::sync_tasks,
            scheduler::trigger_task,
            scheduler::get_scheduler_logs,
            // memory / file-system
            memory_fs::init_memory_files,
            memory_fs::read_memory_tree,
            memory_fs::read_memory_file,
            memory_fs::write_memory_file,
            memory_fs::save_mcp_servers,
            memory_fs::load_mcp_servers,
            // connectors persistence
            memory_fs::save_connectors,
            memory_fs::load_connectors,
            // expert suites persistence
            memory_fs::save_suites,
            memory_fs::load_suites,
            // settings persistence
            memory_fs::save_settings,
            memory_fs::load_settings,
            // session persistence
            memory_fs::save_session,
            memory_fs::load_session,
            // task persistence
            task_persistence::save_task,
            task_persistence::load_tasks,
            task_persistence::delete_task,
            // agent tool commands
            agent_tools::agent_read_file,
            agent_tools::read_image_base64,
            agent_tools::agent_write_file,
            agent_tools::agent_list_directory,
            agent_tools::agent_run_command,
            agent_tools::agent_glob_search,
            agent_tools::agent_ripgrep_search,
            agent_tools::agent_delete_path,
            agent_tools::agent_copy_path,
            agent_tools::agent_move_path,
            agent_tools::get_env_var,
            // connector tools (SSH / MySQL / PostgreSQL)
            agent_tools::agent_ssh_exec,
            agent_tools::agent_ssh_read_file,
            agent_tools::agent_mysql_query,
            agent_tools::agent_mysql_list_tables,
            agent_tools::agent_pg_query,
            agent_tools::agent_pg_list_tables,
            // skill management
            skills::load_user_skills,
            skills::load_builtin_skills,
            skills::load_ai_skills,
            skills::load_draft_skills,
            skills::install_skill_from_git,
            skills::uninstall_skill,
            skills::skill_save,
            skills::skill_delete,
            skills::skill_copy,
            skills::skill_exists,
            skills::skill_list_files,
            skills::skill_publish_draft,
            skills::get_aipcowork_base,
            // home directory
            agent_tools::get_home_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
