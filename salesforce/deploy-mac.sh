#!/bin/bash
# Design to Next - deploy the builder extension to a Marketing Cloud Next org (Mac / Linux)
# Run:  bash deploy-mac.sh
set -e
cd "$(dirname "$0")"

echo ""
echo "Design to Next - deploy"
echo "Use a sandbox or developer org first, not a client's production org."
echo ""

if ! command -v sf >/dev/null 2>&1; then
  if command -v npm >/dev/null 2>&1; then
    echo "Installing the Salesforce CLI (one time, about 2 minutes)..."
    npm install --global @salesforce/cli
  else
    echo "The Salesforce CLI is not installed."
    echo "Install it from https://developer.salesforce.com/tools/salesforcecli, then run this script again."
    exit 1
  fi
fi

read -r -p "Is this org a sandbox? (Y/n) " answer
if [[ "$answer" =~ ^[nN] ]]; then instance="https://login.salesforce.com"; else instance="https://test.salesforce.com"; fi
echo "A browser window will open. Log in to the org and click Allow."
sf org login web --alias next-org --instance-url "$instance"

echo "Deploying Design to Next..."
sf project deploy start --source-dir force-app --target-org next-org

echo ""
echo "Done. Open an email in the Marketing Cloud Next builder and open the Design to Next extension."
