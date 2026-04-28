# deploy-contracts.ps1
# Deploys all contracts to the running Hardhat node, then writes the
# resulting addresses into backend/.env and frontend/.env.local.

$ErrorActionPreference = "Stop"

$ScriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir       = Resolve-Path "$ScriptDir\.."
$BlockchainDir = "$RootDir\blockchain"
$BackendEnv    = "$RootDir\backend\.env"
$FrontendEnv   = "$RootDir\frontend\.env.local"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Nakshatra -- Deploying Contracts" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

# -- Helper: update or append a key=value in an env file ------------------
function Set-EnvValue {
    param([string]$File, [string]$Key, [string]$Value)
    $content = if (Test-Path $File) { Get-Content $File -Raw } else { "" }
    if ($content -match "(?m)^${Key}=.*") {
        $content = $content -replace "(?m)^${Key}=.*", "${Key}=${Value}"
    } else {
        $content = $content.TrimEnd() + "`n${Key}=${Value}`n"
    }
    Set-Content -Path $File -Value $content -NoNewline
}

# -- Helper: parse a contract address from deploy output ------------------
function Get-ContractAddress {
    param([string]$Output, [string]$Label)
    $line = $Output -split "`n" |
        Where-Object { $_ -match [regex]::Escape($Label) } |
        Select-Object -Last 1
    if ($line -match '(0x[0-9a-fA-F]{40})') { return $Matches[1] }
    return $null
}

# -- Wait for Hardhat node -------------------------------------------------
Write-Host "Waiting for Hardhat node at http://127.0.0.1:8545..." -ForegroundColor Yellow

$body  = '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
$ready = $false
for ($i = 1; $i -le 30; $i++) {
    try {
        $null = Invoke-RestMethod -Uri "http://127.0.0.1:8545" -Method Post `
            -ContentType "application/json" -Body $body -TimeoutSec 2
        Write-Host "  Node is ready." -ForegroundColor Green
        $ready = $true
        break
    } catch {
        Write-Host -NoNewline "."
        Start-Sleep -Seconds 1
    }
}
if (-not $ready) {
    Write-Host ""
    Write-Host "ERROR: Hardhat node did not respond within 30 seconds." -ForegroundColor Red
    Write-Host "       Run .\start-blockchain.ps1 in a separate terminal first." -ForegroundColor Red
    exit 1
}

# -- Run deploy ------------------------------------------------------------
Set-Location $BlockchainDir
Write-Host "Running deploy.js..." -ForegroundColor Yellow

$DeployOutput = npx hardhat run scripts/deploy.js --network localhost 2>&1 | Out-String
Write-Host $DeployOutput

# -- Parse addresses -------------------------------------------------------
$UsdcAddr       = Get-ContractAddress $DeployOutput "MockUSDC:"
$NftAddr        = Get-ContractAddress $DeployOutput "UserProfileNFT:"
$FactoryAddr    = Get-ContractAddress $DeployOutput "LoanFactory:"
$ReputationAddr = Get-ContractAddress $DeployOutput "Reputation:"
$EscrowAddr     = Get-ContractAddress $DeployOutput "Escrow:"

if (-not $UsdcAddr) {
    Write-Host "ERROR: Could not parse contract addresses from deploy output." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Parsed Addresses" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  USDC:           $UsdcAddr"
Write-Host "  UserProfileNFT: $NftAddr"
Write-Host "  LoanFactory:    $FactoryAddr"
Write-Host "  Reputation:     $ReputationAddr"
Write-Host "  Escrow:         $EscrowAddr"

# -- Write backend/.env ----------------------------------------------------
Write-Host ""
Write-Host "Writing addresses to backend\.env..." -ForegroundColor Yellow

Set-EnvValue $BackendEnv "USDC_ADDRESS"             $UsdcAddr
Set-EnvValue $BackendEnv "USER_PROFILE_NFT_ADDRESS" $NftAddr
Set-EnvValue $BackendEnv "LOAN_FACTORY_ADDRESS"     $FactoryAddr
Set-EnvValue $BackendEnv "REPUTATION_ADDRESS"       $ReputationAddr
Set-EnvValue $BackendEnv "ESCROW_ADDRESS"           $EscrowAddr

Write-Host "  backend\.env updated" -ForegroundColor Green

# -- Write frontend/.env.local ---------------------------------------------
Write-Host "Writing addresses to frontend\.env.local..." -ForegroundColor Yellow

if (-not (Test-Path $FrontendEnv)) {
    New-Item -ItemType File -Path $FrontendEnv -Force | Out-Null
}

Set-EnvValue $FrontendEnv "NEXT_PUBLIC_USDC_ADDRESS"         $UsdcAddr
Set-EnvValue $FrontendEnv "NEXT_PUBLIC_LOAN_FACTORY_ADDRESS" $FactoryAddr
Set-EnvValue $FrontendEnv "NEXT_PUBLIC_ESCROW_ADDRESS"       $EscrowAddr
Set-EnvValue $FrontendEnv "NEXT_PUBLIC_BACKEND_URL"          "http://localhost:8000"

Write-Host "  frontend\.env.local updated" -ForegroundColor Green

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Deployment complete." -ForegroundColor Green
Write-Host "  Next: run .\start-backend.ps1" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
