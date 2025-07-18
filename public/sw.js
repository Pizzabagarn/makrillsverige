// Service Worker för Makrillsverige - Intelligent cache för dagliga uppdateringar
const CACHE_NAME = 'makrillsverige-v1';

// INTELLIGENT CACHE STRATEGI baserat på dagliga uppdateringar kl 02:00
const IMAGE_CACHE_EXPIRY = 20 * 60 * 60 * 1000; // 20 timmar för bilder (uppdateras dagligen)
const METADATA_CACHE_EXPIRY = 12 * 60 * 60 * 1000; // 12 timmar för metadata (säkerhetsmarginal)
const API_CACHE_EXPIRY = 10 * 60 * 1000; // 10 minuter för API-anrop (popup-responsivitet)

// Statiska resurser - lång cache (uppdateras dagligen)
const STATIC_CACHE_PATTERNS = [
  /\/data\/.*\.(png|jpg|jpeg|gif|webp)$/,
  /\/data\/.*\.geojson$/,
  /\/data\/.*\.json\.gz$/,
];

// Metadata - medellång cache (uppdateras dagligen men behöver säkerhetsmarginal)
const METADATA_CACHE_PATTERNS = [
  /\/data\/.*metadata\.json$/,
];

// API-endpoints - kort cache (för popup-responsivitet)
const API_CACHE_PATTERNS = [
  /\/api\/area-parameters$/,
  /\/api\/mackerel-values\/.*$/,
];

// Installera service worker
self.addEventListener('install', event => {
  console.log('📦 Service Worker installerad med intelligent cache');
  self.skipWaiting();
});

// Aktivera service worker
self.addEventListener('activate', event => {
  console.log('🔄 Service Worker aktiverad');
  event.waitUntil(clients.claim());
});

// Intelligent fetch interceptor
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Endast hantera GET requests
  if (event.request.method !== 'GET') return;
  
  // Undanta localhost och development
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return; // Låt localhost-anrop passera utan cache
  }
  
  // Bestäm cache-strategi baserat på resurs-typ
  const isStaticResource = STATIC_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname));
  const isMetadata = METADATA_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname));
  const isApiCall = API_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname));
  
  if (isStaticResource) {
    event.respondWith(handleCachedRequest(event.request, IMAGE_CACHE_EXPIRY, 'static'));
  } else if (isMetadata) {
    event.respondWith(handleCachedRequest(event.request, METADATA_CACHE_EXPIRY, 'metadata'));
  } else if (isApiCall) {
    event.respondWith(handleApiRequest(event.request));
  }
  // Låt alla andra requests passera normalt
});

// Förbättrad API-hantering med kort cache
async function handleApiRequest(request) {
  try {
    // Försök med nätverk först för kritiska API-anrop
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cacha bara lyckade svar med kort TTL
      const cache = await caches.open(CACHE_NAME);
      const responseClone = networkResponse.clone();
      
      // Lägg till timestamp för cache expiry
      const headers = new Headers(responseClone.headers);
      headers.set('sw-cached-time', Date.now().toString());
      headers.set('sw-cache-type', 'api');
      headers.set('sw-cache-ttl', API_CACHE_EXPIRY.toString());
      
      const cachedResponse = new Response(responseClone.body, {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers: headers
      });
      
      await cache.put(request, cachedResponse);
      return networkResponse;
    }
    
    // Om nätverksresponsen inte är ok, försök med cache
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('🔄 Använder cached API-svar för:', request.url);
      return cachedResponse;
    }
    
    return networkResponse;
    
  } catch (error) {
    console.warn('⚠️ Nätverksfel för API-anrop:', error);
    
    // Fallback till cache
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('🔄 Fallback till cache för:', request.url);
      return cachedResponse;
    }
    
    throw error;
  }
}

// Hantera cachade requests med intelligent expiry
async function handleCachedRequest(request, expiry, type) {
  const cache = await caches.open(CACHE_NAME);
  
  try {
    // Försök först med cache
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      // Kolla om cache är för gammal
      const cachedTime = cachedResponse.headers.get('sw-cached-time');
      if (cachedTime) {
        const age = Date.now() - parseInt(cachedTime);
        if (age < expiry) {
          // Cache är fresh - använd direkt
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
      headers.set('sw-cache-type', type);
      headers.set('sw-cache-ttl', expiry.toString());
      
      const cachedResponse = new Response(responseClone.body, {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers: headers
      });
      
      await cache.put(request, cachedResponse);
    }
    
    return networkResponse;
    
  } catch (error) {
    // Fallback till cache även om expired (för offline-support)
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      console.log('🔄 Fallback till cache för:', request.url);
      return cachedResponse;
    }
    
    throw error;
  }
}

// Intelligent cache-hantering med tidsbaserad rensning
self.addEventListener('message', event => {
  if (event.data.action === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME);
  } else if (event.data.action === 'CLEAR_API_CACHE') {
    // Rensa bara API-cache för snabbare popup-uppdateringar
    caches.open(CACHE_NAME).then(cache => {
      cache.keys().then(keys => {
        keys.forEach(key => {
          cache.match(key).then(response => {
            if (response) {
              const cacheType = response.headers.get('sw-cache-type');
              if (cacheType === 'api') {
                cache.delete(key);
              }
            }
          });
        });
      });
    });
  } else if (event.data.action === 'CLEAR_EXPIRED_CACHE') {
    // Rensa bara expired cache (för dagliga uppdateringar)
    caches.open(CACHE_NAME).then(cache => {
      cache.keys().then(keys => {
        keys.forEach(key => {
          cache.match(key).then(response => {
            if (response) {
              const cachedTime = response.headers.get('sw-cached-time');
              const ttl = response.headers.get('sw-cache-ttl');
              if (cachedTime && ttl) {
                const age = Date.now() - parseInt(cachedTime);
                if (age > parseInt(ttl)) {
                  cache.delete(key);
                }
              }
            }
          });
        });
      });
    });
  }
}); 