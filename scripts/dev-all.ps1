# dev-all.ps1
# Orchestrates the full local dev stack:
#   1. Hardhat node     (new window)
#   2. Deploy contracts (inline - writes .env files)
#   3. PostgreSQL check (inline)
#   4. FastAPI backend  (new window)
#   5. Next.js frontend (this window - stays open)
#
# Usage from nakshatra-lending\:
#   npm run dev:all
#   .\scripts\dev-all.ps1

$ErrorActionPreference = "Stop"

$ScriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir       = Resolve-Path "$ScriptDir\.."
$BlockchainDir = "$RootDir\blockchain"
$BackendDir    = "$RootDir\backend"
$FrontendDir   = "$RootDir\frontend"
$VenvDir       = "$BackendDir\.venv"

# -- Helpers ---------------------------------------------------------------

function Write-Step([string]$msg) {
    Write-Host ""
    Write-Host "=======================================================" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "=======================================================" -ForegroundColor Cyan
}

function Wait-ForRpc([int]$Retries = 30) {
    Write-Host -NoNewline "  Waiting for Hardhat RPC"
    $body = '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
    for ($i = 1; $i -le $Retries; $i++) {
        try {
            $null = Invoke-RestMethod -Uri "http://127.0.0.1:8545" -Method Post `
                -ContentType "application/json" -Body $body -TimeoutSec 2
            Write-Host " OK" -ForegroundColor Green
            return
        } catch {
            Write-Host -NoNewline "."
            Start-Sleep -Seconds 1
        }
    }
    Write-Host " TIMEOUT" -ForegroundColor Red
    throw "Hardhat node did not start within $Retries seconds."
}

function Wait-ForPort([string]$Name, [int]$Port, [int]$Retries = 30) {
    Write-Host -NoNewline "  Waiting for $Name on port $Port"
    for ($i = 1; $i -le $Retries; $i++) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $tcp.Connect("127.0.0.1", $Port)
            $tcp.Close()
            Write-Host " OK" -ForegroundColor Green
            return
        } catch {
            Write-Host -NoNewline "."
            Start-Sleep -Seconds 1
        }
    }
    Write-Host " TIMEOUT" -ForegroundColor Yellow
}

function Set-EnvValue([string]$File, [string]$Key, [string]$Value) {
    $content = if (Test-Path $File) { Get-Content $File -Raw } else { "" }
    if ($content -match "(?m)^${Key}=.*") {
        $content = $content -replace "(?m)^${Key}=.*", "${Key}=${Value}"
    } else {
        $content = $content.TrimEnd() + "`n${Key}=${Value}`n"
    }
    Set-Content -Path $File -Value $content -NoNewline
}

function Get-ContractAddress([string]$Output, [string]$Label) {
    $line = $Output -split "`n" |
        Where-Object { $_ -match [regex]::Escape($Label) } |
        Select-Object -Last 1
    if ($line -match '(0x[0-9a-fA-F]{40})') { return $Matches[1] }
    return $null
}

# -------------------------------------------------------------------------
# STEP 1 - Hardhat node (new window)
# -------------------------------------------------------------------------
Write-Step "[1/5] Starting Hardhat node"

Set-Location $BlockchainDir
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing blockchain dependencies..." -ForegroundColor Yellow
    npm install --silent
}

$HardhatCmd = "Set-Location '$BlockchainDir'; npx hardhat node"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $HardhatCmd

Write-Host "  Hardhat node launched in a new window." -ForegroundColor Green
Wait-ForRpc 30

# -------------------------------------------------------------------------
# STEP 2 - Deploy contracts
# -------------------------------------------------------------------------
Write-Step "[2/5] Deploying contracts"

Set-Location $BlockchainDir
Write-Host "Running deploy.js..." -ForegroundColor Yellow

$DeployOutput = npx hardhat run scripts/deploy.js --network localhost 2>&1 | Out-String

$DeployOutput -split "`n" |
    Where-Object { $_ -match "(MockUSDC|UserProfileNFT|LoanFactory|Reputation|Escrow|Wiring|Done)" } |
    ForEach-Object { Write-Host "  $_" }

$UsdcAddr       = Get-ContractAddress $DeployOutput "MockUSDC:"
$NftAddr        = Get-ContractAddress $DeployOutput "UserProfileNFT:"
$FactoryAddr    = Get-ContractAddress $DeployOutput "LoanFactory:"
$ReputationAddr = Get-ContractAddress $DeployOutput "Reputation:"
$EscrowAddr     = Get-ContractAddress $DeployOutput "Escrow:"

if (-not $UsdcAddr) {
    Write-Host "ERROR: Deploy failed. Full output:" -ForegroundColor Red
    Write-Host $DeployOutput
    exit 1
}

Write-Host ""
Write-Host "  MockUSDC:       $UsdcAddr"
Write-Host "  UserProfileNFT: $NftAddr"
Write-Host "  LoanFactory:    $FactoryAddr"
Write-Host "  Reputation:     $ReputationAddr"
Write-Host "  Escrow:         $EscrowAddr"

$BackendEnv  = "$BackendDir\.env"
$FrontendEnv = "$FrontendDir\.env.local"

Set-EnvValue $BackendEnv "USDC_ADDRESS"             $UsdcAddr
Set-EnvValue $BackendEnv "USER_PROFILE_NFT_ADDRESS" $NftAddr
Set-EnvValue $BackendEnv "LOAN_FACTORY_ADDRESS"     $FactoryAddr
Set-EnvValue $BackendEnv "REPUTATION_ADDRESS"       $ReputationAddr
Set-EnvValue $BackendEnv "ESCROW_ADDRESS"           $EscrowAddr
Write-Host "  backend\.env updated" -ForegroundColor Green

if (-not (Test-Path $FrontendEnv)) {
    New-Item -ItemType File -Path $FrontendEnv -Force | Out-Null
}
Set-EnvValue $FrontendEnv "NEXT_PUBLIC_USDC_ADDRESS"         $UsdcAddr
Set-EnvValue $FrontendEnv "NEXT_PUBLIC_LOAN_FACTORY_ADDRESS" $FactoryAddr
Set-EnvValue $FrontendEnv "NEXT_PUBLIC_ESCROW_ADDRESS"       $EscrowAddr
Set-EnvValue $FrontendEnv "NEXT_PUBLIC_BACKEND_URL"          "http://localhost:8000"
Write-Host "  frontend\.env.local updated" -ForegroundColor Green

# -------------------------------------------------------------------------
# STEP 3 - PostgreSQL
# -------------------------------------------------------------------------
Write-Step "[3/5] PostgreSQL"

$DbUrl = "postgresql+asyncpg://postgres:postgres@localhost:5432/nakshatra"
if (Test-Path $BackendEnv) {
    $dbLine = Get-Content $BackendEnv |
        Where-Object { $_ -match "^DATABASE_URL=" } |
        Select-Object -First 1
    if ($dbLine) { $DbUrl = ($dbLine -split "=", 2)[1].Trim() }
}
$DbName = ($DbUrl -split "/")[-1]

Write-Host "Checking database '$DbName'..." -ForegroundColor Yellow
try {
    $null = psql -U postgres -c "\q" -d $DbName 2>&1
    Write-Host "  Database '$DbName' exists." -ForegroundColor Green
} catch {
    try {
        createdb -U postgres $DbName 2>&1 | Out-Null
        Write-Host "  Created database '$DbName'." -ForegroundColor Green
    } catch {
        Write-Host "  WARNING: Could not verify/create database '$DbName'." -ForegroundColor Yellow
        Write-Host "  Make sure PostgreSQL is running, then run: createdb -U postgres $DbName" -ForegroundColor Yellow
    }
}

# -------------------------------------------------------------------------
# STEP 4 - FastAPI backend (new window)
# -------------------------------------------------------------------------
Write-Step "[4/5] Starting FastAPI backend"

Set-Location $BackendDir

if (-not (Test-Path $VenvDir)) {
    Write-Host "Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv $VenvDir
}

$PythonExe  = "$VenvDir\Scripts\python.exe"
$UvicornExe = "$VenvDir\Scripts\uvicorn.exe"

Write-Host "Installing Python dependencies..." -ForegroundColor Yellow
& $PythonExe -m pip install --quiet --upgrade pip
& $PythonExe -m pip install --quiet -r requirements.txt

$BackendCmd = "Set-Location '$BackendDir'; & '$UvicornExe' app.main:app --host 0.0.0.0 --port 8000 --reload --log-level info"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $BackendCmd

Write-Host "  FastAPI launched in a new window." -ForegroundColor Green
Wait-ForPort "FastAPI" 8000 30
Write-Host "  API docs: http://localhost:8000/docs" -ForegroundColor Cyan

# -------------------------------------------------------------------------
# STEP 5 - Next.js frontend (this window)
# -------------------------------------------------------------------------
Write-Step "[5/5] Starting Next.js frontend"

Set-Location $FrontendDir

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    npm install --silent
}

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Green
Write-Host "  All services started" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
Write-Host "  Frontend : http://localhost:3000"
Write-Host "  Backend  : http://localhost:8000"
Write-Host "  API docs : http://localhost:8000/docs"
Write-Host "  Hardhat  : http://127.0.0.1:8545  (Chain ID: 31337)"
Write-Host ""
Write-Host "  Hardhat + Backend are running in separate windows."
Write-Host "  Close those windows or press Ctrl+C here to stop."
Write-Host "=======================================================" -ForegroundColor Green
Write-Host ""

npm run dev
