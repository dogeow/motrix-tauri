mod engine;

use base64::Engine as _;
use tauri::Manager;

#[tauri::command]
fn get_engine_info(state: tauri::State<engine::EngineState>) -> Result<engine::EngineInfo, String> {
    state
        .info
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "下载引擎尚未启动".into())
}

#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
fn reveal_in_folder(path: String) -> Result<(), String> {
    tauri_plugin_opener::reveal_item_in_dir(&path).map_err(|e| e.to_string())
}

/// Move a task's downloaded files to the system trash.
///
/// Deliberately trashes ONLY the individual files aria2 registered for the
/// task — never a whole directory by name. A torrent called "example" may
/// land in a pre-existing `example/` folder holding unrelated user files;
/// trashing the folder wholesale (as Electron-era Motrix did) destroys them.
/// Directories the download created are removed afterwards only if they
/// ended up empty.
#[tauri::command]
fn trash_task_files(
    files: Vec<String>,
    base_dir: String,
    control_root: Option<String>,
) -> Result<usize, String> {
    use std::path::{Path, PathBuf};

    let base = Path::new(&base_dir);
    let mut trashed = 0usize;
    let mut parents: Vec<PathBuf> = Vec::new();

    for file in &files {
        let path = Path::new(file);
        let control = format!("{file}.aria2");
        if Path::new(&control).is_file() {
            let _ = trash::delete(&control);
        }
        if path.is_file() || path.is_symlink() {
            trash::delete(path).map_err(|e| e.to_string())?;
            trashed += 1;
        }
        if let Some(parent) = path.parent() {
            parents.push(parent.to_path_buf());
        }
    }

    // Multi-file BT tasks keep their control file at "<dir>/<name>.aria2".
    if let Some(root) = control_root {
        let control = format!("{root}.aria2");
        if Path::new(&control).is_file() {
            let _ = trash::delete(&control);
        }
    }

    // Clean up now-empty directories, deepest first, never crossing base_dir.
    // remove_dir() only succeeds on empty dirs, so user files are safe.
    parents.sort();
    parents.dedup();
    parents.sort_by_key(|p| std::cmp::Reverse(p.components().count()));
    for parent in parents {
        let mut dir = parent;
        while dir.starts_with(base) && dir != base {
            let is_empty = std::fs::read_dir(&dir)
                .map(|mut entries| entries.next().is_none())
                .unwrap_or(false);
            if !is_empty || std::fs::remove_dir(&dir).is_err() {
                break;
            }
            match dir.parent() {
                Some(p) => dir = p.to_path_buf(),
                None => break,
            }
        }
    }

    Ok(trashed)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(engine::EngineState::default())
        .invoke_handler(tauri::generate_handler![
            get_engine_info,
            read_file_base64,
            reveal_in_folder,
            trash_task_files
        ])
        .setup(|app| {
            engine::start(app.handle())?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                engine::shutdown(app);
            }
        });
}
