#!/bin/zsh
set -e

cd "$(dirname "$0")"

export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export npm_config_registry="https://registry.npmmirror.com"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed yet."
  echo ""
  echo "Please install Node.js LTS from:"
  echo "https://nodejs.org/en/download"
  echo ""
  echo "After installing Node.js, close this window and double-click this file again."
  echo ""
  read "reply?Press Return to close..."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Please reinstall Node.js LTS from https://nodejs.org/en/download"
  echo ""
  read "reply?Press Return to close..."
  exit 1
fi

if command -v pnpm >/dev/null 2>&1; then
  echo "正在检查/安装依赖..."
  pnpm install
  if [ ! -d "node_modules/electron/dist" ]; then
    echo "正在修复 Electron..."
    ELECTRON_MIRROR="$ELECTRON_MIRROR" npx install-electron --no
  fi
  echo "正在启动 Desktop Cat Reminder..."
else
  echo "正在检查/安装依赖..."
  npx --yes pnpm install
  echo "正在启动 Desktop Cat Reminder..."
fi

if [ ! -d "node_modules/electron/dist/Electron.app" ]; then
  echo "正在下载 Electron..."
  ELECTRON_MIRROR="$ELECTRON_MIRROR" npx install-electron --no
fi

open -n "node_modules/electron/dist/Electron.app" --args "$PWD" --open-window

echo "Desktop Cat Reminder 已启动。可以关闭这个终端窗口。"
read "reply?按回车关闭这个窗口..."
