# start-blockchain.ps1
# Starts the Hardhat local node in the foreground.
# Run this in its own terminal - it must stay alive for the other scripts.

$ErrorActionPreference = "Stop"

$ScriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$BlockchainDir = Resolve-Path "$ScriptDir\..\blockchain"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Nakshatra -- Starting Hardhat Node" -ForegroundColor Cyan
Write-Host "  RPC: http://127.0.0.1:8545  Chain ID: 31337" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

Set-Location $BlockchainDir

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing blockchain dependencies..." -ForegroundColor Yellow
    npm install --silent
}

Write-Host "Starting Hardhat node..." -ForegroundColor Green
npx hardhat node
