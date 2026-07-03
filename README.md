# Codex 用量悬浮球

一个用于查看 Codex 账户用量窗口的 Windows 悬浮球工具。目标是在桌面常驻显示短期窗口、长期窗口、重置时间和 credits 状态，减少反复打开 Codex 设置页的操作。

## 技术选型

- Tauri 2
- React 19
- TypeScript
- Vite
- pnpm
- Rust 后端命令调用 `codex app-server --listen stdio://`

## 当前能力

- 读取并展示 Codex rate limits。
- 展示短期窗口、长期窗口、Credits、模型用量桶和更新时间。
- 支持中文和英文界面切换。
- 支持亮色、暗色和跟随系统主题。
- 支持 60 秒和 30 秒刷新频率。

## Codex CLI 定位

桌面应用从 Explorer 或开始菜单启动时，可能拿不到终端里的 PATH。应用会主动查找常见 Codex CLI 位置，包括：

- `PATH` 中的 `codex.exe`、`codex.cmd`、`codex.bat`、`codex.ps1`
- `C:\Program Files\nodejs`
- `%APPDATA%\npm`
- `%LOCALAPPDATA%\Programs\nodejs`

如果 Codex 安装在自定义路径，可以设置环境变量 `CODEX_USAGE_BALL_CODEX_PATH`，指向实际的 `codex.cmd` 或 `codex.ps1`。

## 开发命令

```bash
pnpm install
pnpm dev
pnpm tauri dev
```

当前本机还需要安装 Rust/Cargo 后才能运行 `pnpm tauri dev`。只预览前端界面可以先运行 `pnpm dev`。

## 许可证

MIT
