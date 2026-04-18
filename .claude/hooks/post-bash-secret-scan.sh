#!/usr/bin/env bash
# PostToolUse hook on Bash — scans Bash commands that were just run for
# accidental secret echoing (API keys, JWT secrets, DB passwords).
# Advisory — flags in conversation, does not block after-the-fact.

set -euo pipefail

INPUT="$(cat)"

CMD=$(printf '%s' "$INPUT" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null || echo "")

if [[ -z "$CMD" ]]; then
  exit 0
fi

# Patterns that look like secrets leaked in bash commands
SECRET_PATTERNS="sk-ant-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|postgres://[^@]+@|mongodb(\+srv)?://[^@]+@|JWT_SECRET\s*=\s*['\"]?[A-Za-z0-9]{20,}"

if printf '%s' "$CMD" | grep -qE "$SECRET_PATTERNS"; then
  cat <<EOF
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"⚠ SkillForge secret-scan: the bash command above appears to contain a secret-like token (Anthropic key, AWS key, DB URL with creds, or JWT secret). If this is a real secret that shouldn't be in transcripts, rotate it immediately. Production secrets belong in AWS Secrets Manager, never in shell history."}}
EOF
fi

exit 0
