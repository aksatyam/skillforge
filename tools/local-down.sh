#!/usr/bin/env bash
# SkillForge — stop local dev infrastructure.
# Does NOT drop databases (use `pnpm db:reset` for that).

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[info]${NC} $*"; }
ok()    { echo -e "${GREEN}[ ok ]${NC} $*"; }

info "Stopping postgresql@15…"
brew services stop postgresql@15 >/dev/null || true
ok "postgresql@15 stopped"

info "Stopping redis…"
brew services stop redis >/dev/null || true
ok "redis stopped"

echo ""
echo "SkillForge local stack is down. Data is preserved."
echo "To fully reset DB: pnpm db:reset"
