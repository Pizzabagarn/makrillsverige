// Service Worker för aggressiv caching av marindatabilder
// Skapar instant laddning mellan sidbesök

const CACHE_NAME = 'makrill-cache-v1';
const STATIC_CACHE_NAME = 'makrill-static-v1';

// Statiska filer som ska cachas aggressivt
const STATIC_ASSETS = [
  '/',
  '/images/arrow.png',
  '/images/logo.png',
  '/images/makrill-bg.jpg',
  '/images/map-frame.png',
  '/images/moon.png',
  '/images/sun.png',
  '/data/scandinavian-waters.geojson',
  '/data/area-parameters-extended.json.gz'
];

// Mönster för dynamiska filer som ska cachas
const CACHE_PATTERNS = [
  /^\/data\/.*-images\/.*\.png$/,     // Alla rasterbilder
  /^\/data\/.*-images\/metadata\.json$/,  // Metadata filer
  /^\/api\/area-parameters$/,         // Area parameters API
  /^\/api\/dmi\/.*$/,                // DMI API calls
  /^\/_next\/static\/.*$/,           // Next.js static assets
  /^\/favicon\.ico$/,                // Favicon
];

// Install event - cache kritiska statiska filer
self.addEventListener('install', (event) => {
  console.log('🚀 Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('📦 Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('✅ Service Worker: Static assets cached');
        // Aktivera direkt
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('❌ Service Worker: Failed to cache static assets:', error);
      })
  );
});

// Activate event - ta kontroll över alla clients
self.addEventListener('activate', (event) => {
  console.log('⚡ Service Worker: Activating...');
  
  event.waitUntil(
    // Rensa gamla caches
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE_NAME) {
              console.log('🗑️ Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('✅ Service Worker: Activated and controlling all clients');
        // Ta kontroll över alla clients direkt
        return self.clients.claim();
      })
  );
});

// Fetch event - aggressiv caching strategi
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  
  // Ignorera vissa requests
  if (
    event.request.method !== 'GET' ||
    requestUrl.protocol === 'chrome-extension:' ||
    requestUrl.hostname === 'localhost' && requestUrl.port === '3001' // Hot reload
  ) {
    return;
  }
  
  // Statiska filer - Cache First (instant loading)
  if (STATIC_ASSETS.some(asset => event.request.url.endsWith(asset))) {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          if (response) {
            console.log('⚡ Service Worker: Serving from cache (static):', event.request.url);
            return response;
          }
          
          return fetch(event.request)
            .then((response) => {
              const responseClone = response.clone();
              caches.open(STATIC_CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseClone);
                });
              return response;
            });
        })
    );
    return;
  }
  
  // Dynamiska filer som matchar patterns - Cache First för bilder
  const shouldCache = CACHE_PATTERNS.some(pattern => pattern.test(requestUrl.pathname));
  
  if (shouldCache) {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          if (response) {
            console.log('⚡ Service Worker: Serving from cache:', event.request.url);
            return response;
          }
          
          console.log('📥 Service Worker: Fetching and caching:', event.request.url);
          return fetch(event.request)
            .then((response) => {
              // Klona response för caching
              const responseClone = response.clone();
              
              // Cache response
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseClone);
                });
              
              return response;
            })
            .catch((error) => {
              console.error('❌ Service Worker: Fetch failed:', error);
              throw error;
            });
        })
    );
    return;
  }
  
  // För alla andra requests - låt dem gå igenom normalt
  event.respondWith(fetch(event.request));
});

// Background sync för prefetching (optional)
self.addEventListener('sync', (event) => {
  if (event.tag === 'prefetch-images') {
    event.waitUntil(prefetchCriticalImages());
  }
});

// Prefetch kritiska bilder i bakgrunden
async function prefetchCriticalImages() {
  try {
    console.log('🔄 Service Worker: Prefetching critical images...');
    
    // Prefetch första bilden från varje lager
    const imagePaths = [
      '/data/current-magnitude-images/current_magnitude_2025-06-29T12-00-00.000Z.png',
      '/data/salinity-images/salinity_2025-06-29T12-00-00.000Z.png',
      '/data/temperature-images/temperature_2025-06-29T12-00-00.000Z.png',
    ];
    
    const cache = await caches.open(CACHE_NAME);
    
    for (const imagePath of imagePaths) {
      try {
        const response = await fetch(imagePath);
        if (response.ok) {
          await cache.put(imagePath, response.clone());
          console.log('✅ Service Worker: Prefetched:', imagePath);
        }
      } catch (error) {
        console.warn('⚠️ Service Worker: Failed to prefetch:', imagePath);
      }
    }
    
    console.log('🎉 Service Worker: Prefetching complete');
  } catch (error) {
    console.error('❌ Service Worker: Prefetching failed:', error);
  }
}

// Message handling för manuell cache management
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys()
        .then((cacheNames) => {
          return Promise.all(
            cacheNames.map((cacheName) => caches.delete(cacheName))
          );
        })
        .then(() => {
          console.log('🗑️ Service Worker: All caches cleared');
        })
    );
  }
});

console.log('🏁 Service Worker: Loaded and ready'); 