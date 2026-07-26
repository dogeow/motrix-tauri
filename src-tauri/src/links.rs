use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};

use tauri::{AppHandle, Emitter, Manager};

/// Magnet links / URLs / .torrent paths that arrived before the webview was
/// ready to listen. Drained once by the frontend on startup.
#[derive(Default)]
pub struct PendingTargets {
    pub queue: Mutex<Vec<String>>,
    pub ready: AtomicBool,
}

const SCHEMES: [&str; 5] = ["magnet:", "http://", "https://", "ftp://", "motrix://"];

/// Keep only things worth downloading: known URL schemes and .torrent files.
pub fn filter_targets<I, S>(candidates: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    candidates
        .into_iter()
        .filter_map(|raw| {
            let value = raw.as_ref().trim().to_string();
            if value.is_empty() || value.starts_with('-') {
                return None;
            }
            let lower = value.to_lowercase();
            if SCHEMES.iter().any(|scheme| lower.starts_with(scheme)) {
                return Some(value);
            }
            // macOS hands file associations over as file:// URLs.
            if let Some(path) = lower
                .strip_prefix("file://")
                .filter(|path| path.ends_with(".torrent"))
            {
                return Some(percent_decode(path));
            }
            if lower.ends_with(".torrent") && std::path::Path::new(&value).exists() {
                return Some(value);
            }
            None
        })
        .collect()
}

/// Minimal percent-decoding — enough for file:// paths with spaces / CJK.
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Hand targets to the webview, buffering them until it has started listening.
pub fn dispatch(app: &AppHandle, targets: Vec<String>) {
    if targets.is_empty() {
        return;
    }
    crate::tray::show_main_window(app);

    let state = app.state::<PendingTargets>();
    if state.ready.load(Ordering::SeqCst) {
        let _ = app.emit("open-targets", targets);
    } else {
        state.queue.lock().unwrap().extend(targets);
    }
}

/// Called once by the frontend when its listener is live.
pub fn take_pending(app: &AppHandle) -> Vec<String> {
    let state = app.state::<PendingTargets>();
    state.ready.store(true, Ordering::SeqCst);
    let mut queue = state.queue.lock().unwrap();
    std::mem::take(&mut *queue)
}
