#!/usr/bin/env bash
# PreToolUse hook — blocks edits to AI prompt files that include raw PII fields
# (user.name, user.email, user.phone) without going through an anonymize() helper.
# Per AI governance rule #2: no PII in Claude API calls.

set -euo pipefail

INPUT="$(cat)"

FILE_PATH=$(printf '%s' "$INPUT" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null || echo "")

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Only check prompt files and AI evaluation code
if [[ "$FILE_PATH" != *"/prompts/"* ]] && [[ "$FILE_PATH" != *"/ai-evaluation/"* ]]; then
  exit 0
fi

NEW_CONTENT=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
ti = d.get('tool_input', {})
print(ti.get('content') or ti.get('new_string') or '')
" 2>/dev/null || echo "")

# Patterns that suggest raw PII usage
if printf '%s' "$NEW_CONTENT" | grep -qE "user\.(name|email|phone|firstName|lastName|address)"; then
  # If anonymize/stripPii is NOT present in the same block, block
  if ! printf '%s' "$NEW_CONTENT" | grep -qE "anonymize|stripPii|hashUserId|redact"; then
    cat <<EOF
{"decision":"block","reason":"SkillForge AI-governance violation: this prompt/AI-evaluation file references raw user PII (user.name / user.email / user.phone) without an anonymize() or stripPii() helper. Per plan §7.4 and memory feedback_ai_governance.md, all Claude API inputs must use opaque user IDs (e.g., user_<sha256(id)>) and strip name/email/phone. Refactor to pass anonymized identifiers, or add an explicit anonymize() call in this code path."}
EOF
    exit 0
  fi
fi

exit 0
