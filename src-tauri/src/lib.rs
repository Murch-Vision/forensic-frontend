// Forensic Analyst Workstation — Tauri desktop shell.
//
// Release builds bundle the Node/GraphQL API as a "sidecar". On launch we:
//   1. pick a free localhost port,
//   2. copy the schema-only template DB into the per-user app-data dir on first
//      run (so we never run knex .ts migrations from a packed binary),
//   3. spawn `forensic-node server.cjs` with DATA_DIR / ASSETS_DIR / DB_FILE /
//      PORT set, wait until it accepts connections,
//   4. open the window, injecting `window.__API_PORT__` so the React/Apollo
//      client talks to the local API (see src/apollo.ts).
//
// In dev (`tauri dev`, debug build) we DON'T spawn the sidecar — the UI talks to
// the normal dev API exactly like the browser does.

use std::collections::HashMap;
use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Holds the running sidecar child so we can kill it on exit.
struct Sidecar(Mutex<Option<CommandChild>>);

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .expect("could not find a free port for the API sidecar")
}

fn wait_until_ready(port: u16, timeout: Duration) {
    let addr: std::net::SocketAddr = format!("127.0.0.1:{port}").parse().unwrap();
    let start = Instant::now();
    while start.elapsed() < timeout {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok() {
            return;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    eprintln!("[desktop] API sidecar not ready after {timeout:?}; opening window anyway");
}

/// Spawn the bundled API sidecar and return the port it listens on.
fn start_sidecar(app: &tauri::AppHandle) -> Result<u16, Box<dyn std::error::Error>> {
    let resource_dir = app.path().resource_dir()?;
    let sidecar_dir = resource_dir.join("sidecar");
    let server_js = sidecar_dir.join("server.cjs");
    let assets_dir = sidecar_dir.join("assets");
    let template_db = sidecar_dir.join("template.sqlite");

    let data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let db_file = data_dir.join("forensic.sqlite");
    if !db_file.exists() {
        std::fs::copy(&template_db, &db_file)?;
    }

    let port = free_port();

    let mut env: HashMap<String, String> = HashMap::new();
    env.insert("NODE_ENV".into(), "production".into());
    env.insert("PORT".into(), port.to_string());
    env.insert("DATA_DIR".into(), data_dir.to_string_lossy().to_string());
    env.insert("ASSETS_DIR".into(), assets_dir.to_string_lossy().to_string());
    env.insert("DB_FILE".into(), db_file.to_string_lossy().to_string());

    let (mut rx, child) = app
        .shell()
        .sidecar("forensic-node")?
        .args([server_js.to_string_lossy().to_string()])
        .envs(env)
        .spawn()?;

    // Surface the API's stdout/stderr into the desktop log for diagnostics.
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                    eprintln!("[api] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[api] sidecar exited: {payload:?}");
                }
                _ => {}
            }
        }
    });

    app.state::<Sidecar>().0.lock().unwrap().replace(child);
    wait_until_ready(port, Duration::from_secs(30));
    Ok(port)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Sidecar(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();

            // Debug build (`tauri dev`) uses the live dev API — no sidecar.
            let api_port: Option<u16> = if cfg!(debug_assertions) {
                None
            } else {
                match start_sidecar(&handle) {
                    Ok(port) => Some(port),
                    Err(e) => {
                        eprintln!("[desktop] failed to start API sidecar: {e}");
                        None
                    }
                }
            };

            let mut builder =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("Forensic Analyst Workstation")
                    .inner_size(1440.0, 900.0)
                    .min_inner_size(1024.0, 700.0)
                    .resizable(true);

            if let Some(port) = api_port {
                builder = builder.initialization_script(&format!(
                    "window.__API_PORT__ = {port};"
                ));
            }
            builder.build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the Tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                if let Some(child) = app.state::<Sidecar>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
