// A small in-memory cache with an expiry time ("TTL") per entry.
//
// Two jobs:
//  1. If the same weather was fetched recently, reuse it instead of asking Open-Meteo again.
//  2. If 50 people ask for the same new city at the same moment, only ONE request goes out
//     and everyone shares the answer ("in-flight de-duplication").
//
// It lives in the server's memory, so it resets when the server restarts. That's fine for
// one server. If you ever run several servers, swap this for Redis.
class TtlCache {
  constructor(maxEntries = 500) {
    this.store = new Map();
    this.inflight = new Map();
    this.maxEntries = maxEntries;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, ttlMs) {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;   // Maps remember insertion order
      this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: Date.now() + ttlMs });
  }

  // "Give me the cached value, or run fetcher() to get it and remember it."
  async remember(key, ttlMs, fetcher) {
    const hit = this.get(key);
    if (hit !== undefined) return hit;

    if (this.inflight.has(key)) return this.inflight.get(key);

    const promise = (async () => {
      try {
        const value = await fetcher();
        this.set(key, value, ttlMs);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    return promise;
  }

  clear() {
    this.store.clear();
    this.inflight.clear();
  }
}

module.exports = { TtlCache };
