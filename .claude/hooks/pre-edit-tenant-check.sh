#!/usr/bin/env bash
# PreToolUse hook for Edit/Write — warns before modifying tenant-sensitive files
# without visible org_id references. Advisory only (non-blocking) — emits context.

set -euo pipefail

INPUT="$(cat)"

# Extract the file path from the Edit/Write tool input (JSON)
FILE_PATH=$(printf '%s' "$INPUT" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null || echo "")

# Exit cleanly if no path (nothing to check)
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Only scan backend source and migration files
if [[ "$FILE_PATH" != *"/backend/"* ]] && [[ "$FILE_PATH" != *"/migrations/"* ]]; then
  exit 0
fi

# Skip non-code files
case "$FILE_PATH" in
  *.ts|*.js|*.sql|*.py) ;;
  *) exit 0 ;;
esac

# Extract the new content being written (for Write) or the new_string (for Edit)
NEW_CONTENT=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
ti = d.get('tool_input', {})
print(ti.get('content') or ti.get('new_string') or '')
" 2>/dev/null || echo "")

TENANT_KEYWORDS="org_id|orgId|tenantId|tenant_id|CurrentTenant|TenantGuard|AllowCrossTenant"
RISKY_KEYWORDS="findMany|findOne|findFirst|\.find\(|\.update\(|\.delete\(|CREATE TABLE|SELECT|UPDATE|DELETE FROM"

if printf '%s' "$NEW_CONTENT" | grep -qiE "$RISKY_KEYWORDS"; then
  if ! printf '%s' "$NEW_CONTENT" | grep -qiE "$TENANT_KEYWORDS"; then
    cat <<EOF
{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"⚠ SkillForge tenant-isolation reminder: this edit touches a backend/migration file with a DB-query-like pattern but no visible org_id/orgId/tenant reference. Verify that tenant scoping is enforced (either explicitly in this block, via a base repository, or via a TenantGuard at the controller). If this is an intentional cross-tenant admin operation, annotate with // @allow-cross-tenant: <reason>."}}
EOF
  fi
fi

exit 0
