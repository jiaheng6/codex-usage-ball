# Codex Usage Ball

[简体中文](README.md)

Codex Usage Ball is a small Windows desktop widget for monitoring Codex account limits. It keeps the 5-hour window, 7-day window, Credits, model buckets, and status visible without reopening Codex pages.

## Screenshots

| Floating Ball | Main Panel | Settings |
| --- | --- | --- |
| ![Floating ball](docs/images/floating-ball.png) | ![Main panel](docs/images/main-panel.png) | ![Settings](docs/images/settings-panel.png) |

## Features

- Nested progress-ring floating ball: outer ring for the 5-hour remaining limit, inner ring for the 7-day remaining limit.
- Main panel with remaining limits, reset times, Credits, status, and model usage buckets.
- Draggable floating ball, main panel, and settings window with persisted positions.
- The ball snaps to the right edge by default. Drag it away to pin it anywhere, or drag it back near the right edge to snap again.
- Light theme, dark theme, and system theme.
- Simplified Chinese and English UI.
- 30-second or 60-second refresh interval.
- Launch at login.
- Tray menu for showing the main panel, showing or hiding the ball, opening settings, and exiting the app.
- Transparent borderless windows designed for always-on desktop use.

## Installation

Download the latest Windows installer from [Releases](https://github.com/jiaheng6/codex-usage-ball/releases).

Before running the app, make sure Codex CLI is installed and signed in. The app reads account usage through `codex app-server --listen stdio://`.

## Codex CLI Discovery

When the desktop app starts from Explorer, Start Menu, or launch-at-login, it may not inherit the terminal `PATH`. The app checks common Codex CLI locations:

- `codex.exe`, `codex.cmd`, `codex.bat`, and `codex.ps1` from `PATH`
- `C:\Program Files\nodejs`
- `%APPDATA%\npm`
- `%LOCALAPPDATA%\Programs\nodejs`

If Codex is installed in a custom location, set `CODEX_USAGE_BALL_CODEX_PATH` to the actual `codex.cmd` or `codex.ps1` path.

## Development

```bash
pnpm install
pnpm dev
pnpm tauri dev
```

Use `pnpm dev` for frontend preview only. Full desktop debugging requires Rust/Cargo.

## Test And Build

```bash
pnpm test
pnpm build
pnpm tauri build
```

`pnpm tauri build` creates Windows installers. The release workflow builds and uploads release assets when a `v*` tag is pushed or when the workflow is manually dispatched.

## Stack

- Tauri 2
- React 19
- TypeScript
- Vite
- pnpm
- Rust

## License

MIT
