$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $repoRoot 'dist'
$packageDir = Join-Path $repoRoot 'tizen-package'
$configSrc = Join-Path $repoRoot 'tizen\config.xml'
$iconSrc = Join-Path $repoRoot 'src\assets\images\tooty-logo-transparent.png'
$iconDest = Join-Path $packageDir 'icon.png'

if (!(Test-Path $distDir)) {
  throw "dist directory not found. Run 'npm run build' first."
}

if (Test-Path $packageDir) {
  Remove-Item $packageDir -Recurse -Force
}

New-Item -ItemType Directory -Path $packageDir | Out-Null

Copy-Item (Join-Path $distDir '*') $packageDir -Recurse -Force
Copy-Item $configSrc (Join-Path $packageDir 'config.xml') -Force
Copy-Item $iconSrc $iconDest -Force

Write-Host "Prepared Tizen package folder:" $packageDir
