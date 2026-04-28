# seed-wallets.ps1
# Re-seeds USDC to all test wallets.
# Requires USDC_ADDRESS to be set in backend/.env (done by deploy-contracts.ps1).

$ErrorActionPreference = "Stop"

$ScriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir       = Resolve-Path "$ScriptDir\.."
$BlockchainDir = "$RootDir\blockchain"
$BackendEnv    = "$RootDir\backend\.env"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Nakshatra -- Seeding Wallets with USDC" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

# Read USDC_ADDRESS from backend/.env
$UsdcAddress = $null
if (Test-Path $BackendEnv) {
    $line = Get-Content $BackendEnv |
        Where-Object { $_ -match "^USDC_ADDRESS=" } |
        Select-Object -First 1
    if ($line) { $UsdcAddress = ($line -split "=", 2)[1].Trim() }
}

if (-not $UsdcAddress) {
    Write-Host "ERROR: USDC_ADDRESS not set. Run deploy-contracts.ps1 first." -ForegroundColor Red
    exit 1
}

Write-Host "MockUSDC at: $UsdcAddress" -ForegroundColor Yellow

Set-Location $BlockchainDir
$env:USDC_ADDRESS = $UsdcAddress
npx hardhat run scripts/seedWallets.js --network localhost

Write-Host ""
Write-Host "Wallets seeded successfully." -ForegroundColor Green
