# Codex Usage Ball

[简体中文](README.md)

Codex Usage Ball is a small Windows desktop widget for monitoring Codex account limits. It keeps the 5-hour window, 7-day window, Credits, model buckets, and status visible without reopening Codex pages.

## Screenshots

| Floating Ball | Main Panel | Preferences |
| --- | --- | --- |
| ![Floating ball](docs/images/floating-ball.png) | ![Main panel](docs/images/main-panel.png) | ![Preferences](docs/images/settings-panel.png) |

## Features

- Nested progress-ring floating ball: outer ring for the 5-hour remaining limit, inner ring for the 7-day remaining limit.
- Click the floating ball to refresh usage, double-click it to open the main panel, or right-click it for a compact menu.
- The floating-ball context menu supports hiding the ball and exiting the app.
- Main panel with remaining limits, reset times, Credits, status, and model usage buckets.
- Draggable floating ball, main panel, and settings window with persisted positions.
- The ball snaps to the right edge by default. Drag it away to pin it anywhere, or drag it back near the right edge to snap again.
- Light theme, dark theme, and system theme.
- Six built-in skins: Glass, Night Gauge, Minimal Office, Terminal Green, Sea Teal, and High Contrast.
- Skin preview and switching in Preferences.
- Low-limit system notifications for both the 5-hour and 7-day windows.
- Custom low-limit notification threshold from 1 to 100, defaulting to 15.
- Each window only notifies once for the current threshold. After the remaining limit recovers above the threshold, the next drop below it can notify again.
- Simplified Chinese and English UI.
- 30-second or 60-second refresh interval.
- Launch at login.
- Tray menu for showing the main panel, showing or hiding the ball, opening settings, and exiting the app.
- Transparent borderless windows designed for always-on desktop use.

## Usage

- Floating ball: click to refresh, double-click to open the main panel, right-click for quick actions.
- Main panel: the top buttons refresh usage, open Preferences, and hide the panel; the footer button exits the app.
- Preferences: switch language, theme mode, refresh interval, low-limit threshold, launch-at-login, and skin.
- Dragging: drag the floating ball, the main panel title area, or the Preferences title area to move windows.
- Hide and restore: the main panel close button only hides the window. Use the tray menu to show it again.

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

The dev server uses fixed port `1420`. If the port is already in use, close the existing Vite/Tauri debug process, or stop stale `codex-usage-ball.exe` and `node.exe` processes in Task Manager.

If the current terminal cannot find `cargo`, add Cargo to `PATH` first, for example:

```powershell
$env:PATH = "C:\Users\A\.cargo\bin;$env:PATH"
```

## Test And Build

```bash
pnpm test
pnpm build
pnpm tauri build
```

`pnpm tauri build` creates Windows installers. The release workflow builds and uploads release assets when a `v*` tag is pushed or when the workflow is manually dispatched.

GitHub Actions runs tests, builds the Tauri installer, and uploads `codex-usage-ball_<version>_x64-setup.exe` to the matching Release.

## Stack

- Tauri 2
- React 19
- TypeScript
- Vite
- pnpm
- Rust

## License

MIT
