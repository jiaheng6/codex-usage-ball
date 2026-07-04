use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::env;
use std::ffi::OsString;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};

const BALL_WINDOW_LABEL: &str = "ball";
const MAIN_WINDOW_LABEL: &str = "main";
const SETTINGS_WINDOW_LABEL: &str = "settings";

const MENU_SHOW_MAIN: &str = "show_main_panel";
const MENU_TOGGLE_BALL: &str = "toggle_usage_ball";
const MENU_SHOW_SETTINGS: &str = "show_settings";
const MENU_EXIT: &str = "exit_app";

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreditsSnapshot {
    balance: Option<String>,
    has_credits: bool,
    unlimited: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RateLimitWindow {
    resets_at: Option<i64>,
    used_percent: i32,
    window_duration_mins: Option<i64>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RateLimitSnapshot {
    credits: Option<CreditsSnapshot>,
    limit_id: Option<String>,
    limit_name: Option<String>,
    plan_type: Option<String>,
    primary: Option<RateLimitWindow>,
    rate_limit_reached_type: Option<String>,
    secondary: Option<RateLimitWindow>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct GetAccountRateLimitsResponse {
    rate_limits: RateLimitSnapshot,
    rate_limits_by_limit_id: Option<HashMap<String, RateLimitSnapshot>>,
}

#[derive(Debug)]
enum CodexLauncher {
    Direct(PathBuf),
    CmdScript(PathBuf),
    PowerShellScript(PathBuf),
}

impl CodexLauncher {
    fn command(&self) -> Command {
        match self {
            CodexLauncher::Direct(path) => {
                let mut command = Command::new(path);
                command.args(["app-server", "--listen", "stdio://"]);
                command
            }
            CodexLauncher::CmdScript(path) => {
                let mut command = Command::new("cmd.exe");
                command
                    .args(["/d", "/c"])
                    .arg(path)
                    .args(["app-server", "--listen", "stdio://"]);
                command
            }
            CodexLauncher::PowerShellScript(path) => {
                let mut command = Command::new("powershell.exe");
                command
                    .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
                    .arg(path)
                    .args(["app-server", "--listen", "stdio://"]);
                command
            }
        }
    }
}

#[cfg(windows)]
fn hide_child_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_child_console(_: &mut Command) {}

fn jsonrpc_line(id: i32, method: &str, params: Value) -> String {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params,
    })
    .to_string()
}

fn launcher_for_path(path: PathBuf) -> CodexLauncher {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    match extension.as_str() {
        "cmd" | "bat" => CodexLauncher::CmdScript(path),
        "ps1" => CodexLauncher::PowerShellScript(path),
        _ => CodexLauncher::Direct(path),
    }
}

fn push_dir(candidates: &mut Vec<PathBuf>, value: Option<OsString>) {
    if let Some(value) = value {
        if !value.is_empty() {
            candidates.push(PathBuf::from(value));
        }
    }
}

fn candidate_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Some(path) = env::var_os("PATH") {
        dirs.extend(env::split_paths(&path));
    }

    push_dir(
        &mut dirs,
        env::var_os("ProgramFiles")
            .map(|value| PathBuf::from(value).join("nodejs").into_os_string()),
    );
    push_dir(
        &mut dirs,
        env::var_os("ProgramFiles(x86)")
            .map(|value| PathBuf::from(value).join("nodejs").into_os_string()),
    );
    push_dir(
        &mut dirs,
        env::var_os("APPDATA").map(|value| PathBuf::from(value).join("npm").into_os_string()),
    );
    push_dir(
        &mut dirs,
        env::var_os("LOCALAPPDATA").map(|value| {
            PathBuf::from(value)
                .join("Programs")
                .join("nodejs")
                .into_os_string()
        }),
    );

    let mut unique = Vec::new();
    for dir in dirs {
        if !unique.iter().any(|existing: &PathBuf| existing == &dir) {
            unique.push(dir);
        }
    }
    unique
}

fn find_codex_launcher() -> Result<CodexLauncher, String> {
    if let Some(path) = env::var_os("CODEX_USAGE_BALL_CODEX_PATH") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok(launcher_for_path(path));
        }
    }

    let names = ["codex.exe", "codex.cmd", "codex.bat", "codex.ps1"];
    let mut tried = Vec::new();

    for dir in candidate_dirs() {
        for name in names {
            let candidate = dir.join(name);
            tried.push(candidate.display().to_string());
            if candidate.is_file() {
                return Ok(launcher_for_path(candidate));
            }
        }
    }

    Err(format!(
        "未找到 Codex CLI。请确认已安装 Codex，或设置 CODEX_USAGE_BALL_CODEX_PATH 指向 codex.cmd。已尝试 {} 个位置。",
        tried.len()
    ))
}

fn collect_stderr(rx: &mpsc::Receiver<String>) -> String {
    let lines: Vec<String> = rx.try_iter().collect();
    lines.join("\n")
}

fn spawn_codex_app_server() -> Result<std::process::Child, String> {
    let launcher = find_codex_launcher()?;
    let mut command = launcher.command();
    hide_child_console(&mut command);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    command
        .spawn()
        .map_err(|err| format!("无法启动 codex app-server：{err}"))
}

fn show_window(app: &AppHandle, label: &str) -> Result<(), String> {
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| format!("未找到窗口：{label}"))?;

    window.show().map_err(|err| err.to_string())?;
    let _ = window.unminimize();
    let _ = window.set_focus();
    Ok(())
}

fn hide_window(app: &AppHandle, label: &str) -> Result<(), String> {
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| format!("未找到窗口：{label}"))?;

    window.hide().map_err(|err| err.to_string())
}

fn toggle_ball_window(app: &AppHandle, toggle_item: &CheckMenuItem<tauri::Wry>) {
    let Some(window) = app.get_webview_window(BALL_WINDOW_LABEL) else {
        let _ = toggle_item.set_checked(false);
        return;
    };

    let visible = window.is_visible().unwrap_or(false);
    if visible {
        let _ = window.hide();
        let _ = toggle_item.set_checked(false);
    } else {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = toggle_item.set_checked(true);
    }
}

fn install_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_main = MenuItem::with_id(app, MENU_SHOW_MAIN, "显示主面板", true, None::<&str>)?;
    let toggle_ball = CheckMenuItem::with_id(
        app,
        MENU_TOGGLE_BALL,
        "显示悬浮球",
        true,
        true,
        None::<&str>,
    )?;
    let show_settings = MenuItem::with_id(app, MENU_SHOW_SETTINGS, "设置", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let exit = MenuItem::with_id(app, MENU_EXIT, "退出程序", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&show_main, &toggle_ball, &show_settings, &separator, &exit],
    )?;

    let toggle_for_menu = toggle_ball.clone();
    let mut builder = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Codex 用量悬浮球")
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            MENU_SHOW_MAIN => {
                let _ = show_window(app, MAIN_WINDOW_LABEL);
            }
            MENU_TOGGLE_BALL => toggle_ball_window(app, &toggle_for_menu),
            MENU_SHOW_SETTINGS => {
                let _ = show_window(app, SETTINGS_WINDOW_LABEL);
            }
            MENU_EXIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click { button, .. } if button == MouseButton::Left => {
                let _ = show_window(tray.app_handle(), MAIN_WINDOW_LABEL);
            }
            TrayIconEvent::DoubleClick { button, .. } if button == MouseButton::Left => {
                let _ = show_window(tray.app_handle(), MAIN_WINDOW_LABEL);
            }
            _ => {}
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}

#[tauri::command]
fn read_rate_limits() -> Result<GetAccountRateLimitsResponse, String> {
    let mut child = spawn_codex_app_server()?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "无法写入 codex app-server 标准输入".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取 codex app-server 标准输出".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法读取 codex app-server 错误输出".to_string())?;

    let (stdout_tx, stdout_rx) = mpsc::channel::<String>();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            if stdout_tx.send(line).is_err() {
                break;
            }
        }
    });

    let (stderr_tx, stderr_rx) = mpsc::channel::<String>();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            if stderr_tx.send(line).is_err() {
                break;
            }
        }
    });

    let initialize = jsonrpc_line(
        1,
        "initialize",
        serde_json::json!({
            "clientInfo": {
                "name": "codex-usage-ball",
                "version": env!("CARGO_PKG_VERSION")
            },
            "capabilities": {
                "experimentalApi": true
            }
        }),
    );

    writeln!(stdin, "{initialize}").map_err(|err| format!("初始化请求发送失败：{err}"))?;
    stdin
        .flush()
        .map_err(|err| format!("初始化请求刷新失败：{err}"))?;

    let mut initialized = false;

    loop {
        let line = match stdout_rx.recv_timeout(Duration::from_secs(20)) {
            Ok(line) => line,
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                let stderr = collect_stderr(&stderr_rx);
                if stderr.is_empty() {
                    return Err("读取 Codex 用量超时".to_string());
                }
                return Err(format!("读取 Codex 用量超时：{stderr}"));
            }
        };
        let message: Value = match serde_json::from_str(&line) {
            Ok(message) => message,
            Err(err) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("Codex 返回了无法解析的数据：{err}"));
            }
        };

        if message.get("id").and_then(Value::as_i64) == Some(1) && !initialized {
            initialized = true;
            let request = jsonrpc_line(2, "account/rateLimits/read", Value::Null);
            writeln!(stdin, "{request}").map_err(|err| format!("用量请求发送失败：{err}"))?;
            stdin
                .flush()
                .map_err(|err| format!("用量请求刷新失败：{err}"))?;
            continue;
        }

        if message.get("id").and_then(Value::as_i64) == Some(2) {
            let _ = child.kill();
            let _ = child.wait();

            if let Some(error) = message.get("error") {
                return Err(format!("Codex 用量接口返回错误：{error}"));
            }

            let result = message
                .get("result")
                .cloned()
                .ok_or_else(|| "Codex 用量接口缺少 result 字段".to_string())?;

            return serde_json::from_value(result)
                .map_err(|err| format!("Codex 用量结构解析失败：{err}"));
        }
    }
}

#[tauri::command]
fn show_main_panel(app: AppHandle) -> Result<(), String> {
    show_window(&app, MAIN_WINDOW_LABEL)
}

#[tauri::command]
fn hide_main_panel(app: AppHandle) -> Result<(), String> {
    hide_window(&app, MAIN_WINDOW_LABEL)
}

#[tauri::command]
fn show_settings_window(app: AppHandle) -> Result<(), String> {
    show_window(&app, SETTINGS_WINDOW_LABEL)
}

#[tauri::command]
fn hide_settings_window(app: AppHandle) -> Result<(), String> {
    hide_window(&app, SETTINGS_WINDOW_LABEL)
}

#[tauri::command]
fn exit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            install_tray(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                match window.label() {
                    BALL_WINDOW_LABEL | MAIN_WINDOW_LABEL | SETTINGS_WINDOW_LABEL => {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_rate_limits,
            show_main_panel,
            hide_main_panel,
            show_settings_window,
            hide_settings_window,
            exit_app
        ])
        .run(tauri::generate_context!())
        .expect("Codex 用量悬浮球启动失败");
}
