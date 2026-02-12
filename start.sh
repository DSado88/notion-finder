#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# 1. Check Node
if ! command -v node &>/dev/null; then
  echo "Error: Node.js is not installed. Install it from https://nodejs.org"
  exit 1
fi

# 2. Install deps if needed
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

# 3. Check env
if [ ! -f .env.local ]; then
  if [ -f .env.example ]; then
    cp .env.example .env.local
    echo "Created .env.local from .env.example"
    echo "Edit .env.local and add your NOTION_API_TOKEN, then re-run this script."
    exit 1
  else
    echo "Error: .env.local not found. Copy .env.example to .env.local and fill in your tokens."
    exit 1
  fi
fi

if ! grep -q 'NOTION_API_TOKEN=ntn_' .env.local; then
  echo "Warning: NOTION_API_TOKEN doesn't look set in .env.local"
  echo "Edit .env.local and add your Notion integration token (starts with ntn_)."
  exit 1
fi

# 4. Start
echo "Starting Notion Finder on http://localhost:3099"
npm run dev
