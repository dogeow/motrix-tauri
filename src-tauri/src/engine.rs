use std::{
    fs,
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    sync::Mutex,
    time::Duration,
};

use rand::{distr::Alphanumeric, Rng};
use serde::Serialize;
use tauri::{path::BaseDirectory, AppHandle, Manager};
use tauri_plugin_shell::{process::CommandChild, process::CommandEvent, ShellExt};

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
}

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

pub fn start(app: &AppHandle) -> Result<(), String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("engine");
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let download_dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| e.to_string())?;

    let conf_path = app
        .path()
        .resolve("resources/aria2.conf", BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;

    let session = data_dir.join("download.session");
    let port = pick_free_port();
    let secret = random_secret();

    let mut args: Vec<String> = vec![
        format!("--conf-path={}", conf_path.display()),
        "--enable-rpc=true".into(),
        "--rpc-listen-all=false".into(),
        "--rpc-allow-origin-all=true".into(),
        format!("--rpc-listen-port={port}"),
        format!("--rpc-secret={secret}"),
        format!("--dir={}", download_dir.display()),
        format!("--save-session={}", session.display()),
        format!("--dht-file-path={}", data_dir.join("dht.dat").display()),
        format!("--dht-file-path6={}", data_dir.join("dht6.dat").display()),
        format!("--file-allocation={}", file_allocation()),
        // Make aria2 exit on its own if this process dies without cleanup
        // (crash, force-quit), so no orphan keeps the RPC port open.
        format!("--stop-with-process={}", std::process::id()),
    ];
    if session.exists() {
        args.push(format!("--input-file={}", session.display()));
    }

    let (mut rx, child) = app
        .shell()
        .sidecar("aria2c")
        .map_err(|e| e.to_string())?
        .args(args)
        .spawn()
        .map_err(|e| e.to_string())?;

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                    print!("[aria2] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(payload) => {
                    println!("[aria2] exited with {:?}", payload.code);
                }
                _ => {}
            }
        }
    });

    let state = app.state::<EngineState>();
    *state.child.lock().unwrap() = Some(child);
    *state.info.lock().unwrap() = Some(EngineInfo {
        rpc_port: port,
        rpc_secret: secret,
        download_dir: download_dir.to_string_lossy().into_owned(),
    });

    Ok(())
}

/// Ask aria2 to shut down gracefully (saves the session), then kill as fallback.
pub fn shutdown(app: &AppHandle) {
    let state = app.state::<EngineState>();
    let info = state.info.lock().unwrap().take();
    let child = state.child.lock().unwrap().take();

    if let Some(info) = info {
        rpc_shutdown(info.rpc_port, &info.rpc_secret);
        // Give aria2 up to 3s to save the session and exit; the RPC port
        // closing is our signal that it is gone.
        let addr = SocketAddr::from(([127, 0, 0, 1], info.rpc_port));
        for _ in 0..15 {
            std::thread::sleep(Duration::from_millis(200));
            if TcpStream::connect_timeout(&addr, Duration::from_millis(100)).is_err() {
                break;
            }
        }
    }
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
