#!/usr/bin/env bash
# SkillForge — show status of local infra + services.

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()    { echo -e "  ${GREEN}●${NC} $*"; }
bad()   { echo -e "  ${RED}●${NC} $*"; }
maybe() { echo -e "  ${YELLOW}●${NC} $*"; }

echo "SkillForge local stack status"
echo "─────────────────────────────"

# Postgres
if brew services list 2>/dev/null | awk '$1=="postgresql@15"{print $2}' | grep -q started; then
  if pg_isready -q -h localhost -p 5432 2>/dev/null; then
    ok "Postgres 15 — running, accepting connections"
  else
    maybe "Postgres 15 — service started but not ready"
  fi
else
  bad "Postgres 15 — not running (try: pnpm local:up)"
fi

# Redis
if brew services list 2>/dev/null | awk '$1=="redis"{print $2}' | grep -q started; then
  if redis-cli ping >/dev/null 2>&1; then
    ok "Redis — running, responding to ping"
  else
    maybe "Redis — service started but not responding"
  fi
else
  bad "Redis — not running (try: pnpm local:up)"
fi

# DB existence
if psql -U "${USER}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='skillforge'" 2>/dev/null | grep -q 1; then
  ok "Database 'skillforge' exists"
else
  bad "Database 'skillforge' missing (try: pnpm local:up)"
fi

# Ports — simple check
check_port() {
  local port=$1
  local name=$2
  if lsof -iTCP:"$port" -sTCP:LISTEN -n -P 2>/dev/null | grep -q LISTEN; then
    ok "$name — listening on :$port"
  else
    maybe "$name — no listener on :$port (not started)"
  fi
}

echo ""
echo "Service ports:"
check_port 3000 "web (Next.js)"
check_port 4001 "assessment-service"
check_port 4002 "framework-service"
check_port 4003 "ai-evaluation"

echo ""
