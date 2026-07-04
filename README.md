# Codex 用量悬浮球

[English](README.en.md)

Codex 用量悬浮球是一个 Windows 桌面小工具，用于常驻查看 Codex 账户的 5 小时窗口、7 天窗口、Credits、模型用量桶和状态信息。它会停靠在显示器右侧，也可以拖到任意位置固定。

## 截图

| 悬浮球 | 主面板 | 设置 |
| --- | --- | --- |
| ![悬浮球](docs/images/floating-ball.png) | ![主面板](docs/images/main-panel.png) | ![设置](docs/images/settings-panel.png) |

## 功能

- 双层圆环悬浮球：外圈显示 5 小时剩余额度，内圈显示 7 天剩余额度。
- 主面板展示剩余额度、重置时间、Credits、状态和模型用量桶。
- 悬浮球、主面板、设置窗口都支持拖动，位置会自动保存。
- 悬浮球默认吸附在显示器右侧；拖离后固定在释放位置，拖回右侧边缘会重新吸附。
- 支持亮色、暗色和跟随系统主题。
- 支持中文和英文界面。
- 支持 30 秒或 60 秒刷新频率。
- 支持开机自启。
- 系统托盘菜单支持显示主面板、显示/隐藏悬浮球、打开设置和退出程序。
- 透明窗口无明显边框，适合桌面常驻。

## 安装

从 [Releases](https://github.com/jiaheng6/codex-usage-ball/releases) 下载最新 Windows 安装包并安装。

运行前请确保本机已经安装并登录 Codex CLI。应用会通过 `codex app-server --listen stdio://` 读取账户用量。

## Codex CLI 定位

从资源管理器、开始菜单或开机自启启动桌面应用时，应用可能拿不到终端里的 `PATH`。因此它会主动查找常见 Codex CLI 位置：

- `PATH` 中的 `codex.exe`、`codex.cmd`、`codex.bat`、`codex.ps1`
- `C:\Program Files\nodejs`
- `%APPDATA%\npm`
- `%LOCALAPPDATA%\Programs\nodejs`

如果 Codex 安装在自定义路径，可以设置环境变量 `CODEX_USAGE_BALL_CODEX_PATH`，指向实际的 `codex.cmd` 或 `codex.ps1`。

## 本地开发

```bash
pnpm install
pnpm dev
pnpm tauri dev
```

只预览前端界面可以运行 `pnpm dev`。完整桌面调试需要本机安装 Rust/Cargo。

## 测试与构建

```bash
pnpm test
pnpm build
pnpm tauri build
```

`pnpm tauri build` 会生成 Windows 安装包。发布工作流会在推送 `v*` tag 或手动触发时自动构建并上传 Release 附件。

## 技术栈

- Tauri 2
- React 19
- TypeScript
- Vite
- pnpm
- Rust

## 许可证

MIT
