#!/usr/bin/env bash
# SkillForge — start local dev infrastructure (Postgres 15 + Redis) via Homebrew.
# Idempotent: safe to run multiple times.

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[info]${NC} $*"; }
ok()    { echo -e "${GREEN}[ ok ]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
fail()  { echo -e "${RED}[fail]${NC} $*" >&2; exit 1; }

# ---- Prerequisites ----
command -v brew >/dev/null 2>&1 || fail "Homebrew not found. Install from https://brew.sh"
command -v pg_isready >/dev/null 2>&1 || warn "pg_isready not on PATH — will install postgresql@15"
command -v redis-cli  >/dev/null 2>&1 || warn "redis-cli not on PATH — will install redis"

# ---- Postgres 15 ----
if ! brew list postgresql@15 >/dev/null 2>&1; then
  info "Installing postgresql@15…"
  brew install postgresql@15
  brew link --force postgresql@15
fi

if brew services list | awk '$1=="postgresql@15"{print $2}' | grep -q started; then
  ok "postgresql@15 already running"
else
  info "Starting postgresql@15…"
  brew services start postgresql@15
  sleep 2
fi

# Wait for Postgres to accept connections
for i in $(seq 1 15); do
  if pg_isready -q -h localhost -p 5432 2>/dev/null; then
    ok "Postgres ready on localhost:5432"
    break
  fi
  if [ "$i" -eq 15 ]; then
    fail "Postgres did not become ready in 15s"
  fi
  sleep 1
done

# Create DB + two roles:
#   skillforge       - application role, RLS-enforced
#   skillforge_admin - admin role, BYPASSRLS (used for auth flows + audit writes)
PGUSER_DEFAULT="${USER}"
SKILLFORGE_APP_USER="skillforge"
SKILLFORGE_APP_PASS="skillforge"
SKILLFORGE_ADMIN_USER="skillforge_admin"
SKILLFORGE_ADMIN_PASS="skillforge_admin"
SKILLFORGE_DB="skillforge"
SKILLFORGE_SHADOW_DB="skillforge_shadow"

for role_info in "$SKILLFORGE_APP_USER:$SKILLFORGE_APP_PASS:no" "$SKILLFORGE_ADMIN_USER:$SKILLFORGE_ADMIN_PASS:yes"; do
  IFS=: read -r role pass bypass <<<"$role_info"
  if ! psql -U "$PGUSER_DEFAULT" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$role'" 2>/dev/null | grep -q 1; then
    info "Creating role $role…"
    psql -U "$PGUSER_DEFAULT" -d postgres -c "CREATE ROLE $role WITH LOGIN PASSWORD '$pass' CREATEDB;" >/dev/null
    ok "Created role $role"
  else
    ok "Role $role exists"
  fi
  if [ "$bypass" = "yes" ]; then
    psql -U "$PGUSER_DEFAULT" -d postgres -c "ALTER ROLE $role BYPASSRLS;" >/dev/null
    ok "Granted BYPASSRLS to $role"
  fi
done

for db in "$SKILLFORGE_DB" "$SKILLFORGE_SHADOW_DB"; do
  if ! psql -U "$PGUSER_DEFAULT" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" 2>/dev/null | grep -q 1; then
    info "Creating database $db…"
    psql -U "$PGUSER_DEFAULT" -d postgres -c "CREATE DATABASE $db OWNER $SKILLFORGE_ADMIN_USER;" >/dev/null
    ok "Created database $db"
  else
    ok "Database $db exists"
  fi
  # Ensure app role can use the DB (RLS will still filter their queries)
  psql -U "$PGUSER_DEFAULT" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE $db TO $SKILLFORGE_APP_USER;" >/dev/null
  psql -U "$PGUSER_DEFAULT" -d "$db" -c "GRANT ALL ON SCHEMA public TO $SKILLFORGE_APP_USER;" >/dev/null
  psql -U "$PGUSER_DEFAULT" -d "$db" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $SKILLFORGE_APP_USER;" >/dev/null
  psql -U "$PGUSER_DEFAULT" -d "$db" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $SKILLFORGE_APP_USER;" >/dev/null
done

# Ensure pgcrypto extension for gen_random_uuid()
psql -U "$PGUSER_DEFAULT" -d "$SKILLFORGE_DB" -c 'CREATE EXTENSION IF NOT EXISTS "pgcrypto";' >/dev/null
ok "pgcrypto extension available in $SKILLFORGE_DB"

# ---- Redis ----
if ! brew list redis >/dev/null 2>&1; then
  info "Installing redis…"
  brew install redis
fi

if brew services list | awk '$1=="redis"{print $2}' | grep -q started; then
  ok "redis already running"
else
  info "Starting redis…"
  brew services start redis
  sleep 1
fi

if redis-cli ping >/dev/null 2>&1; then
  ok "Redis ready on localhost:6379"
else
  fail "Redis did not respond to ping"
fi

# ---- .env bootstrap ----
ENV_FILE="$(dirname "$0")/../.env"
if [ ! -f "$ENV_FILE" ]; then
  info "Copying .env.example to .env (first-run)"
  cp "$(dirname "$0")/../.env.example" "$ENV_FILE"
  ok ".env created — review and edit secrets before deploying"
fi

echo ""
echo -e "${GREEN}─────────────────────────────────────────────${NC}"
echo -e "${GREEN}  SkillForge local stack is up${NC}"
echo -e "${GREEN}─────────────────────────────────────────────${NC}"
echo "  Postgres : localhost:5432 (db=$SKILLFORGE_DB, user=$SKILLFORGE_USER)"
echo "  Redis    : localhost:6379"
echo ""
echo "  Next steps:"
echo "    pnpm install           # install workspace deps"
echo "    pnpm db:migrate:dev    # run migrations"
echo "    pnpm db:seed           # seed Qualtech org + test users"
echo "    pnpm dev               # start all apps + services"
echo ""
