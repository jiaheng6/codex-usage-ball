# 技术决策

## 决策

使用 Tauri 2 + React + TypeScript + Vite + pnpm 构建 Windows 桌面悬浮球。

## 理由

- Tauri 体积和常驻资源占用通常低于 Electron，更适合悬浮球和托盘工具。
- React + TypeScript 适合快速迭代复杂状态和面板交互。
- Vite 启动快，适合单窗口桌面工具。
- Rust 后端可以安全地启动 `codex app-server` 并读取 JSON-RPC 响应，避免前端直接接触账户 token。

## 数据源

当前数据源为本机 Codex CLI 的 app-server 协议：

```text
account/rateLimits/read
```

返回数据包含：

- `primary.usedPercent`
- `primary.resetsAt`
- `secondary.usedPercent`
- `secondary.resetsAt`
- `credits`
- `planType`
- `rateLimitsByLimitId`

## Codex CLI 启动策略

桌面应用不能假设 GUI 启动环境继承终端 PATH。后端会按以下顺序定位 Codex CLI：

1. 读取 `CODEX_USAGE_BALL_CODEX_PATH` 指向的显式路径。
2. 扫描当前进程 PATH。
3. 扫描常见 Node 全局目录，例如 `C:\Program Files\nodejs` 和 `%APPDATA%\npm`。

Windows 下优先支持 `codex.cmd`；如果只找到 `codex.ps1`，则通过 PowerShell 启动。

## 安全原则

- 不读取 `~/.codex/auth.json`。
- 不保存 Codex token。
- 不向第三方服务上传用量数据。
- 默认只读取，不修改 Codex 配置。

## 本地偏好

- 语言、主题和刷新频率先保存在浏览器侧 `localStorage`。
- 主题支持亮色、暗色、跟随系统；跟随系统通过 `prefers-color-scheme` 解析。
- 后续需要托盘、开机自启或跨窗口共享配置时，再迁移到 Tauri 后端持久化。

## 本机环境备注

当前已确认 Node、pnpm、GitHub CLI 可用；Rust/Cargo 暂未安装。安装 Rust 后才能运行完整的 Tauri 桌面开发命令。
