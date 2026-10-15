#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node -e 'if(Number(process.versions.node.split(".")[0])<24)process.exit(1)'
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  chmod 600 .env.local
fi
npm ci
exec npm run dev
