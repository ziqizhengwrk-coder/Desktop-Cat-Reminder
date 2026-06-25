@echo off
setlocal

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" --open-window

if errorlevel 1 (
  echo.
  echo Desktop Cat Reminder failed to start.
  echo Please keep this window open and share the error message.
  echo.
  pause
)
