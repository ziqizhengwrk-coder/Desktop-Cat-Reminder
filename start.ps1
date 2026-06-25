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

$electronExe = Join-Path $PSScriptRoot "node_modules\electron\dist\electron.exe"
if (!(Test-Path $electronExe)) {
  Write-Host "Electron is not installed yet. Running install first..."
  & (Join-Path $PSScriptRoot "install.ps1")
  if ($LASTEXITCODE -ne 0) { throw "install failed with exit code $LASTEXITCODE" }
}
if (!(Test-Path $electronExe)) {
  throw "Electron executable is still missing after install: $electronExe"
}

$pnpm = Get-ProjectPnpm
Push-Location $PSScriptRoot
try {
  if ($args.Count -gt 0) {
    & $pnpm exec electron . @args
  } else {
    & $pnpm exec electron . --open-window
  }
} finally {
  Pop-Location
}
