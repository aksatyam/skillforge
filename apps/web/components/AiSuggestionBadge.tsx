'use client';

import { Sparkles } from 'lucide-react';

/**
 * Placeholder for Phase 2's AI-suggested per-dimension score.
 * Sprint 3 ships manager scoring without AI input; when the AI scoring
 * job lands (Phase 2, feature #18) this component will read
 * `assessment.aiScore` / `ai_confidence` and render a contextual chip.
 */
export function AiSuggestionBadge({ dimension }: { dimension: string }) {
  return (
    <span
      title={`AI suggestion for "${dimension}" arrives in Phase 2`}
      className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-brand-medium"
    >
      <Sparkles size={10} />
      No AI suggestion yet (Phase 2)
    </span>
  );
}
