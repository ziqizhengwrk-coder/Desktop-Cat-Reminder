# Mac Start Guide

The `.command` file is a source-project launcher, not a macOS installer. Keep it
in the same folder as `package.json`, `main.js`, `preload.js`, and `src`.

## First Time Setup

1. Download and extract `Desktop Cat Reminder Mac Source 0.1.7.zip`.
2. Install Node.js LTS for macOS from https://nodejs.org/en/download.
3. Double-click `Start Desktop Cat Reminder.command` in the extracted folder.

The first launch installs dependencies and downloads Electron. Later launches
use the installed Electron directly. An internet connection is needed for setup.
The Windows `.exe` and `.bat` files cannot run on macOS.

## If macOS Blocks The File

Open Terminal, type `chmod +x ` (including the trailing space), drag
`Start Desktop Cat Reminder.command` from Finder into Terminal, then press Return.
Double-click the file again. If macOS blocks a trusted download, use Finder's
Open action or review the blocked-app message in System Settings.

## Updates

Download and extract the new source archive into a new folder, install its
dependencies on first launch, and use its `.command` file. Quit the previous
instance first. Do not copy Windows `node_modules` into the Mac folder.

If launch at login was enabled for an old source folder, turn it off in the old
copy before switching folders, then enable it in the new copy. The startup entry
points to the source folder used when it was enabled.

This archive is prepared on Windows; macOS runtime behavior still needs testing
on a Mac. A native `.dmg` installer can be built with the repository's macOS
GitHub Actions workflow.
