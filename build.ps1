$ErrorActionPreference = "Stop"

function Get-ProjectPnpm {
  $pathCommand = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($pathCommand) {
    return $pathCommand.Source
  }

  $bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
  $bundledPnpm = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd"

  if (Test-Path $bundledNode) {
    $env:PATH = "$bundledNode;$env:PATH"
  }

  if (Test-Path $bundledPnpm) {
    return $bundledPnpm
  }

  throw "pnpm was not found. Install Node.js, then run: corepack enable"
}

$pnpm = Get-ProjectPnpm
Push-Location $PSScriptRoot
try {
  $env:PNPM_HOME = Join-Path $PSScriptRoot ".pnpm-home"
  $env:PNPM_STORE_DIR = Join-Path $PSScriptRoot ".pnpm-store"
  $env:PATH = "$env:PNPM_HOME;$env:PATH"
  & $pnpm install --config.confirmModulesPurge=false
  if ($LASTEXITCODE -ne 0) { throw "pnpm install failed with exit code $LASTEXITCODE" }

  & $pnpm approve-builds --all
  if ($LASTEXITCODE -ne 0) { throw "pnpm approve-builds failed with exit code $LASTEXITCODE" }

  & $pnpm run check
  if ($LASTEXITCODE -ne 0) { throw "pnpm run check failed with exit code $LASTEXITCODE" }

  & .\node_modules\.bin\electron-builder.CMD --win nsis --publish never
  if ($LASTEXITCODE -ne 0) { throw "electron-builder failed with exit code $LASTEXITCODE" }

  Write-Host ""
  Write-Host "Build complete. Installer files are in:"
  Write-Host (Join-Path $PSScriptRoot "dist")
} finally {
  Pop-Location
}
