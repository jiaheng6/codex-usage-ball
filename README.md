# Codex 用量悬浮球

一个用于查看 Codex 账户用量窗口的 Windows 悬浮球工具。目标是在桌面常驻显示短期窗口、长期窗口、重置时间和 credits 状态，减少反复打开 Codex 设置页的操作。

## 技术选型

- Tauri 2
- React 19
- TypeScript
- Vite
- pnpm
- Rust 后端命令调用 `codex app-server --listen stdio://`

## 开发命令

```bash
pnpm install
pnpm dev
pnpm tauri dev
```

当前本机还需要安装 Rust/Cargo 后才能运行 `pnpm tauri dev`。只预览前端界面可以先运行 `pnpm dev`。

## 许可证

MIT
