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
  & $pnpm install
} finally {
  Pop-Location
}
