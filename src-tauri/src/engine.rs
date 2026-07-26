use std::{
    fs,
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};

use rand::{distr::Alphanumeric, Rng};
use serde::Serialize;
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager};
use tauri_plugin_shell::{process::CommandChild, process::CommandEvent, ShellExt};

/// Connection details handed to the webview. Fixed for the whole app run, so a
/// crashed-and-restarted aria2 is transparent to the frontend's reconnect loop.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineInfo {
    pub rpc_port: u16,
    pub rpc_secret: String,
    pub download_dir: String,
}

#[derive(Default)]
pub struct EngineState {
    pub info: Mutex<Option<EngineInfo>>,
    pub child: Mutex<Option<CommandChild>>,
    /// Last spawn failure, surfaced to the UI instead of aborting startup.
    pub error: Mutex<Option<String>>,
    pub shutting_down: AtomicBool,
}

/// Restart backoff caps at 2^4 = 16s between attempts.
const MAX_BACKOFF_EXP: u32 = 4;

fn pick_free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(16801)
}

fn random_secret() -> String {
    rand::rng()
        .sample_iter(&Alphanumeric)
        .take(24)
        .map(char::from)
        .collect()
}

fn file_allocation() -> &'static str {
    if cfg!(target_os = "windows") {
        "falloc"
    } else if cfg!(target_os = "linux") {
        "trunc"
    } else {
        "none"
    }
}

fn data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("engine");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Network preferences the Rust side needs before the webview exists.
pub struct NetSettings {
    /// 0 keeps the RPC port random (and the secret ephemeral).
    pub rpc_port: u16,
    pub bt_port: u16,
    pub upnp: bool,
}

const DEFAULT_BT_PORT: u16 = 51413;

fn read_net_settings(app: &AppHandle) -> NetSettings {
    use tauri_plugin_store::StoreExt;

    let settings = app
        .store("settings.json")
        .ok()
        .and_then(|store| store.get("settings"));
    let get_u16 = |key: &str, fallback: u16| -> u16 {
        settings
            .as_ref()
            .and_then(|value| value.get(key))
            .and_then(|value| value.as_u64())
            .map(|value| value as u16)
            .unwrap_or(fallback)
    };

    NetSettings {
        rpc_port: get_u16("rpcPort", 0),
        bt_port: get_u16("btPort", DEFAULT_BT_PORT),
        upnp: settings
            .as_ref()
            .and_then(|value| value.get("upnp"))
            .and_then(|value| value.as_bool())
            .unwrap_or(false),
    }
}

/// A pinned RPC port implies a stable secret, so browser extensions keep
/// working across launches. Random ports keep an ephemeral secret.
fn persistent_secret(app: &AppHandle) -> String {
    use tauri_plugin_store::StoreExt;

    let Ok(store) = app.store("settings.json") else {
        return random_secret();
    };
    if let Some(secret) = store.get("rpcSecret").and_then(|v| v.as_str().map(String::from)) {
        if !secret.is_empty() {
            return secret;
        }
    }
    let secret = random_secret();
    store.set("rpcSecret", serde_json::Value::String(secret.clone()));
    let _ = store.save();
    secret
}

/// Create the connection details on first call; reuse them on every restart.
fn ensure_info(app: &AppHandle) -> Result<EngineInfo, String> {
    let state = app.state::<EngineState>();
    if let Some(info) = state.info.lock().unwrap().clone() {
        return Ok(info);
    }

    let download_dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| e.to_string())?;

    let net = read_net_settings(app);
    let info = EngineInfo {
        rpc_port: if net.rpc_port > 0 {
            net.rpc_port
        } else {
            pick_free_port()
        },
        rpc_secret: if net.rpc_port > 0 {
            persistent_secret(app)
        } else {
            random_secret()
        },
        download_dir: download_dir.to_string_lossy().into_owned(),
    };
    *state.info.lock().unwrap() = Some(info.clone());
    Ok(info)
}

pub fn start(app: &AppHandle) -> Result<(), String> {
    let result = spawn_engine(app, 0);
    if let Err(error) = &result {
        *app.state::<EngineState>().error.lock().unwrap() = Some(error.clone());
    }
    result
}

fn spawn_engine(app: &AppHandle, attempt: u32) -> Result<(), String> {
    let info = ensure_info(app)?;
    let dir = data_dir(app)?;
    let conf_path = app
        .path()
        .resolve("resources/aria2.conf", BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let session = dir.join("download.session");
    let net = read_net_settings(app);

    // Pinning the BT port is what makes a UPnP mapping meaningful.
    let mut args: Vec<String> = vec![
        format!("--listen-port={}", net.bt_port),
        format!("--dht-listen-port={}", net.bt_port),
    ];
    args.extend([
        format!("--conf-path={}", conf_path.display()),
        "--enable-rpc=true".into(),
        "--rpc-listen-all=false".into(),
        "--rpc-allow-origin-all=true".into(),
        format!("--rpc-listen-port={}", info.rpc_port),
        format!("--rpc-secret={}", info.rpc_secret),
        format!("--dir={}", info.download_dir),
        format!("--save-session={}", session.display()),
        format!("--dht-file-path={}", dir.join("dht.dat").display()),
        format!("--dht-file-path6={}", dir.join("dht6.dat").display()),
        format!("--file-allocation={}", file_allocation()),
    ]);
    if session.exists() {
        args.push(format!("--input-file={}", session.display()));
    }

    let upnp = app.state::<crate::upnp::UpnpState>();
    if net.upnp {
        upnp.start(net.bt_port);
    } else {
        upnp.stop();
    }

    let (mut rx, child) = app
        .shell()
        .sidecar("aria2c")
        .map_err(|e| e.to_string())?
        .args(args)
        .spawn()
        .map_err(|e| e.to_string())?;

    {
        let state = app.state::<EngineState>();
        *state.child.lock().unwrap() = Some(child);
        *state.error.lock().unwrap() = None;
    }
    let _ = app.emit("engine-started", info.clone());

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                    print!("[aria2] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(payload) => {
                    let state = handle.state::<EngineState>();
                    if state.shutting_down.load(Ordering::SeqCst) {
                        break;
                    }
                    let reason = format!("aria2 意外退出（code {:?}）", payload.code);
                    eprintln!("[aria2] {reason}");
                    *state.error.lock().unwrap() = Some(reason.clone());
                    let _ = handle.emit("engine-down", reason);
                    schedule_restart(handle.clone(), attempt);
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

fn schedule_restart(app: AppHandle, attempt: u32) {
    let delay = Duration::from_secs(1 << attempt.min(MAX_BACKOFF_EXP));
    std::thread::spawn(move || {
        std::thread::sleep(delay);
        if app.state::<EngineState>().shutting_down.load(Ordering::SeqCst) {
            return;
        }
        if let Err(error) = spawn_engine(&app, attempt + 1) {
            eprintln!("[aria2] restart failed: {error}");
            *app.state::<EngineState>().error.lock().unwrap() = Some(error.clone());
            let _ = app.emit("engine-down", error);
            schedule_restart(app, attempt + 1);
        }
    });
}

/// Stop the current process and immediately bring a fresh one up.
pub fn restart(app: &AppHandle) -> Result<(), String> {
    kill_current(app);
    std::thread::sleep(Duration::from_millis(300));
    spawn_engine(app, 0)
}

/// Ask aria2 to shut down gracefully (saves the session), then kill as fallback.
pub fn shutdown(app: &AppHandle) {
    app.state::<crate::upnp::UpnpState>().stop();

    let state = app.state::<EngineState>();
    state.shutting_down.store(true, Ordering::SeqCst);

    let info = state.info.lock().unwrap().clone();
    if let Some(info) = info {
        rpc_shutdown(info.rpc_port, &info.rpc_secret);
        std::thread::sleep(Duration::from_millis(500));
    }
    kill_current(app);
}

fn kill_current(app: &AppHandle) {
    let child = app.state::<EngineState>().child.lock().unwrap().take();
    if let Some(child) = child {
        let _ = child.kill();
    }
}

/// Minimal blocking JSON-RPC "aria2.shutdown" over raw HTTP, no extra deps.
fn rpc_shutdown(port: u16, secret: &str) {
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": "shutdown",
        "method": "aria2.shutdown",
        "params": [format!("token:{secret}")],
    })
    .to_string();

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(500)) else {
        return;
    };
    let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
    let _ = stream.set_read_timeout(Some(Duration::from_millis(1000)));
    let request = format!(
        "POST /jsonrpc HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    if stream.write_all(request.as_bytes()).is_ok() {
        let mut buf = [0u8; 1024];
        let _ = stream.read(&mut buf);
    }
}
