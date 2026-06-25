# Desktop Cat Reminder

A lightweight Electron desktop pet that nudges you to move at a calmer rhythm.

## Features

- Always-on-top pixel orange cat desktop pet.
- Double-click the cat to open or restore the status window.
- Right-click the cat and choose Quit to exit the app.
- Two activity types: near-desk stretch breaks and outdoor walks.
- User-configurable outdoor walk count and exact walk times.
- Stretch reminders are scheduled around walk times and avoid the 30 minutes before/after each walk.
- Optional lunch quiet time, during which no activity reminders are shown.
- Optional Calendar tab, disabled by default.
- Boot starts a fresh countdown instead of immediately showing stale reminders.
- Fullscreen always-on-top reminder overlay with Done and later actions.
- Calendar tracking: a day lights up after at least one stretch and one walk are completed.

## Requirements

- Node.js 22 or later is recommended.
- The project uses pnpm for dependency management. On macOS, the startup script can run pnpm through `npx` if pnpm is not installed globally.

## Run On macOS

Install Node.js first if this Mac has not run Node/Electron apps before:

https://nodejs.org/en/download

Then double-click:

```text
Start Desktop Cat Reminder.command
```

The first launch may take a while because it installs dependencies and downloads Electron. If macOS blocks the command file, run:

```bash
chmod +x "Start Desktop Cat Reminder.command"
```

See `MAC_START_GUIDE.md` for a beginner-friendly walkthrough.

## Run On Windows

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Demo mode:

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1 --demo
```

## Build Installer

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

The installer is generated in `dist`.

## Files

- `main.js`: Electron main process, scheduling engine, settings, persistence, window management.
- `preload.js`: IPC bridge.
- `src/pet.*`: Desktop cat.
- `src/overlay.*`: Fullscreen reminder overlay.
- `src/status.*`: Status, calendar, and settings window.
