// src/lib/cacheManager.ts
import LayerPreloadingManager from './layerPreloadingManager';

export class CacheManager {
  private static instance: CacheManager;
  
  private constructor() {}
  
  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }
  
  // Rensa all cache (Service Worker + Layer Preloading)
  async clearAllCache(): Promise<void> {
    console.log('🗑️ Rensar all cache...');
    
    try {
      // Rensa Service Worker cache
      if ('serviceWorker' in navigator && 'caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
        
        // Meddela service worker att rensa cache
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            action: 'CLEAR_CACHE'
          });
        }
      }
      
      // Rensa Layer Preloading cache
      const layerManager = LayerPreloadingManager.getInstance();
      layerManager.clearAllCache();
      
      console.log('✅ All cache rensad');
      
      // Visa meddelande till användaren
      if (window) {
        const event = new CustomEvent('cache-cleared', {
          detail: { message: 'Cache rensad! Nya bilder kommer att laddas.' }
        });
        window.dispatchEvent(event);
      }
      
    } catch (error) {
      console.error('❌ Kunde inte rensa cache:', error);
    }
  }
  
  // Rensa cache för specifikt lager
  async clearLayerCache(layer: string): Promise<void> {
    console.log(`🗑️ Rensar cache för ${layer}...`);
    
    try {
      // Rensa från Service Worker cache
      if ('caches' in window) {
        const cache = await caches.open('makrillsverige-v1');
        const keys = await cache.keys();
        
        // Hitta alla requests som matchar detta lager
        const layerRequests = keys.filter(request => 
          request.url.includes(layer.replace('-', '_'))
        );
        
        await Promise.all(
          layerRequests.map(request => cache.delete(request))
        );
      }
      
      // Rensa från Layer Preloading cache
      const layerManager = LayerPreloadingManager.getInstance();
      layerManager.clearLayerCache(layer);
      
      console.log(`✅ Cache för ${layer} rensad`);
      
    } catch (error) {
      console.error(`❌ Kunde inte rensa cache för ${layer}:`, error);
    }
  }
  
  // Kontrollera cache-storlek
  async getCacheSize(): Promise<number> {
    if (!('caches' in window)) return 0;
    
    try {
      const cacheNames = await caches.keys();
      let totalSize = 0;
      
      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        
        for (const request of keys) {
          const response = await cache.match(request);
          if (response) {
            const blob = await response.blob();
            totalSize += blob.size;
          }
        }
      }
      
      return totalSize;
    } catch (error) {
      console.error('❌ Kunde inte beräkna cache-storlek:', error);
      return 0;
    }
  }
  
  // Kontrollera cache-status
  getCacheStatus(): {
    serviceWorkerActive: boolean;
    preloadingComplete: boolean;
    totalCachedImages: number;
  } {
    const serviceWorkerActive = 'serviceWorker' in navigator && 
                               navigator.serviceWorker.controller !== null;
    
    const layerManager = LayerPreloadingManager.getInstance();
    const statuses = layerManager.getAllStatuses();
    
    const preloadingComplete = statuses.every(status => 
      status.status === 'loaded' || status.status === 'error'
    );
    
    const totalCachedImages = statuses.reduce((sum, status) => 
      sum + status.loadedImages, 0
    );
    
    return {
      serviceWorkerActive,
      preloadingComplete,
      totalCachedImages
    };
  }
  
  // Formatera cache-storlek för visning
  formatCacheSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export default CacheManager; 