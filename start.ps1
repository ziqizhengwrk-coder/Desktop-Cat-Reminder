$ErrorActionPreference = "Stop"

$electronExe = Join-Path $PSScriptRoot "node_modules\electron\dist\electron.exe"
if (!(Test-Path $electronExe)) {
  Write-Host "Electron is not installed yet. Running install first..."
  & (Join-Path $PSScriptRoot "install.ps1")
  if ($LASTEXITCODE -ne 0) { throw "install failed with exit code $LASTEXITCODE" }
}
if (!(Test-Path $electronExe)) {
  throw "Electron executable is still missing after install: $electronExe"
}

Push-Location $PSScriptRoot
try {
  $launchArgs = @("--open-window")
  if ($args.Count -gt 0) { $launchArgs = @($args) }

  # Piping waits for the GUI executable and preserves its error output and exit code.
  & $electronExe . @launchArgs | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Electron failed to start with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}
