class MemoryCache {
  constructor() {
    this.store = new Map();
  }

  get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.data;
  }

  set(key, data, ttlSeconds) {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  delete(key) {
    this.store.delete(key);
  }

  deletePattern(pattern) {
    for (const key of this.store.keys()) {
      if (typeof pattern === "string" ? key.includes(pattern) : pattern.test(key)) {
        this.store.delete(key);
      }
    }
  }

  clear() {
    this.store.clear();
  }
}

export const memoryCache = new MemoryCache();
