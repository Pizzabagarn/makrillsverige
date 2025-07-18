// Service Worker för Makrillsverige - Enkel och effektiv bildcachning
const CACHE_NAME = 'makrillsverige-v1';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 timmar cache

// Installera service worker
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Aktivera service worker
self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

// Hantera requests
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Endast hantera GET requests
  if (event.request.method !== 'GET') return;
  
  // Undanta localhost
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return;
  }
  
  // Cache bara bilder och metadata
  const shouldCache = /\/data\/.*\.(png|jpg|jpeg|gif|webp|json)$/.test(url.pathname);
  
  if (shouldCache) {
    event.respondWith(handleRequest(event.request));
  }
});

// Hantera cachad request
async function handleRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  
  try {
    // Kolla cache först
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      // Kolla om cache är för gammal
      const cachedTime = cachedResponse.headers.get('sw-cached');
      if (cachedTime) {
        const age = Date.now() - parseInt(cachedTime);
        if (age < CACHE_EXPIRY) {
          return cachedResponse;
        }
      }
    }
    
    // Hämta från nätverk
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cacha responsen
      const responseClone = networkResponse.clone();
      const headers = new Headers(responseClone.headers);
      headers.set('sw-cached', Date.now().toString());
      
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

// Hantera meddelanden
self.addEventListener('message', event => {
  if (event.data.action === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME);
  }
}); 