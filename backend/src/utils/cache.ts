// In-memory cache implementation

interface CacheEntry<T> {
  value: T;
  createdAt: number;
  ttl?: number;
}

class MemoryCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  set<T>(key: string, value: T, ttlSeconds?: number): void {
    this.cache.set(key, {
      value,
      createdAt: Date.now(),
      ttl: ttlSeconds ? ttlSeconds * 1000 : undefined
    });
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.ttl && Date.now() - entry.createdAt > entry.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  // Delete all keys matching a pattern
  deletePattern(pattern: string): number {
    let deleted = 0;
    const regex = new RegExp(pattern);

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deleted++;
      }
    }

    return deleted;
  }

  clear(): void {
    this.cache.clear();
  }
  size(): number {
    return this.cache.size;
  }
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.ttl && now - entry.createdAt > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// Singleton instance
export const cache = new MemoryCache();

// Cache key generators
export const cacheKeys = {
  user: (userId: string) => `user:${userId}`,
  organization: (orgId: string) => `org:${orgId}`,
  dashboard: (dashboardId: string) => `dashboard:${dashboardId}`,
  dashboardWidgets: (dashboardId: string) => `dashboard:${dashboardId}:widgets`,
  userDashboards: (userId: string) => `user:${userId}:dashboards`,
  orgAnalytics: (orgId: string, period: string) => `org:${orgId}:analytics:${period}`,
  orgUsers: (orgId: string) => `org:${orgId}:users`,
  apiKey: (key: string) => `apikey:${key}`,
};

// Common cache patterns
export async function cacheOrFetch<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number = 300
): Promise<T> {
  const cached = cache.get<T>(key);

  if (cached !== undefined) {
    return cached;
  }

  const value = await fetchFn();
  cache.set(key, value, ttlSeconds);
  return value;
}

export async function prefetchToCache<T>(
  items: Array<{ key: string; fetchFn: () => Promise<T> }>,
  ttlSeconds: number = 300
): Promise<void> {
  await Promise.all(
    items.map(async ({ key, fetchFn }) => {
      try {
        const value = await fetchFn();
        cache.set(key, value, ttlSeconds);
      } catch (error) {
        console.log(`Failed to prefetch ${key}`);
      }
    })
  );
}

// Evict expired cache entries periodically so memory does not grow without bound.
setInterval(() => {
  cache.cleanup();
}, 5 * 60 * 1000);
