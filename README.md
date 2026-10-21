# DueDesk

A small, local-only **Windows** task app whose star feature is **translucent desktop widgets**
that sit on your wallpaper and show what is due next.

- No account, no sign-up, no sync, no telemetry. Your tasks live in one JSON file on your PC.
- Inspired by the widget style of [YYNote](https://www.yynote.net/en/). DueDesk is an independent
  project and is **not affiliated with YYNote**; no YYNote code, logo or assets are used.

## Features

**Tasks**

- Each task has a **name**, an optional multi-line **description**, and an optional **due date**
  (date only, which counts as the end of that day, or date + time).
- Sorted by urgency: overdue first, then soonest due, tasks without a due date last.
- Filters: **All, Overdue, Today, Next 7 days, No due date**. You can also search and choose to show completed tasks.
- Live countdown labels such as `Today 5:00 PM`, `Tomorrow`, `in 3 days` and `2 days overdue`.
  They refresh every minute, so they stay correct across midnight.
- A native Windows notification appears once when a task with a time becomes due.

**Desktop widgets**

- Frameless, transparent panels on the desktop. You can add as many as you like, and each one has its own filter.
- Drag a widget by its header and resize it from any edge. Position and size are saved.
- In the header you can change the filter, lock the widget, open its settings, or quick-add a task with **+**.
- Hover over a task to show the round action buttons: **complete** (green), **edit in DueDesk** (blue) and **delete** (red).
  Click a task to expand its description.
- Each widget has its own settings: filter, sort (due date / created / name), show completed,
  background opacity, always on top, lock (no moving, resizing or editing) and remove.
- Every window updates instantly when a task changes anywhere.

**App**

- Dark glass main window with a custom title bar. Closing it hides DueDesk to the tray.
- The tray menu has: Open DueDesk, New task, Add widget, Show/Hide widgets, Launch at startup, and Quit.
- Single instance: if you launch DueDesk again, the existing window comes to the front.
- Keyboard shortcuts: `Ctrl+N` creates a new task, `Ctrl+F` searches, `Ctrl+Enter` saves in the editor, and `Esc` closes dialogs.

## Screenshots

_Screenshots coming soon._

<!--
![Main window](docs/main.png)
![Desktop widgets](docs/widgets.png)
-->

## Download

Every push to `main` builds Windows binaries in GitHub Actions. You can download them from the
**Actions** run's artifacts. Tagged versions (`v*`) are published on the **Releases** page; the workflow sets the app version from
the tag, so `v1.2.0` produces `DueDesk-Setup-1.2.0-x64.exe`:

- `DueDesk-Setup-<version>-x64.exe` is the installer (per user, and lets you choose a folder).
- `DueDesk-Portable-<version>-x64.exe` is a single portable executable.

The binaries are not code-signed, so Windows SmartScreen may ask you to confirm the first launch.

## Development

Requirements: Node.js 22 and npm 10.

```bash
npm install
npm run dev        # electron-vite dev server with hot reload
npm run typecheck  # TypeScript (main/preload + renderer)
npm test           # vitest unit tests for the pure logic and the JSON store
npm run build      # production bundle into ./out
```

### Build the Windows app

```bash
npm run dist       # NSIS installer + portable exe in ./release (run on Windows)
npm run dist:dir   # unpacked app in ./release/win-unpacked
```

`npm run dist` uses electron-builder. Building the NSIS/portable targets on Linux or macOS
requires Wine, so the GitHub workflow builds on `windows-latest` instead.

## Project layout

```
src/
  shared/     types, constants, pure date/filter/sort/notification logic (unit tested)
  main/       Electron main process: store (atomic JSON), windows, tray, IPC, notifications
  preload/    typed contextBridge API (window.duedesk)
  renderer/   React UI: index.html (main app) and widget.html (desktop widget)
tests/        vitest suites
build/        app icon (svg/png/ico) used by electron-builder
resources/    runtime icons (tray, notifications)
```

## Data and privacy

Everything is saved to `%APPDATA%\DueDesk\duedesk-data.json`. The file is versioned and written
atomically: DueDesk writes a temporary file, flushes it, and then renames it over the old one.
If the file ever becomes unreadable (invalid JSON or an unexpected shape), DueDesk moves it aside as
`duedesk-data.json.corrupt-<timestamp>` and starts with an empty list. Before upgrading a file written
by an older or newer schema version, the original is copied to `duedesk-data.json.v<version>-backup-<timestamp>`.
DueDesk makes no network requests.

A task's `dueAt` is a **local** ISO-8601 date or date-time with no time zone: `"YYYY-MM-DD"` (date
only, due at the end of that day) or `"YYYY-MM-DDTHH:mm"`, or `null` for no due date. This is a
deliberate choice over UTC timestamps: a date-only due stays on the same calendar day wherever the
PC's clock is set. Zoned ISO timestamps (for example `2026-10-21T17:00:00Z`) are accepted on input
and converted to local wall-clock time.

The portable exe registers a `DueDesk` Start Menu shortcut on first run. Windows needs it to show
due-time notifications for apps that are not installed.

Security: the renderers run with `contextIsolation`, `sandbox` and no `nodeIntegration`. All
access goes through a small typed IPC bridge.

## License

[MIT](LICENSE) © absar0920
