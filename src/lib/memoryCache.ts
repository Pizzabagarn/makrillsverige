// src/lib/memoryCache.ts
let lastUpdate = 0;
let cache: any = null;
const CACHE_DURATION = 20 * 60 * 60 * 1000; // 20 timmar

export function getGridFromCache() {
  if (Date.now() - lastUpdate < CACHE_DURATION) {
    return cache;
  }
  return null;
}

export function saveGridToCache(data: any) {
  cache = data;
  lastUpdate = Date.now();
}
