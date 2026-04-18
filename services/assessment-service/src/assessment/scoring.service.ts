import { Injectable } from '@nestjs/common';
import { Prisma } from '@skillforge/db';

/**
 * Composite score engine.
 *
 * composite = (w_self × self) + (w_manager × manager) + (w_peer × peer) + (w_ai × ai)
 *
 * Weights live in org.settings_json.assessmentWeights. Defaults (ADR context):
 *   self:    0.15
 *   manager: 0.50
 *   peer:    0.20
 *   ai:      0.15
 *
 * Missing component scores drop out; remaining weights are re-normalized so
 * the output is always on the same 0–5 scale. This lets Phase 1 (no AI, no peer)
 * produce a composite using only self + manager.
 */
@Injectable()
export class ScoringService {
  computeComposite(
    scores: {
      self?: Prisma.Decimal | null;
      manager?: Prisma.Decimal | null;
      peer?: Prisma.Decimal | null;
      ai?: Prisma.Decimal | null;
    },
    weights: { self: number; manager: number; peer: number; ai: number },
  ): number | null {
    const components: Array<{ score: number; weight: number }> = [];
    if (scores.self != null) components.push({ score: +scores.self, weight: weights.self });
    if (scores.manager != null)
      components.push({ score: +scores.manager, weight: weights.manager });
    if (scores.peer != null) components.push({ score: +scores.peer, weight: weights.peer });
    if (scores.ai != null) components.push({ score: +scores.ai, weight: weights.ai });

    if (components.length === 0) return null;

    const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
    if (totalWeight === 0) return null;

    const weighted = components.reduce((sum, c) => sum + c.score * c.weight, 0);
    return +(weighted / totalWeight).toFixed(2);
  }
}
