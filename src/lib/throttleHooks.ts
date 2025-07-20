import { useState, useEffect, useRef, useCallback } from 'react';

// Throttle function för att hantera dragging-prestanda
export function useHeavyThrottle<T>(value: T, delay: number): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastExecuted = useRef<number>(0);

  useEffect(() => {
    const now = Date.now();
    if (now >= lastExecuted.current + delay) {
      lastExecuted.current = now;
      setThrottledValue(value);
    } else {
      const timer = setTimeout(() => {
        lastExecuted.current = Date.now();
        setThrottledValue(value);
      }, delay - (now - lastExecuted.current));

      return () => clearTimeout(timer);
    }
  }, [value, delay]);

  return throttledValue;
}

// Dragging detection hook
export function useDraggingDetection(selectedHour: number): boolean {
  const [isDragging, setIsDragging] = useState(false);
  const lastChangeTime = useRef<number>(0);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setIsDragging(true);
    lastChangeTime.current = Date.now();
    
    if (dragTimer.current) {
      clearTimeout(dragTimer.current);
    }
    
    // Shorter timeout for more responsive simulation
    dragTimer.current = setTimeout(() => {
      setIsDragging(false);
    }, 150) as any; // Reduced from 300ms to 150ms

    return () => {
      if (dragTimer.current) {
        clearTimeout(dragTimer.current);
      }
    };
  }, [selectedHour]);

  return isDragging;
} 

// NYTT: Hook för cache-hantering och mobil-optimering
export function useCacheOptimization() {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isLowEndDevice, setIsLowEndDevice] = useState(false);
  const isOptimizingRef = useRef(false);
  
  useEffect(() => {
    // Identifiera svag enhet
    const checkDevice = () => {
      const cores = navigator.hardwareConcurrency || 4;
      const memory = (navigator as any).deviceMemory || 4;
      const isLowEnd = cores <= 4 && memory <= 4;
      
      setIsLowEndDevice(isLowEnd);
      
      if (isLowEnd) {
        console.log('📱 Svag enhet identifierad, aktiverar optimeringar');
      }
    };
    
    checkDevice();
  }, []);
  
  // Rensa API-cache för snabbare popup-uppdateringar - STABILISERAD CALLBACK  
  const clearApiCache = useCallback(async () => {
    // Använd ref för att undvika stale closure och callback recreation
    if (isOptimizingRef.current) return;
    
    isOptimizingRef.current = true;
    setIsOptimizing(true);
    
    try {
      const { CacheManager } = await import('./cacheManager');
      const cacheManager = CacheManager.getInstance();
      await cacheManager.clearApiCache();
    } catch (error) {
      console.error('❌ Kunde inte rensa API-cache:', error);
    } finally {
      isOptimizingRef.current = false;
      setIsOptimizing(false);
    }
  }, []); // ← INGEN dependencies = stabil callback reference
  
  // Optimera för svag enhet - STABILISERAD CALLBACK
  const optimizeForDevice = useCallback(async () => {
    if (isOptimizingRef.current || !isLowEndDevice) return;
    
    isOptimizingRef.current = true;
    setIsOptimizing(true);
    
    try {
      const { CacheManager } = await import('./cacheManager');
      const cacheManager = CacheManager.getInstance();
      await cacheManager.optimizeForDevice();
    } catch (error) {
      console.error('❌ Kunde inte optimera för enhet:', error);
    } finally {
      isOptimizingRef.current = false;
      setIsOptimizing(false);
    }
  }, [isLowEndDevice]); // Behåll isLowEndDevice dependency eftersom den ändras sällan
  
  // Automatisk optimering vid behov
  useEffect(() => {
    if (isLowEndDevice) {
      // Optimera efter att komponenten har laddat
      const timer = setTimeout(optimizeForDevice, 2000);
      return () => clearTimeout(timer);
    }
  }, [isLowEndDevice, optimizeForDevice]);
  
  return {
    isOptimizing,
    isLowEndDevice,
    clearApiCache,
    optimizeForDevice
  };
}

// NYTT: Hook för intelligent bildhantering baserat på enhet
export function useImageOptimization() {
  const [maxConcurrentImages, setMaxConcurrentImages] = useState(6);
  const [imageQuality, setImageQuality] = useState<'high' | 'medium' | 'low'>('high');
  
  useEffect(() => {
    const checkDevice = () => {
      const cores = navigator.hardwareConcurrency || 4;
      const memory = (navigator as any).deviceMemory || 4;
      const connection = (navigator as any).connection;
      
      // Justera baserat på enhet
      if (cores <= 2 && memory <= 2) {
        setMaxConcurrentImages(2);
        setImageQuality('low');
      } else if (cores <= 4 && memory <= 4) {
        setMaxConcurrentImages(4);
        setImageQuality('medium');
      } else {
        setMaxConcurrentImages(6);
        setImageQuality('high');
      }
      
      // Justera baserat på nätverksanslutning
      if (connection) {
        if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
          setMaxConcurrentImages(1);
          setImageQuality('low');
        } else if (connection.effectiveType === '3g') {
          setMaxConcurrentImages(2);
          setImageQuality('medium');
        }
      }
    };
    
    checkDevice();
  }, []);
  
  return {
    maxConcurrentImages,
    imageQuality,
    shouldPreload: imageQuality !== 'low'
  };
} 