/** Tiny in-memory TTL cache. Phase 2 can swap this for DB/Upstash behind the same interface. */
export interface SearchCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
}

export function createMemoryCache<T>(ttlMs: number, now: () => number = Date.now): SearchCache<T> {
  const store = new Map<string, { value: T; expiresAt: number }>();
  return {
    get(key) {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (hit.expiresAt <= now()) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value) {
      store.set(key, { value, expiresAt: now() + ttlMs });
      if (store.size > 500) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
    },
  };
}
