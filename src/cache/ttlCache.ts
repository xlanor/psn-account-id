interface CacheEntry<V> {
  expiresAt: number;
  value: V;
}

export class TtlCache<K, V> {
  private readonly entries = new Map<K, CacheEntry<V>>();

  get(key: K): V | undefined {
    const entry = this.entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: K, value: V, ttlMs: number): void {
    this.entries.set(key, {
      expiresAt: Date.now() + ttlMs,
      value
    });
  }
}

