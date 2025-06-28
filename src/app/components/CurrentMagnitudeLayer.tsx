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
    '2025-06-27T12-00-00.000Z',
    '2025-06-27T13-00-00.000Z', 
    '2025-06-27T14-00-00.000Z',
    '2025-06-27T15-00-00.000Z',
    '2025-06-27T16-00-00.000Z'
  ], []);

  // 1) Ladda metadata OCH preload alla bilder direkt
  useEffect(() => {
    const loadMetadataAndPreloadImages = async () => {
      try {
        const response = await fetch('/data/current-magnitude-images/metadata.json');
        
        if (!response.ok) {
          console.warn('⚠️ Current magnitude metadata inte tillgänglig än');
          return;
        }
        
        const data = await response.json();
        setMetadata(data);
        
        // PRESTANDA: Preload alla tillgängliga bilder direkt för instant switching
        console.log('🚀 Preloading bilder för instant prestanda...');
        const imageMap = new Map<string, HTMLImageElement>();
        let loadedCount = 0;
        
        const preloadPromises = availableImages.map((safeTimestamp) => {
          return new Promise<void>((resolve) => {
            const img = new Image();
            const imageUrl = `/data/current-magnitude-images/current_magnitude_${safeTimestamp}.png`;
            
            img.onload = () => {
              imageMap.set(safeTimestamp, img);
              loadedCount++;
              console.log(`✅ Preloaded ${loadedCount}/${availableImages.length}: ${safeTimestamp}`);
              resolve();
            };
            
            img.onerror = () => {
              console.log(`⚠️ Kunde inte preload: ${safeTimestamp}`);
              resolve();
            };
            
            img.src = imageUrl;
          });
        });
        
        // Vänta på att alla bilder laddar
        await Promise.all(preloadPromises);
        setPreloadedImages(imageMap);
        console.log(`🎉 Alla ${loadedCount} bilder preloadade - instant switching aktivt!`);
        
      } catch (error) {
        console.warn('⚠️ Kunde inte ladda current magnitude metadata:', error);
      }
    };
    
    loadMetadataAndPreloadImages();
  }, [availableImages]);

  // 2) Memoized timestamp prefix - baseTime is current UTC hour
  const timestampPrefix = useMemo(() => {
    if (!baseTime) return '';
    return new Date(baseTime + effectiveSelectedHour * 3600_000)
      .toISOString().slice(0, 13);
  }, [effectiveSelectedHour, baseTime]);

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

  // 4) INSTANT bildväxling med preloadade bilder
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
          setImageLoaded(false);
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

  // 6) Layer configuration - LAG Z-INDEX FÖR ATT VARA UNDER PILAR
  const rasterLayer = useMemo(() => {
    if (!visible) return null;
    
    return {
      id: 'current-magnitude-raster',
      type: 'raster' as const,
      paint: {
        'raster-opacity': opacity,
        'raster-fade-duration': 300, // Mjuk övergång mellan bilder
      },
      metadata: {
        'z-index': 10 // Låg z-index så pilar (z-index 20) renderas ovanpå
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