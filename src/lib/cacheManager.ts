// src/lib/cacheManager.ts
import LayerPreloadingManager from './layerPreloadingManager';

export class CacheManager {
  private static instance: CacheManager;
  private lastApiCacheClear: number = 0;
  private lastExpiredCacheClear: number = 0;
  
  private constructor() {}
  
  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }
  
  // INTELLIGENT: Rensa bara API-cache när det behövs för popup-uppdateringar
  async clearApiCache(): Promise<void> {
    // Rensa max en gång per 5 minuter för att inte påverka prestanda
    const now = Date.now();
    if (now - this.lastApiCacheClear < 5 * 60 * 1000) {
      console.log('🔄 API-cache rensad för nyligen, skippar...');
      return;
    }
    
    console.log('🧹 Rensar API-cache för popup-uppdateringar...');
    
    try {
      // Rensa Service Worker API-cache
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ action: 'CLEAR_API_CACHE' });
      }
      
      // Rensa från browser cache för kritiska API-endpoints
      const criticalAPIs = [
        '/api/area-parameters',
        '/api/mackerel-values'
      ];
      
      for (const api of criticalAPIs) {
        try {
          await fetch(api, { 
            method: 'GET', 
            cache: 'reload' // Tvinga ny request
          });
        } catch (error) {
          // Tyst fail för individuella API-anrop
        }
      }
      
      this.lastApiCacheClear = now;
      console.log('✅ API-cache rensad');
      
    } catch (error) {
      console.error('❌ Kunde inte rensa API-cache:', error);
    }
  }
  
  // NYTT: Rensa bara expired cache (för dagliga uppdateringar kl 02:00)
  async clearExpiredCache(): Promise<void> {
    const now = Date.now();
    
    // Rensa expired cache max en gång per timme
    if (now - this.lastExpiredCacheClear < 60 * 60 * 1000) {
      return;
    }
    
    console.log('🧹 Rensar expired cache...');
    
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ action: 'CLEAR_EXPIRED_CACHE' });
      }
      
      this.lastExpiredCacheClear = now;
      console.log('✅ Expired cache rensad');
      
    } catch (error) {
      console.error('❌ Kunde inte rensa expired cache:', error);
    }
  }
  
  // SÄKRARE: Optimera för svaga enheter utan att förstöra cache
  async optimizeForDevice(): Promise<void> {
    const cores = navigator.hardwareConcurrency || 4;
    const memory = (navigator as any).deviceMemory || 4;
    
    // Bara för riktigt svaga enheter
    if (cores <= 2 && memory <= 2) {
      console.log('📱 Optimerar för svag enhet...');
      
      // Pausera preloading temporärt
      const preloadManager = LayerPreloadingManager.getInstance();
      preloadManager.pausePreloading();
      
      // Rensa bara DOM-cache, inte Service Worker cache
      this.clearDOMCache();
      
      // Återuppta preloading efter 30 sekunder
      setTimeout(() => {
        preloadManager.resumePreloading();
      }, 30000);
      
    } else {
      console.log('🖥️ Stark enhet - ingen optimering behövs');
    }
  }
  
  // BEVARAD: Intelligent cache-rensning för svaga enheter
  async intelligentCacheClearing(): Promise<void> {
    try {
      const deviceStrength = this.assessDeviceStrength();
      
      if (deviceStrength === 'weak') {
        console.log('📱 Svag enhet - rensar selektivt...');
        
        // Bara rensa API-cache, inte bild-cache
        await this.clearApiCache();
        
        // Pausa preloading temporärt
        const preloadManager = LayerPreloadingManager.getInstance();
        preloadManager.pausePreloading();
        
        // Återuppta efter 15 sekunder
        setTimeout(() => {
          preloadManager.resumePreloading();
        }, 15000);
        
      } else if (deviceStrength === 'medium') {
        console.log('💻 Medel enhet - mild optimering...');
        
        // Bara rensa expired cache
        await this.clearExpiredCache();
        
      } else {
        console.log('🖥️ Stark enhet - ingen cache-rensning behövs');
      }
      
    } catch (error) {
      console.error('❌ Intelligent cache-rensning misslyckades:', error);
    }
  }
  
  // Bedöm enhetens styrka
  private assessDeviceStrength(): 'weak' | 'medium' | 'strong' {
    const cores = navigator.hardwareConcurrency || 4;
    const memory = (navigator as any).deviceMemory || 4;
    const connection = (navigator as any).connection;
    
    // Svag enhet
    if (cores <= 2 && memory <= 2) {
      return 'weak';
    }
    
    // Medel enhet
    if (cores <= 4 && memory <= 4) {
      return 'medium';
    }
    
    // Låg anslutning = svag
    if (connection && (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g')) {
      return 'weak';
    }
    
    return 'strong';
  }
  
  // Rensa DOM-cache (inte Service Worker cache)
  private clearDOMCache(): void {
    try {
      // Rensa bara DOM-referenser, inte Service Worker
      const images = document.querySelectorAll('img[src*="/data/"]');
      images.forEach(img => {
        const imageElement = img as HTMLImageElement;
        if (imageElement.src.includes('/data/')) {
          // Sätt tom src för att frigöra minne
          imageElement.src = '';
        }
      });
      
      console.log('🧹 DOM-cache rensad');
      
    } catch (error) {
      console.error('❌ Kunde inte rensa DOM-cache:', error);
    }
  }
  
  // EMERGENCY: Fullständig cache-rensning (bara för nödsituationer)
  async emergencyCacheClear(): Promise<void> {
    console.log('🚨 Emergency cache clear...');
    
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ action: 'CLEAR_CACHE' });
      }
      
      // Rensa också browser cache
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
      
      console.log('✅ Emergency cache clear slutförd');
      
    } catch (error) {
      console.error('❌ Emergency cache clear misslyckades:', error);
    }
  }
} 