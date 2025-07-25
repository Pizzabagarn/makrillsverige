// 🚀 ULTRA-AGGRESSIV Service Worker för Mobil-prestanda
const CACHE_NAME = 'makrillsverige-mobile-v3'; // Uppdaterad version
const CACHE_EXPIRY = {
  webp: 7 * 24 * 60 * 60 * 1000,    // 7 dagar för WebP
  avif: 7 * 24 * 60 * 60 * 1000,    // 7 dagar för AVIF  
  images: 3 * 24 * 60 * 60 * 1000,  // 3 dagar för andra bilder
  metadata: 60 * 60 * 1000,         // 1 timme för metadata (276KB totalt, uppdateras bara 1x/dag)
  critical: 30 * 24 * 60 * 60 * 1000 // 30 dagar för kritiska resurser
};

// Lista över kritiska metadata-filer som behöver smart caching
const METADATA_FILES = [
  '/data/current-images-mercator/metadata.json',
  '/data/temperature-images-mercator/metadata.json',
  '/data/salinity-images-mercator/metadata.json',
  '/data/mackerel-probability-images-mercator/metadata.json'
];

// SMART installation med prefetch av kritiska resurser
self.addEventListener('install', event => {
  console.log('🔧 Installerar ultra-mobil Service Worker v3');
  
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      
      // Prefetch metadata-filer med kortare cache
      try {
        await cache.addAll(METADATA_FILES.slice(0, 2)); // Bara viktiga metadata först
        console.log('✅ Kritiska metadata-filer prefetchade');
      } catch (error) {
        console.warn('⚠️ Kunde inte prefetch alla kritiska resurser:', error);
      }
      
      self.skipWaiting();
    })()
  );
});

// Aktivering med cleanup av gamla cacher
self.addEventListener('activate', event => {
  console.log('🚀 Aktiverar ultra-mobil Service Worker v3');
  
  event.waitUntil(
    (async () => {
      // Rensa gamla cacher
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name.startsWith('makrillsverige'))
          .map(name => {
            console.log('🗑️ Rensar gammal cache:', name);
            return caches.delete(name);
          })
      );
      
      clients.claim();
    })()
  );
});

// ULTRA-SMART request-hantering med förbättrad metadata-hantering
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Endast hantera GET requests
  if (event.request.method !== 'GET') return;
  
  // Undanta localhost och API-calls (förutom våra egna)
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return;
  }
  
  // Identifiera resurstyp
  const isWebP = /\.webp$/i.test(url.pathname);
  const isAVIF = /\.avif$/i.test(url.pathname);
  const isImage = /\.(png|jpg|jpeg|gif|webp|avif)$/i.test(url.pathname);
  const isMetadata = /metadata\.json$/i.test(url.pathname) || 
                    (url.pathname.endsWith('.json') && url.pathname.includes('/data/'));
  const isCriticalMetadata = METADATA_FILES.some(file => url.pathname.endsWith(file.split('/').pop()));
  const isDataResource = url.pathname.startsWith('/data/');
  
  // Cache alla marina data-resurser med smart metadata-hantering
  if (isDataResource && (isImage || isMetadata)) {
    event.respondWith(handleUltraSmartRequest(event.request, {
      isWebP,
      isAVIF, 
      isImage,
      isMetadata,
      isCriticalMetadata
    }));
  }
});

// 🚀 ULTRA-SMART REQUEST HANDLER med förbättrad metadata-hantering
async function handleUltraSmartRequest(request, resourceInfo) {
  const cache = await caches.open(CACHE_NAME);
  const url = new URL(request.url);
  
  try {
    // SPECIAL HANDLING för kritisk metadata - alltid kolla freshness
    if (resourceInfo.isCriticalMetadata) {
      return await handleCriticalMetadata(request, cache);
    }
    
    // 1. CACHE FIRST strategi för bilder och vanlig metadata
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      const cachedTime = cachedResponse.headers.get('sw-cached');
      if (cachedTime) {
        const age = Date.now() - parseInt(cachedTime);
        
        // Olika cache-tider baserat på resurstyp
        let maxAge = CACHE_EXPIRY.images;
        if (resourceInfo.isWebP || resourceInfo.isAVIF) {
          maxAge = CACHE_EXPIRY.webp;
        } else if (resourceInfo.isMetadata) {
          maxAge = CACHE_EXPIRY.metadata; // Kortare för metadata
        }
        
        if (age < maxAge) {
          // Cache hit - return cached version
          return cachedResponse;
        }
      }
    }
    
    // 2. NETWORK strategi med smart error-hantering
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout för bättre UX
    
    const networkResponse = await fetch(request, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (networkResponse.ok) {
      // 3. SMART CACHING med specialbehandling för metadata
      await cacheResponse(cache, request, networkResponse, resourceInfo);
    }
    
    return networkResponse;
    
  } catch (error) {
    console.warn(`❌ Network-fel för ${url.pathname}:`, error.message);
    
    // 4. OFFLINE FALLBACK - returnera cache även om den är gammal
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // 5. ULTIMATE FALLBACK - försök med PNG om WebP misslyckas
    if (resourceInfo.isWebP) {
      const pngUrl = request.url.replace('.webp', '.png');
      const pngRequest = new Request(pngUrl);
      
      try {
        const pngResponse = await fetch(pngRequest);
        if (pngResponse.ok) {
          return pngResponse;
        }
      } catch (pngError) {
        // Silent failure
      }
    }
    
    throw error;
  }
}

// SPECIAL HANDLER för kritisk metadata
async function handleCriticalMetadata(request, cache) {
  const cachedResponse = await cache.match(request);
  
  try {
    // Försök alltid hämta från nätet först för metadata
    const networkResponse = await fetch(request, {
      signal: AbortSignal.timeout(5000) // 5s timeout
    });
    
    if (networkResponse.ok) {
      // Kolla om innehållet faktiskt har ändrats
      const networkText = await networkResponse.clone().text();
      
      if (cachedResponse) {
        const cachedText = await cachedResponse.text();
        
        // Om innehållet är samma, returnera cache (för prestanda)
        if (networkText === cachedText) {
          console.log('📊 Metadata oförändrad, använder cache');
          return cachedResponse;
        }
      }
      
      // Innehållet har ändrats eller är nytt - cache och returnera
      console.log('🔄 Metadata uppdaterad, cachar ny version');
      await cacheResponse(cache, request, networkResponse, { isMetadata: true, isCriticalMetadata: true });
      return networkResponse;
      
    } else if (cachedResponse) {
      // Network misslyckades men vi har cache
      console.log('⚠️ Network misslyckades för metadata, använder cache');
      return cachedResponse;
    }
    
    throw new Error('No network response and no cache');
    
  } catch (error) {
    // Network fel - använd cache om tillgänglig
    if (cachedResponse) {
      console.log('📊 Metadata network fel, använder cache fallback');
      return cachedResponse;
    }
    
    throw error;
  }
}

// Hjälpfunktion för att cacha svar
async function cacheResponse(cache, request, response, resourceInfo) {
  const responseToCache = response.clone();
  const headers = new Headers(responseToCache.headers);
  headers.set('sw-cached', Date.now().toString());
  headers.set('sw-resource-type', getResourceType(resourceInfo));
  
  // Lägg till extra headers för optimerade format
  if (resourceInfo.isWebP || resourceInfo.isAVIF) {
    headers.set('sw-optimized', 'true');
    headers.set('sw-format', resourceInfo.isWebP ? 'webp' : 'avif');
  }
  
  // Speciell markering för kritisk metadata
  if (resourceInfo.isCriticalMetadata) {
    headers.set('sw-critical-metadata', 'true');
  }
  
  const modifiedResponse = new Response(responseToCache.body, {
    status: responseToCache.status,
    statusText: responseToCache.statusText,
    headers: headers
  });
  
  // Cache med prioritet
  try {
    await cache.put(request, modifiedResponse);
  } catch (error) {
    console.warn(`⚠️ Cache-fel för ${new URL(request.url).pathname}:`, error);
  }
}

// Hjälpfunktion för resurstyp-identifiering
function getResourceType(resourceInfo) {
  if (resourceInfo.isCriticalMetadata) return 'critical-metadata';
  if (resourceInfo.isMetadata) return 'metadata';
  if (resourceInfo.isWebP) return 'webp';
  if (resourceInfo.isAVIF) return 'avif';
  if (resourceInfo.isImage) return 'image';
  return 'unknown';
}

// 📊 FÖRBÄTTRAD message-hantering med cache invalidation
self.addEventListener('message', async (event) => {
  if (event.data && event.data.action === 'CLEAR_CACHE') {
    await caches.delete(CACHE_NAME);
    console.log('🗑️ Cache rensad manuellt');
    
    // Skicka bekräftelse tillbaka
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ success: true });
    }
  }
  
  if (event.data && event.data.action === 'CLEAR_METADATA') {
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();
    
    // Ta bort endast metadata
    const metadataRequests = requests.filter(request => 
      request.url.includes('metadata.json')
    );
    
    await Promise.all(metadataRequests.map(request => cache.delete(request)));
    console.log('🗑️ Metadata cache rensad');
    
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ success: true, cleared: metadataRequests.length });
    }
  }
  
  if (event.data && event.data.action === 'GET_CACHE_STATS') {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    
    const stats = {
      totalCached: keys.length,
      webpImages: keys.filter(req => req.url.includes('.webp')).length,
      pngImages: keys.filter(req => req.url.includes('.png')).length,
      metadata: keys.filter(req => req.url.includes('metadata.json')).length,
      cacheName: CACHE_NAME,
      cacheSize: await getCacheSize(cache)
    };
    
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage(stats);
    }
  }
});

// Beräkna ungefärlig cache-storlek
async function getCacheSize(cache) {
  const keys = await cache.keys();
  
  // Uppskatta baserat på antal filer och typ
  const estimates = {
    webp: keys.filter(req => req.url.includes('.webp')).length * 50, // ~50KB per WebP
    png: keys.filter(req => req.url.includes('.png')).length * 100, // ~100KB per PNG
    metadata: keys.filter(req => req.url.includes('metadata.json')).length * 5 // ~5KB per metadata
  };
  
  const totalKB = estimates.webp + estimates.png + estimates.metadata;
  return Math.round(totalKB / 1024); // MB
} 