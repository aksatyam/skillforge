#!/usr/bin/env bash
# UserPromptSubmit hook — detects SkillForge phase/feature keywords in the user's
# message and injects the relevant Phase roadmap slice into the context.
# Keeps phase priorities top-of-mind without Claude having to search memory.

set -euo pipefail

INPUT="$(cat)"

PROMPT=$(printf '%s' "$INPUT" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('prompt','').lower())" 2>/dev/null || echo "")

# No prompt? Exit clean.
if [[ -z "$PROMPT" ]]; then
  exit 0
fi

PHASE1_KEYWORDS="self-assessment|self assessment|manager assessment|composite score|rbac|framework engine|artifact upload|assessment cycle|csv export|employee scorecard|team dashboard|hr dashboard"
PHASE2_KEYWORDS="artifact analysis|ai score|peer feedback|peer review|skill gap|learning path|prompt library|bias detection|hrms integration|lms|mobile app|react native"
PHASE3_KEYWORDS="multi-tenant|multi tenant|tenant provision|billing|stripe|razorpay|white-label|marketplace|soc 2|iso 27001|self-service|onboarding wizard"

MATCH=""
if printf '%s' "$PROMPT" | grep -qiE "$PHASE1_KEYWORDS"; then
  MATCH="Phase 1 (MVP, Weeks 1–8) — target May 2026 appraisal cycle. Check reference memory for P0 vs P1 per feature."
elif printf '%s' "$PROMPT" | grep -qiE "$PHASE2_KEYWORDS"; then
  MATCH="Phase 2 (AI Intelligence, Weeks 9–16). Subject to Phase 1 shipping on time — flag if user is trying to pull Phase 2 work into the MVP window."
elif printf '%s' "$PROMPT" | grep -qiE "$PHASE3_KEYWORDS"; then
  MATCH="Phase 3 (SaaS & Scale, Weeks 17–24). SOC 2 / ISO 27001 compliance work lives here; multi-tenant productization assumes Phase 1 + 2 shipped."
fi

if [[ -n "$MATCH" ]]; then
  cat <<EOF
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"SkillForge phase context: $MATCH"}}
EOF
fi

exit 0
