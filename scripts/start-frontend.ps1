# start-frontend.ps1
# Installs npm dependencies and starts the Next.js dev server.

$ErrorActionPreference = "Stop"

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir     = Resolve-Path "$ScriptDir\.."
$FrontendDir = "$RootDir\frontend"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Nakshatra -- Starting Next.js Frontend" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

Set-Location $FrontendDir

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    npm install --silent
}

# Warn if contract addresses are missing
$EnvFile = "$FrontendDir\.env.local"
if (Test-Path $EnvFile) {
    $usdcLine = Get-Content $EnvFile |
        Where-Object { $_ -match "^NEXT_PUBLIC_USDC_ADDRESS=" } |
        Select-Object -First 1
    $usdcVal = if ($usdcLine) { ($usdcLine -split "=", 2)[1].Trim() } else { "" }
    if (-not $usdcVal) {
        Write-Host "WARNING: NEXT_PUBLIC_USDC_ADDRESS not set in frontend\.env.local" -ForegroundColor Yellow
        Write-Host "         Run .\deploy-contracts.ps1 first." -ForegroundColor Yellow
    }
}

Write-Host "Starting Next.js on http://localhost:3000" -ForegroundColor Green
Write-Host ""

npm run dev
