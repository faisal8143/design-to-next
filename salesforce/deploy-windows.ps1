# Design to Next - deploy the builder extension to a Marketing Cloud Next org (Windows)
# Right-click this file > "Run with PowerShell", or run:  powershell -ExecutionPolicy Bypass -File deploy-windows.ps1

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host ""
Write-Host "Design to Next - deploy" -ForegroundColor Cyan
Write-Host "Use a sandbox or developer org first, not a client's production org." -ForegroundColor Yellow
Write-Host ""

# 1. Salesforce CLI
if (-not (Get-Command sf -ErrorAction SilentlyContinue)) {
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        Write-Host "Installing the Salesforce CLI (one time, about 2 minutes)..."
        npm install --global @salesforce/cli
    } else {
        Write-Host "The Salesforce CLI is not installed." -ForegroundColor Red
        Write-Host "Install it from https://developer.salesforce.com/tools/salesforcecli, then run this script again."
        Read-Host "Press Enter to close"
        exit 1
    }
}

# 2. Log in
$answer = Read-Host "Is this org a sandbox? (Y/n)"
$instance = if ($answer -match '^[nN]') { "https://login.salesforce.com" } else { "https://test.salesforce.com" }
Write-Host "A browser window will open. Log in to the org and click Allow."
sf org login web --alias next-org --instance-url $instance

# 3. Deploy
Write-Host "Deploying Design to Next..."
sf project deploy start --source-dir force-app --target-org next-org

Write-Host ""
Write-Host "Done. Open an email in the Marketing Cloud Next builder and open the Design to Next extension." -ForegroundColor Green
Read-Host "Press Enter to close"
