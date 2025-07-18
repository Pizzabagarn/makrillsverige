// Service Worker för Makrillsverige - Bildcachning med daglig uppdatering
const CACHE_NAME = 'makrillsverige-v1';
const CACHE_EXPIRY = 20 * 60 * 60 * 1000; // 20 timmar (bilderna uppdateras dagligen)

// Filer som ska cachas aggressivt
const CACHE_PATTERNS = [
  /\/data\/.*\.(png|jpg|jpeg|gif|webp)$/,
  /\/data\/.*metadata\.json$/,
  /\/data\/.*\.geojson$/,
  /\/data\/.*\.json\.gz$/,
];

// Installera service worker
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Aktivera service worker
self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

// Intercept fetch requests
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Endast hantera GET requests för våra cache-patterns
  if (event.request.method !== 'GET') return;
  
  // Kolla om URL:en matchar våra cache-patterns
  const shouldCache = CACHE_PATTERNS.some(pattern => pattern.test(url.pathname));
  
  if (shouldCache) {
    event.respondWith(handleCachedRequest(event.request));
  }
});

// Hantera cachade requests
async function handleCachedRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  
  try {
    // Försök först med cache
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      // Kolla om cache är för gammal
      const cachedTime = cachedResponse.headers.get('sw-cached-time');
      if (cachedTime) {
        const age = Date.now() - parseInt(cachedTime);
        if (age < CACHE_EXPIRY) {
          return cachedResponse;
        }
      }
    }
    
    // Cache miss eller expired - hämta från nätverket
    const networkResponse = await fetch(request);
    
    // Spara i cache om request lyckades
    if (networkResponse.ok) {
      const responseClone = networkResponse.clone();
      
      // Lägg till timestamp för cache expiry
      const headers = new Headers(responseClone.headers);
      headers.set('sw-cached-time', Date.now().toString());
      
      const cachedResponse = new Response(responseClone.body, {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers: headers
      });
      
      await cache.put(request, cachedResponse);
    }
    
    return networkResponse;
    
  } catch (error) {
    // Fallback till cache även om expired
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    throw error;
  }
}

// Rensa gamla cache-entries
self.addEventListener('message', event => {
  if (event.data.action === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME);
  }
}); 