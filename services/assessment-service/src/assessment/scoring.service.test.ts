import { describe, it, expect } from 'vitest';
import { Prisma } from '@skillforge/db';
import { ScoringService } from './scoring.service';

const D = (n: number) => new Prisma.Decimal(n);

describe('ScoringService.computeComposite', () => {
  const svc = new ScoringService();
  const defaultWeights = { self: 0.15, manager: 0.5, peer: 0.2, ai: 0.15 };

  it('computes the weighted average when all components are present', () => {
    const c = svc.computeComposite(
      { self: D(3), manager: D(4), peer: D(3.5), ai: D(4.2) },
      defaultWeights,
    );
    expect(c).toBeCloseTo(0.15 * 3 + 0.5 * 4 + 0.2 * 3.5 + 0.15 * 4.2, 2);
  });

  it('renormalizes weights when peer + ai are missing (Phase 1 case)', () => {
    const c = svc.computeComposite(
      { self: D(3), manager: D(4) },
      defaultWeights,
    );
    // Only self + manager present: (0.15*3 + 0.5*4) / (0.15+0.5) ≈ 3.77
    const expected = (0.15 * 3 + 0.5 * 4) / (0.15 + 0.5);
    expect(c).toBeCloseTo(expected, 2);
  });

  it('returns null when no components are present', () => {
    expect(svc.computeComposite({}, defaultWeights)).toBeNull();
  });

  it('handles a manager-only score (no self-assessment yet)', () => {
    const c = svc.computeComposite({ manager: D(3.8) }, defaultWeights);
    expect(c).toBeCloseTo(3.8, 2);
  });

  it('returns null when all provided weights are zero', () => {
    const c = svc.computeComposite(
      { self: D(3) },
      { self: 0, manager: 0, peer: 0, ai: 0 },
    );
    expect(c).toBeNull();
  });

  it('preserves precision to 2 decimals', () => {
    const c = svc.computeComposite(
      { self: D(3.333), manager: D(3.667) },
      { self: 0.5, manager: 0.5, peer: 0, ai: 0 },
    );
    expect(c).toBe(3.5);
  });
});
