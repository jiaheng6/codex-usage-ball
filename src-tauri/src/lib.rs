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
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    command
        .spawn()
        .map_err(|err| format!("无法启动 codex app-server：{err}"))
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![read_rate_limits])
        .run(tauri::generate_context!())
        .expect("Codex 用量悬浮球启动失败");
}
