/**
 * Tiny TTL map for L1 flag cache.
 *
 * Why not reuse `lru-cache`? — overkill. We store at most |FLAGS| × |orgs| × 2
 * (org-scope, user-scope) entries with ~100-byte payloads. A plain Map with
 * timestamps is simpler and avoids pulling a 30 kB dep into every service.
 *
 * Thread-safety: Node.js is single-threaded per event-loop iteration, so
 * concurrent async calls cannot interleave within a single `get`/`set`.
 * Multi-replica coordination is Redis's job (L2) + future pub/sub invalidate.
 */
export class TtlCache<V> {
  private readonly store = new Map<string, { value: V; expiresAt: number }>();

  constructor(private readonly defaultTtlMs: number) {
    if (defaultTtlMs <= 0) {
      throw new Error(`TtlCache: defaultTtlMs must be > 0, got ${defaultTtlMs}`);
    }
  }

  get(key: string, now: number = Date.now()): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.store.delete(key); // lazy eviction — no timer, no GC pressure
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V, ttlMs?: number, now: number = Date.now()): void {
    const ttl = ttlMs ?? this.defaultTtlMs;
    this.store.set(key, { value, expiresAt: now + ttl });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  /** For tests / debug only. Not for production decision-making. */
  size(): number {
    return this.store.size;
  }
}
