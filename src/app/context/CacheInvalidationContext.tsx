'use client';

import { createContext, useContext, useCallback, useEffect, useState } from 'react';

interface CacheInvalidationContextType {
  invalidateAll: () => Promise<void>;
  invalidateMetadata: () => Promise<void>;
  invalidateImages: () => Promise<void>;
  forceRefresh: () => void;
  isInvalidating: boolean;
  lastInvalidation: number | null;
}

const CacheInvalidationContext = createContext<CacheInvalidationContextType | undefined>(undefined);

export function CacheInvalidationProvider({ children }: { children: React.ReactNode }) {
  const [isInvalidating, setIsInvalidating] = useState(false);
  const [lastInvalidation, setLastInvalidation] = useState<number | null>(null);

  // Invalidera alla cacher
  const invalidateAll = useCallback(async () => {
    setIsInvalidating(true);
    console.log('🗑️ Invaliderar alla cacher...');
    
    try {
      // 1. Rensa Service Worker cache
      if ('serviceWorker' in navigator && 'caches' in window) {
        const cacheNames = await caches.keys();
        const makrillCaches = cacheNames.filter(name => 
          name.startsWith('makrillsverige') || name.includes('marine')
        );
        
        await Promise.all(makrillCaches.map(name => {
          console.log(`🗑️ Rensar cache: ${name}`);
          return caches.delete(name);
        }));
      }

      // 2. Meddela Service Worker att rensa cache
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          action: 'CLEAR_CACHE'
        });
      }

      // 3. Uppdatera timestamp för komponenter
      setLastInvalidation(Date.now());
      
      console.log('✅ Cache invalidation klar');
    } catch (error) {
      console.error('❌ Fel vid cache invalidation:', error);
    } finally {
      setIsInvalidating(false);
    }
  }, []);

  // Invalidera endast metadata
  const invalidateMetadata = useCallback(async () => {
    setIsInvalidating(true);
    console.log('🗑️ Invaliderar metadata cache...');
    
    try {
      if ('caches' in window) {
        const cache = await caches.open('makrillsverige-mobile-v2');
        const requests = await cache.keys();
        
        // Ta bort alla metadata-requests
        const metadataRequests = requests.filter(request => 
          request.url.includes('metadata.json')
        );
        
        await Promise.all(metadataRequests.map(request => {
          console.log(`🗑️ Rensar metadata: ${request.url}`);
          return cache.delete(request);
        }));
      }
      
      setLastInvalidation(Date.now());
      console.log('✅ Metadata cache invalidation klar');
    } catch (error) {
      console.error('❌ Fel vid metadata invalidation:', error);
    } finally {
      setIsInvalidating(false);
    }
  }, []);

  // Invalidera endast bilder
  const invalidateImages = useCallback(async () => {
    setIsInvalidating(true);
    console.log('🗑️ Invaliderar bildcache...');
    
    try {
      if ('caches' in window) {
        const cache = await caches.open('makrillsverige-mobile-v2');
        const requests = await cache.keys();
        
        // Ta bort alla bild-requests
        const imageRequests = requests.filter(request => 
          /\.(webp|png|jpg|jpeg|avif)$/i.test(request.url) &&
          request.url.includes('/data/')
        );
        
        await Promise.all(imageRequests.map(request => {
          console.log(`🗑️ Rensar bild: ${new URL(request.url).pathname}`);
          return cache.delete(request);
        }));
      }
      
      setLastInvalidation(Date.now());
      console.log('✅ Bildcache invalidation klar');
    } catch (error) {
      console.error('❌ Fel vid bildcache invalidation:', error);
    } finally {
      setIsInvalidating(false);
    }
  }, []);

  // Force refresh hela sidan
  const forceRefresh = useCallback(() => {
    console.log('🔄 Force refresh...');
    // Lägg till timestamp för att tvinga reload
    window.location.href = window.location.href.split('?')[0] + '?t=' + Date.now();
  }, []);

  // Auto-invalidate om data är för gammal (endast på produktion)
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    
    const checkStaleData = async () => {
      try {
        // Kolla metadata ålder för current images
        const response = await fetch('/data/current-images-mercator/metadata.json', {
          cache: 'no-cache'
        });
        
        if (response.ok) {
          const metadata = await response.json();
          const generatedAt = new Date(metadata.generated_at);
          const age = Date.now() - generatedAt.getTime();
          
          // Om data är äldre än 6 timmar på produktion, invalidera automatiskt
          if (age > 6 * 60 * 60 * 1000) {
            console.log('⚠️ Gammal data upptäckt, invaliderar cache automatiskt');
            await invalidateMetadata();
          }
        }
      } catch (error) {
        console.warn('⚠️ Kunde inte kontrollera data-ålder:', error);
      }
    };

    // Kör check efter 30 sekunder
    const timeoutId = setTimeout(checkStaleData, 30000);
    return () => clearTimeout(timeoutId);
  }, [invalidateMetadata]);

  return (
    <CacheInvalidationContext.Provider value={{
      invalidateAll,
      invalidateMetadata,
      invalidateImages,
      forceRefresh,
      isInvalidating,
      lastInvalidation
    }}>
      {children}
    </CacheInvalidationContext.Provider>
  );
}

export const useCacheInvalidation = () => {
  const context = useContext(CacheInvalidationContext);
  if (context === undefined) {
    throw new Error('useCacheInvalidation must be used within a CacheInvalidationProvider');
  }
  return context;
}; 