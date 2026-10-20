# Desktop Cat Reminder v0.1.7

## Improvements

- Moved Do Not Disturb from Overview into Settings and combined it with lunch
  quiet hours in a single Do Not Disturb page.
- The manual pause switch takes effect immediately, while lunch settings are
  applied with Save settings.

## Bug Fixes

- Fixed an incorrect error message when enabling launch at login on Windows.
- Fixed startup detection for application paths containing spaces.
- Fixed the Windows source launcher failing when pnpm is not available, even
  when Electron is already installed.
- Updated the Mac source launcher to reuse its installed Electron runtime and
  simplify first-time setup.

## Downloads

- **Windows:** Download `Desktop Cat Reminder Setup 0.1.7.exe`. Quit the app before
  installing over the existing version.
- **Mac source launcher:** Download `Desktop Cat Reminder Mac Source 0.1.7.zip`,
  extract it, and follow `MAC_START_GUIDE.md`. Node.js LTS and an internet
  connection are required for first-time setup. The `.command` file must remain
  alongside the project files; it is not a standalone Mac installer.

The Mac source launcher has not yet been runtime-tested on macOS.
