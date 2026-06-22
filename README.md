# Desktop Cat Reminder

A lightweight Electron desktop pet that nudges you to break long sitting sessions.

## Features

- Always-on-top pixel orange cat desktop pet.
- The cat can be dragged, double-clicked, and will idle, walk, loaf, and roll on its own.
- Configurable light activity interval.
- Configurable big activity interval.
- Configurable snooze interval.
- Two configurable daily walk reminder times.
- Fullscreen always-on-top reminder overlay with Done and later actions.
- Status window with next reminders, daily walk completion, done count, ignored count, and settings.

## Run On Windows

If `pnpm` is not available in your terminal, use the bundled project scripts:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Demo mode:

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1 --demo
```

If your system already has pnpm:

```powershell
pnpm install
pnpm start
pnpm demo
```

## Change Reminder Settings

Double-click the desktop cat to open the status window. In the Settings section you can change:

- Light activity interval, in minutes
- Big activity interval, in minutes
- Snooze time, in minutes
- Walk time 1
- Walk time 2

Saving settings immediately recalculates the next reminder times.

## Files

- `main.js`: Electron main process, timers, settings, persistence, window management.
- `preload.js`: IPC bridge.
- `src/pet.*`: Pixel desktop cat and autonomous behavior.
- `src/overlay.*`: Fullscreen reminder overlay.
- `src/status.*`: Status and settings window.
