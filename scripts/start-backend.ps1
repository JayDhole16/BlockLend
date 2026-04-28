# start-backend.ps1
# Sets up the Python venv, creates the PostgreSQL database,
# then starts the FastAPI server with uvicorn.

$ErrorActionPreference = "Stop"

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir    = Resolve-Path "$ScriptDir\.."
$BackendDir = "$RootDir\backend"
$VenvDir    = "$BackendDir\.venv"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Nakshatra -- Starting FastAPI Backend" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

Set-Location $BackendDir

# -- Python venv -----------------------------------------------------------
if (-not (Test-Path $VenvDir)) {
    Write-Host "Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv $VenvDir
}

$PythonExe  = "$VenvDir\Scripts\python.exe"
$UvicornExe = "$VenvDir\Scripts\uvicorn.exe"

Write-Host "Installing Python dependencies..." -ForegroundColor Yellow
& $PythonExe -m pip install --quiet --upgrade pip
& $PythonExe -m pip install --quiet -r requirements.txt

# -- PostgreSQL ------------------------------------------------------------
$DbUrl = "postgresql+asyncpg://postgres:postgres@localhost:5432/nakshatra"
if (Test-Path ".env") {
    $line = Get-Content ".env" |
        Where-Object { $_ -match "^DATABASE_URL=" } |
        Select-Object -First 1
    if ($line) { $DbUrl = ($line -split "=", 2)[1].Trim() }
}
$DbName = ($DbUrl -split "/")[-1]

Write-Host "Ensuring PostgreSQL database '$DbName' exists..." -ForegroundColor Yellow

# Write a temp Python script to create the DB (avoids psql/createdb CLI dependency)
$TmpScript = "$env:TEMP\nakshatra_createdb.py"
@'
import psycopg2, sys
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
db = sys.argv[1]
connected = False
for pwd in ["postgres", "", "admin", "1234"]:
    try:
        conn = psycopg2.connect(host="localhost", user="postgres", password=pwd, dbname="postgres")
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db,))
        if not cur.fetchone():
            cur.execute("CREATE DATABASE " + db)
            print("Created database: " + db)
        else:
            print("Database already exists: " + db)
        conn.close()
        connected = True
        break
    except psycopg2.OperationalError:
        continue
if not connected:
    print("WARNING: Could not connect to PostgreSQL.")
    print("Open pgAdmin and create a database named: " + db)
'@ | Set-Content -Path $TmpScript -Encoding UTF8

$result = & $PythonExe $TmpScript $DbName 2>&1
if ($result -match "WARNING") {
    Write-Host "  $result" -ForegroundColor Yellow
} else {
    Write-Host "  $result" -ForegroundColor Green
}
Remove-Item $TmpScript -ErrorAction SilentlyContinue

# -- Check Hardhat node ----------------------------------------------------
Write-Host "Checking Hardhat node..." -ForegroundColor Yellow
$body = '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
try {
    $null = Invoke-RestMethod -Uri "http://127.0.0.1:8545" -Method Post `
        -ContentType "application/json" -Body $body -TimeoutSec 3
    Write-Host "  Hardhat node is reachable." -ForegroundColor Green
} catch {
    Write-Host "  WARNING: Hardhat node not reachable." -ForegroundColor Yellow
    Write-Host "  Run start-blockchain.ps1 and deploy-contracts.ps1 first." -ForegroundColor Yellow
}

# -- Start FastAPI ---------------------------------------------------------
Write-Host ""
Write-Host "Starting uvicorn on http://localhost:8000" -ForegroundColor Green
Write-Host "API docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""

& $UvicornExe app.main:app --host 0.0.0.0 --port 8000 --reload --log-level info
