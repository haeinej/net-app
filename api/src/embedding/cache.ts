/**
 * In-memory LRU cache for embeddings (max 1000 entries), keyed by text hash.
 */

import { createHash } from "node:crypto";

export type CacheKey = string;

export function cacheKey(text: string, prefix: string): CacheKey {
  return createHash("sha256").update(prefix + text).digest("hex").slice(0, 32);
}

interface Entry<T> {
  value: T;
  key: CacheKey;
}

/**
 * Simple LRU cache: oldest insertion is evicted when full.
 */
export class LRUCache<T> {
  private map = new Map<CacheKey, Entry<T>>();
  private order: CacheKey[] = [];
  constructor(private readonly maxSize: number) {}

  get(key: CacheKey): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    // Move to end (most recently used)
    const i = this.order.indexOf(key);
    if (i >= 0) {
      this.order.splice(i, 1);
      this.order.push(key);
    }
    return entry.value;
  }

  set(key: CacheKey, value: T): void {
    if (this.map.has(key)) {
      const i = this.order.indexOf(key);
      if (i >= 0) this.order.splice(i, 1);
    } else if (this.order.length >= this.maxSize) {
      const oldest = this.order.shift();
      if (oldest != null) this.map.delete(oldest);
    }
    this.map.set(key, { value, key });
    this.order.push(key);
  }
}
