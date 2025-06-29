'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer } from 'react-map-gl/maplibre';
import React from 'react';
import { useTimeSlider } from '../context/TimeSliderContext';

interface CurrentMagnitudeMetadata {
  bbox: [number, number, number, number]; // [lon_min, lon_max, lat_min, lat_max]
  total_images: number;
  timestamps: string[];
  colormap: Array<[number, string]>;
  resolution: number; // Grid-upplösning för bilderna (800, 1200, 1600, etc.)
  generated_at: string;
}

// Throttle function för att hantera dragging-prestanda
function useHeavyThrottle<T>(value: T, delay: number): T {
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
function useDraggingDetection(selectedHour: number): boolean {
  const [isDragging, setIsDragging] = useState(false);
  const lastChangeTime = useRef<number>(0);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setIsDragging(true);
    lastChangeTime.current = Date.now();
    
    if (dragTimer.current) {
      clearTimeout(dragTimer.current);
    }
    
    dragTimer.current = setTimeout(() => {
      setIsDragging(false);
    }, 300) as any;

    return () => {
      if (dragTimer.current) {
        clearTimeout(dragTimer.current);
      }
    };
  }, [selectedHour]);

  return isDragging;
}

interface CurrentMagnitudeLayerProps {
  visible?: boolean; // För att kunna toggla lagret on/off
  opacity?: number;  // Kontrollera transparens
}

const CurrentMagnitudeLayer = React.memo<CurrentMagnitudeLayerProps>(({ 
  visible = true, 
  opacity = 0.8 
}) => {
  const { current: map } = useMap();
  const { selectedHour, baseTime } = useTimeSlider();
  
  // Detect if user is actively dragging
  const isDragging = useDraggingDetection(selectedHour);
  
  // Use different throttling based on dragging state  
  const lightThrottledHour = useHeavyThrottle(selectedHour, 100);   // Faster when not dragging
  const heavyThrottledHour = useHeavyThrottle(selectedHour, 500);   // Slower when dragging
  const effectiveSelectedHour = isDragging ? heavyThrottledHour : lightThrottledHour;
  
  const [metadata, setMetadata] = useState<CurrentMagnitudeMetadata | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [preloadedImages, setPreloadedImages] = useState<Map<string, HTMLImageElement>>(new Map());

  // Lista över faktiska tillgängliga bilder (för att undvika 404)
  const availableImages = useMemo(() => [
    '2025-06-28T18-00-00.000Z',
    '2025-06-28T19-00-00.000Z',
    '2025-06-28T20-00-00.000Z',
    '2025-06-28T21-00-00.000Z',
    '2025-06-28T22-00-00.000Z',
    '2025-06-28T23-00-00.000Z',
    '2025-06-29T00-00-00.000Z',
    '2025-06-29T01-00-00.000Z',
    '2025-06-29T02-00-00.000Z',
    '2025-06-29T03-00-00.000Z',
    '2025-06-29T04-00-00.000Z',
    '2025-06-29T05-00-00.000Z',
    '2025-06-29T06-00-00.000Z',
    '2025-06-29T07-00-00.000Z',
    '2025-06-29T08-00-00.000Z',
    '2025-06-29T09-00-00.000Z',
    '2025-06-29T10-00-00.000Z',
    '2025-06-29T11-00-00.000Z',
    '2025-06-29T12-00-00.000Z',
    '2025-06-29T13-00-00.000Z',
    '2025-06-29T14-00-00.000Z',
    '2025-06-29T15-00-00.000Z',
    '2025-06-29T16-00-00.000Z',
    '2025-06-29T17-00-00.000Z',
    '2025-06-29T18-00-00.000Z',
    '2025-06-29T19-00-00.000Z',
    '2025-06-29T20-00-00.000Z',
    '2025-06-29T21-00-00.000Z',
    '2025-06-29T22-00-00.000Z',
    '2025-06-29T23-00-00.000Z',
    '2025-06-30T00-00-00.000Z',
    '2025-06-30T01-00-00.000Z',
    '2025-06-30T02-00-00.000Z',
    '2025-06-30T03-00-00.000Z',
    '2025-06-30T04-00-00.000Z',
    '2025-06-30T05-00-00.000Z',
    '2025-06-30T06-00-00.000Z',
    '2025-06-30T07-00-00.000Z',
    '2025-06-30T08-00-00.000Z',
    '2025-06-30T09-00-00.000Z',
    '2025-06-30T10-00-00.000Z',
    '2025-06-30T11-00-00.000Z',
    '2025-06-30T12-00-00.000Z',
    '2025-06-30T13-00-00.000Z',
    '2025-06-30T14-00-00.000Z',
    '2025-06-30T15-00-00.000Z',
    '2025-06-30T16-00-00.000Z',
    '2025-06-30T17-00-00.000Z',
    '2025-06-30T18-00-00.000Z',
    '2025-06-30T19-00-00.000Z',
    '2025-06-30T20-00-00.000Z',
    '2025-06-30T21-00-00.000Z',
    '2025-06-30T22-00-00.000Z',
    '2025-06-30T23-00-00.000Z',
    '2025-07-01T00-00-00.000Z',
    '2025-07-01T01-00-00.000Z',
    '2025-07-01T02-00-00.000Z',
    '2025-07-01T03-00-00.000Z',
    '2025-07-01T04-00-00.000Z',
    '2025-07-01T05-00-00.000Z',
    '2025-07-01T06-00-00.000Z',
    '2025-07-01T07-00-00.000Z',
    '2025-07-01T08-00-00.000Z',
    '2025-07-01T09-00-00.000Z',
    '2025-07-01T10-00-00.000Z',
    '2025-07-01T11-00-00.000Z',
    '2025-07-01T12-00-00.000Z',
    '2025-07-01T13-00-00.000Z',
    '2025-07-01T14-00-00.000Z',
    '2025-07-01T15-00-00.000Z',
    '2025-07-01T16-00-00.000Z',
    '2025-07-01T17-00-00.000Z',
    '2025-07-01T18-00-00.000Z',
    '2025-07-01T19-00-00.000Z',
    '2025-07-01T20-00-00.000Z',
    '2025-07-01T21-00-00.000Z',
    '2025-07-01T22-00-00.000Z',
    '2025-07-01T23-00-00.000Z',
    '2025-07-02T00-00-00.000Z',
    '2025-07-02T01-00-00.000Z',
    '2025-07-02T02-00-00.000Z',
    '2025-07-02T03-00-00.000Z',
    '2025-07-02T04-00-00.000Z',
    '2025-07-02T05-00-00.000Z',
    '2025-07-02T06-00-00.000Z',
    '2025-07-02T07-00-00.000Z',
    '2025-07-02T08-00-00.000Z',
    '2025-07-02T09-00-00.000Z',
    '2025-07-02T10-00-00.000Z',
    '2025-07-02T11-00-00.000Z',
    '2025-07-02T12-00-00.000Z',
    '2025-07-02T13-00-00.000Z',
    '2025-07-02T14-00-00.000Z',
    '2025-07-02T15-00-00.000Z',
    '2025-07-02T16-00-00.000Z',
    '2025-07-02T17-00-00.000Z',
    '2025-07-02T18-00-00.000Z',
    '2025-07-02T19-00-00.000Z',
    '2025-07-02T20-00-00.000Z',
    '2025-07-02T21-00-00.000Z',
    '2025-07-02T22-00-00.000Z',
    '2025-07-02T23-00-00.000Z',
    '2025-07-03T00-00-00.000Z',
    '2025-07-03T01-00-00.000Z',
    '2025-07-03T02-00-00.000Z',
    '2025-07-03T03-00-00.000Z',
    '2025-07-03T04-00-00.000Z',
    '2025-07-03T05-00-00.000Z',
    '2025-07-03T06-00-00.000Z',
    '2025-07-03T07-00-00.000Z',
    '2025-07-03T08-00-00.000Z',
    '2025-07-03T09-00-00.000Z',
    '2025-07-03T10-00-00.000Z',
    '2025-07-03T11-00-00.000Z',
    '2025-07-03T12-00-00.000Z',
    '2025-07-03T13-00-00.000Z',
    '2025-07-03T14-00-00.000Z',
    '2025-07-03T15-00-00.000Z',
    '2025-07-03T16-00-00.000Z',
    '2025-07-03T17-00-00.000Z',
    '2025-07-03T18-00-00.000Z'
  ], []);

  // 1) Ladda metadata FÖRST, sedan preload bilder i bakgrunden
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const response = await fetch('/data/current-magnitude-images/metadata.json');
        
        if (!response.ok) {
          // console.warn('⚠️ Current magnitude metadata inte tillgänglig än');
          return;
        }
        
        const data = await response.json();
        setMetadata(data);
        // console.log('✅ Current magnitude metadata laddad');
        
          } catch (error) {
      // console.warn('⚠️ Kunde inte ladda current magnitude metadata:', error);
      }
    };
    
    loadMetadata();
  }, []);

  // 1.5) Preload bilder i bakgrunden EFTER metadata laddats  
  useEffect(() => {
    if (availableImages.length === 0) return;
    
    const preloadImages = async () => {
      // console.log(`🚀 Bakgrundspreloading av ${availableImages.length} bilder...`);
      const imageMap = new Map<string, HTMLImageElement>();
      let loadedCount = 0;
      
      // Preload bilder gradvis för att inte blockera UI
      for (const safeTimestamp of availableImages) {
        const img = new Image();
        const imageUrl = `/data/current-magnitude-images/current_magnitude_${safeTimestamp}.png`;
        
        img.onload = () => {
          imageMap.set(safeTimestamp, img);
          loadedCount++;
          if (loadedCount % 10 === 0) {
            // console.log(`✅ Preloaded ${loadedCount}/${availableImages.length} bilder`);
          }
          // Update preloaded images incrementally
          setPreloadedImages(prev => new Map([...prev, [safeTimestamp, img]]));
        };
        
        img.onerror = () => {
          // console.log(`⚠️ Kunde inte preload: ${safeTimestamp}`);
        };
        
        img.src = imageUrl;
        
        // Small delay to prevent blocking the UI
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // console.log(`🎉 Alla ${loadedCount} bilder preloadade!`);
    };
    
    // Start preloading after a short delay to let initial render complete
    setTimeout(preloadImages, 1000);
  }, [availableImages]);

  // 2) Memoized timestamp prefix - DEFAULT till current time om baseTime saknas
  const timestampPrefix = useMemo(() => {
    // Om baseTime saknas, använd current time som fallback
    const currentTime = baseTime || Date.now();
    return new Date(currentTime + effectiveSelectedHour * 3600_000)
      .toISOString().slice(0, 13);
  }, [effectiveSelectedHour, baseTime]);

  // 2.5) Ladda initial bild direkt när metadata finns (inte vänta på interaction)
  useEffect(() => {
    if (!metadata?.timestamps || currentImageUrl) return;
    
    // Hitta närmaste tidsstämpel till nuvarande tid
    const now = new Date().toISOString().slice(0, 13);
    const initialTimestamp = metadata.timestamps.find(ts => ts.startsWith(now)) || metadata.timestamps[0];
    
    if (initialTimestamp) {
      const safeTimestamp = initialTimestamp.replaceAll(':', '-').replaceAll('+', 'plus');
      const imageUrl = `/data/current-magnitude-images/current_magnitude_${safeTimestamp}.png`;
      
      // console.log('🎯 Laddar initial magnitude bild:', safeTimestamp);
      setCurrentImageUrl(imageUrl);
      
      // Ladda bilden direkt även om den inte är preloaded
      const preloadedImg = preloadedImages.get(safeTimestamp);
      if (preloadedImg) {
        setImageLoaded(true);
      } else {
        // Ladda bilden manuellt om den inte är preloaded
        const img = new Image();
        img.onload = () => {
          setImageLoaded(true);
          // console.log('✅ Initial magnitude bild laddad');
        };
        img.onerror = () => {
          // console.log('❌ Kunde inte ladda initial magnitude bild');
        };
        img.src = imageUrl;
      }
    }
  }, [metadata?.timestamps, currentImageUrl, preloadedImages]);

  // 3) Hitta rätt bild för nuvarande tidsstämpel
  const findImageForTimestamp = useCallback((prefix: string) => {
    if (!metadata || !metadata.timestamps) return null;
    
    // Hitta exakt match för tidsstämpel-prefix
    const matchingTimestamp = metadata.timestamps.find(ts => 
      ts.startsWith(prefix)
    );
    
    if (!matchingTimestamp) {
      return null; // Tyst fail - inga warnings
    }
    
    // Kolla om bilden faktiskt finns
    const safeTimestamp = matchingTimestamp.replaceAll(':', '-').replaceAll('+', 'plus');
    const isAvailable = availableImages.includes(safeTimestamp);
    
    if (!isAvailable) {
      return null; // Tyst fail för bilder som inte finns
    }
    
    // Skapa URL för bilden baserat på tidsstämpel
    const imageUrl = `/data/current-magnitude-images/current_magnitude_${safeTimestamp}.png`;
    
    return imageUrl;
  }, [metadata, availableImages]);

  // 4) Smart bildväxling - använd preloaded om tillgänglig, annars ladda direkt
  useEffect(() => {
    if (!timestampPrefix || !metadata) return;
    
    const imageUrl = findImageForTimestamp(timestampPrefix);
    
    if (imageUrl !== currentImageUrl) {
      setCurrentImageUrl(imageUrl);
      
      if (imageUrl) {
        // Extrahera filename från URL för att matcha preloadad bild
        const filename = imageUrl.split('/').pop();
        const safeTimestamp = filename?.replace('current_magnitude_', '').replace('.png', '');
        
        const preloadedImg = preloadedImages.get(safeTimestamp || '');
        
        if (preloadedImg) {
          setImageLoaded(true); // INSTANT - bilden är redan laddad!
        } else {
          // Bilden är inte preloaded, ladda den direkt
          setImageLoaded(false);
          const img = new Image();
          img.onload = () => {
            // Dubbelkolla att detta fortfarande är rätt bild
            if (imageUrl === currentImageUrl) {
              setImageLoaded(true);
            }
          };
          img.onerror = () => {
            // console.log('❌ Kunde inte ladda magnitude bild:', safeTimestamp);
          };
          img.src = imageUrl;
        }
      } else {
        setImageLoaded(false);
      }
    }
  }, [timestampPrefix, metadata, findImageForTimestamp, currentImageUrl, preloadedImages]);

  // 5) Skapa MapLibre GL Source/Layer för raster
  const rasterSource = useMemo(() => {
    if (!currentImageUrl || !imageLoaded || !metadata?.bbox) {
      return null;
    }
    
    const [lon_min, lon_max, lat_min, lat_max] = metadata.bbox;
    
    // Finjustera koordinaterna för exakt alignment baserat på visuell inspektion
    const lat_offset = -0.052;   // Flytta bilden mer söderut  
    const lon_offset = 0.00;   // Flytta bilden västerut istället
    
    return {
      type: 'image' as const,
      url: currentImageUrl,
      coordinates: [
        [lon_min + lon_offset, lat_max + lat_offset], // top-left
        [lon_max + lon_offset, lat_max + lat_offset], // top-right
        [lon_max + lon_offset, lat_min + lat_offset], // bottom-right  
        [lon_min + lon_offset, lat_min + lat_offset], // bottom-left
      ] as [[number, number], [number, number], [number, number], [number, number]]
    };
  }, [currentImageUrl, imageLoaded, metadata]);

  // 6) Layer configuration - säkerställ att magnitude hamnar UNDER pilar  
  const rasterLayer = useMemo(() => {
    if (!visible) return null;
    
    return {
      id: 'current-magnitude-raster',
      type: 'raster' as const,
      paint: {
        'raster-opacity': opacity,
        'raster-fade-duration': 300, // Mjuk övergång mellan bilder
      }
    };
  }, [visible, opacity]);

  // Visa inget om inte synligt eller ingen data
  if (!visible || !rasterSource || !rasterLayer) {
    return null;
  }

  return (
    <Source id="current-magnitude-source" {...rasterSource}>
      <Layer {...rasterLayer} />
    </Source>
  );
});

CurrentMagnitudeLayer.displayName = 'CurrentMagnitudeLayer';

export default CurrentMagnitudeLayer; 