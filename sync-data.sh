#!/usr/bin/env bash
# Nexus Data Sync — push/pull nexus-data.json via a private git repo
# See sync.md for setup instructions.
set -euo pipefail
cd "$(dirname "$0")"

echo ""
echo "========================================"
echo "  Nexus Data Sync"
echo "========================================"
echo ""

if ! command -v git &>/dev/null; then
  echo "ERROR: git is not installed."
  exit 1
fi

if [ ! -d ".git" ]; then
  echo "ERROR: This folder is not a Git repository."
  echo "See sync.md for setup instructions."
  exit 1
fi

# Step 1: Pull
echo "[1/3] Pulling latest data from remote..."
git pull origin main

# Step 2: Stage nexus-data.json
echo ""
echo "[2/3] Checking for local changes..."
git add nexus-data.json

if git diff --cached --quiet; then
  echo "      No local changes to push."
else
  # Step 3: Commit and push
  echo ""
  echo "[3/3] Committing and pushing..."
  git commit -m "sync $(date '+%Y-%m-%d %H:%M')"
  git push origin main
fi

echo ""
echo "========================================"
echo "  Sync complete!"
echo ""
echo "  On your other device: run this script"
echo "  to pull the latest data before opening"
echo "  Nexus."
echo "========================================"
