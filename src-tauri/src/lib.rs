use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
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

fn jsonrpc_line(id: i32, method: &str, params: Value) -> String {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params,
    })
    .to_string()
}

#[tauri::command]
fn read_rate_limits() -> Result<GetAccountRateLimitsResponse, String> {
    let mut child = Command::new("codex")
        .args(["app-server", "--listen", "stdio://"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("无法启动 codex app-server：{err}"))?;

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

    let (tx, rx) = mpsc::channel::<String>();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            if tx.send(line).is_err() {
                break;
            }
        }
    });
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for _line in reader.lines().map_while(Result::ok) {}
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
    stdin.flush().map_err(|err| format!("初始化请求刷新失败：{err}"))?;

    let mut initialized = false;

    loop {
        let line = match rx.recv_timeout(Duration::from_secs(20)) {
            Ok(line) => line,
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("读取 Codex 用量超时".to_string());
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
            stdin.flush().map_err(|err| format!("用量请求刷新失败：{err}"))?;
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
