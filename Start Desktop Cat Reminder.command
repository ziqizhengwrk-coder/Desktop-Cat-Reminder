#!/bin/bash
set -e

cd "$(dirname "$0")"

on_error() {
  echo ""
  echo "Desktop Cat Reminder could not start. Please keep this error message."
  read -r -p "Press Return to close..." reply
}
trap on_error ERR

electron_app="node_modules/electron/dist/Electron.app"
electron_bin="$electron_app/Contents/MacOS/Electron"

if [ ! -x "$electron_bin" ]; then
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo "Install Node.js LTS from https://nodejs.org/en/download first."
    read -r -p "Press Return to close..." reply
    exit 1
  fi

  export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
  export npm_config_registry="${npm_config_registry:-https://registry.npmmirror.com}"

  echo "Installing dependencies..."
  if command -v pnpm >/dev/null 2>&1; then
    pnpm install --frozen-lockfile --config.confirmModulesPurge=false
  else
    npx --yes pnpm@11.25.0 install --frozen-lockfile --config.confirmModulesPurge=false
  fi

  if [ ! -x "$electron_bin" ]; then
    echo "Downloading Electron..."
    node node_modules/electron/install.js
  fi
fi

if [ ! -x "$electron_bin" ]; then
  echo "Electron is missing. Please check the installation messages above."
  read -r -p "Press Return to close..." reply
  exit 1
fi

unset ELECTRON_RUN_AS_NODE
open -n "$electron_app" --args "$PWD" --open-window

echo "Desktop Cat Reminder has started."
read -r -p "Press Return to close this window..." reply
