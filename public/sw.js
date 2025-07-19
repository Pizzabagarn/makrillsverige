// 🚀 ULTRA-AGGRESSIV Service Worker för Mobil-prestanda
const CACHE_NAME = 'makrillsverige-mobile-v2';
const CACHE_EXPIRY = {
  webp: 7 * 24 * 60 * 60 * 1000,    // 7 dagar för WebP
  avif: 7 * 24 * 60 * 60 * 1000,    // 7 dagar för AVIF  
  images: 3 * 24 * 60 * 60 * 1000,  // 3 dagar för andra bilder
  metadata: 60 * 60 * 1000,         // 1 timme för metadata
  critical: 30 * 24 * 60 * 60 * 1000 // 30 dagar för kritiska resurser
};

// Lista över kritiska filer som alltid ska cachas aggressivt
const CRITICAL_RESOURCES = [
  '/data/current-images-mercator/metadata.json',
  '/data/mackerel-probability-images-mercator/metadata.json',
  '/data/area-parameters-extended.json.gz'
];

// SMART installation med prefetch av kritiska resurser
self.addEventListener('install', event => {
  console.log('🔧 Installerar ultra-mobil Service Worker');
  
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      
      // Prefetch kritiska metadata-filer
      try {
        await cache.addAll(CRITICAL_RESOURCES.slice(0, 2)); // Bara metadata först
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
  console.log('🚀 Aktiverar ultra-mobil Service Worker');
  
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

// ULTRA-SMART request-hantering
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
  const isMetadata = /metadata\.json$/i.test(url.pathname) || /\.json$/i.test(url.pathname);
  const isCritical = CRITICAL_RESOURCES.some(resource => url.pathname.endsWith(resource.split('/').pop()));
  const isDataResource = url.pathname.startsWith('/data/');
  
  // Cache alla marina data-resurser
  if (isDataResource && (isImage || isMetadata)) {
    event.respondWith(handleUltraSmartRequest(event.request, {
      isWebP,
      isAVIF, 
      isImage,
      isMetadata,
      isCritical
    }));
  }
});

// 🚀 ULTRA-SMART REQUEST HANDLER med adaptiv caching
async function handleUltraSmartRequest(request, resourceInfo) {
  const cache = await caches.open(CACHE_NAME);
  const url = new URL(request.url);
  
  try {
    // 1. CACHE FIRST strategi för bilder och kritiska resurser
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      const cachedTime = cachedResponse.headers.get('sw-cached');
      if (cachedTime) {
        const age = Date.now() - parseInt(cachedTime);
        
        // Olika cache-tider baserat på resurstyp
        let maxAge = CACHE_EXPIRY.images;
        if (resourceInfo.isCritical) {
          maxAge = CACHE_EXPIRY.critical;
        } else if (resourceInfo.isWebP || resourceInfo.isAVIF) {
          maxAge = CACHE_EXPIRY.webp;
        } else if (resourceInfo.isMetadata) {
          maxAge = CACHE_EXPIRY.metadata;
        }
        
        if (age < maxAge) {
          console.log(`✅ Cache hit: ${url.pathname} (ålder: ${Math.round(age/60000)}min)`);
          return cachedResponse;
        } else {
          console.log(`⏰ Cache expired: ${url.pathname} (ålder: ${Math.round(age/60000)}min)`);
        }
      }
    }
    
    // 2. NETWORK strategi med smart error-hantering
    console.log(`🌐 Hämtar från nätet: ${url.pathname}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    const networkResponse = await fetch(request, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (networkResponse.ok) {
      // 3. SMART CACHING baserat på resurstyp
      const responseToCache = networkResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cached', Date.now().toString());
      headers.set('sw-resource-type', getResourceType(resourceInfo));
      
      // Lägg till extra cache-headers för optimerade format
      if (resourceInfo.isWebP || resourceInfo.isAVIF) {
        headers.set('sw-optimized', 'true');
        headers.set('sw-format', resourceInfo.isWebP ? 'webp' : 'avif');
      }
      
      const modifiedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      });
      
      // Cache med prioritet - kritiska resurser först
      if (resourceInfo.isCritical) {
        await cache.put(request, modifiedResponse);
        console.log(`⚡ Kritisk resurs cachad: ${url.pathname}`);
      } else {
        // Non-blocking cache för icke-kritiska resurser
        cache.put(request, modifiedResponse).catch(error => {
          console.warn(`⚠️ Cache-fel för ${url.pathname}:`, error);
        });
      }
    }
    
    return networkResponse;
    
  } catch (error) {
    console.warn(`❌ Network-fel för ${url.pathname}:`, error.message);
    
    // 4. OFFLINE FALLBACK - returnera cache även om den är gammal
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      console.log(`💾 Offline fallback: ${url.pathname}`);
      return cachedResponse;
    }
    
    // 5. ULTIMATE FALLBACK - försök med PNG om WebP misslyckas
    if (resourceInfo.isWebP) {
      const pngUrl = request.url.replace('.webp', '.png');
      const pngRequest = new Request(pngUrl);
      
      try {
        const pngResponse = await fetch(pngRequest);
        if (pngResponse.ok) {
          console.log(`🔄 WebP fallback till PNG: ${url.pathname}`);
          return pngResponse;
        }
      } catch (pngError) {
        console.warn(`❌ PNG fallback misslyckades för ${url.pathname}`);
      }
    }
    
    throw error;
  }
}

// Hjälpfunktion för resurstyp-identifiering
function getResourceType(resourceInfo) {
  if (resourceInfo.isCritical) return 'critical';
  if (resourceInfo.isWebP) return 'webp';
  if (resourceInfo.isAVIF) return 'avif';
  if (resourceInfo.isMetadata) return 'metadata';
  if (resourceInfo.isImage) return 'image';
  return 'unknown';
}

// 📊 CACHE STATISTIK och meddelanden
self.addEventListener('message', async (event) => {
  if (event.data && event.data.action === 'CLEAR_CACHE') {
    await caches.delete(CACHE_NAME);
    console.log('🗑️ Cache rensad manuellt');
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
  let totalSize = 0;
  
  // Uppskatta baserat på antal filer (eftersom vi inte kan mäta exakt storlek)
  for (const request of keys.slice(0, 10)) { // Bara sampla första 10
    try {
      const response = await cache.match(request);
      if (response && response.body) {
        const reader = response.body.getReader();
        let size = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value ? value.length : 0;
        }
        totalSize += size;
      }
    } catch (error) {
      // Ignorera fel vid storlek-beräkning
    }
  }
  
  // Uppskatta total storlek baserat på sample
  const avgFileSize = totalSize / 10;
  return Math.round(avgFileSize * keys.length / 1024 / 1024); // MB
} 