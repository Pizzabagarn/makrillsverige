'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer } from 'react-map-gl/maplibre';
import React from 'react';
import { useTimeSlider } from '../context/TimeSliderContext';
import { useHeavyThrottle, useDraggingDetection } from '../../lib/throttleHooks';
import { getLayerOffsetForBbox } from '../../lib/layerOffsets';

interface TemperatureMetadata {
  bbox: [number, number, number, number]; // [lon_min, lon_max, lat_min, lat_max]
  total_images: number;
  timestamps: string[];
  colormap: Array<[number, string]>;
  resolution: number;
  generated_at: string;
}

interface TemperatureLayerProps {
  visible?: boolean;
  opacity?: number;
}

const TemperatureLayer = React.memo<TemperatureLayerProps>(({ 
  visible = true, 
  opacity = 0.8 
}) => {
  const { current: map } = useMap();
  const { selectedHour, displayHour, baseTime } = useTimeSlider();
  
  // Detect if user is actively dragging - samma som CurrentMagnitudeLayer
  const isDragging = useDraggingDetection(selectedHour);
  
  // Much faster throttling for smooth simulation effect
  const lightThrottledHour = useHeavyThrottle(displayHour, 10);   // Very fast when not dragging
  const heavyThrottledHour = useHeavyThrottle(displayHour, 50);   // Still fast when dragging
  const effectiveSelectedHour = isDragging ? heavyThrottledHour : lightThrottledHour;
  
  const [metadata, setMetadata] = useState<TemperatureMetadata | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [preloadedImages, setPreloadedImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);

  // Dynamisk upptäckt av tillgängliga bilder från metadata - samma som CurrentMagnitudeLayer
  const availableImages = useMemo(() => {
    if (!metadata?.timestamps) return [];
    
    // Konvertera metadata timestamps till safe filenames
    return metadata.timestamps.map(timestamp => 
      timestamp.replaceAll(':', '-').replaceAll('+', 'plus')
    );
  }, [metadata?.timestamps]);

  // Load metadata - EAGER LOADING
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const response = await fetch('/data/temperature-images-mercator/metadata.json');
        
        if (!response.ok) {
          return;
        }
        
        const data = await response.json();
        setMetadata(data);
        
        // CACHE BUSTING: Spara generated_at för senare usage
        if (data.generated_at) {
          setGeneratedAt(new Date(data.generated_at).getTime());
        }
        
      } catch (error) {
        // Tyst fail - ta bort console.warn för bättre prestanda
      }
    };
    
    // Ladda metadata direkt vid komponentstart - ingen visible check
    loadMetadata();
  }, []);

  // Preload bilder i bakgrunden EFTER metadata laddats - IMMEDIATE PRELOADING
  useEffect(() => {
    if (availableImages.length === 0 || !generatedAt) return;
    
    const preloadImages = async () => {
      const imageMap = new Map<string, HTMLImageElement>();
      let loadedCount = 0;
      
      // Preload ALLA bilder gradvis för att inte blockera UI
      for (const safeTimestamp of availableImages) {
        const img = new Image();
        // CACHE BUSTING: Lägg till generated_at som cache buster
        const imageUrl = `/data/temperature-images-mercator/temperature_${safeTimestamp}.webp?v=${generatedAt}`;
        
        img.onload = () => {
          imageMap.set(safeTimestamp, img);
          loadedCount++;
          if (loadedCount % 10 === 0) {
            // Progress tracking
          }
          // Update preloaded images incrementally
          setPreloadedImages(prev => new Map([...prev, [safeTimestamp, img]]));
        };
        
        img.onerror = () => {
          // WebP fallback: try PNG if WebP fails
          if (imageUrl.includes('.webp')) {
            const pngUrl = imageUrl.replace('.webp', '.png'); // Cache-busting behålls från original URL
            const pngImg = new Image();
            pngImg.onload = () => {
              imageMap.set(safeTimestamp, pngImg);
              loadedCount++;
              setPreloadedImages(prev => new Map([...prev, [safeTimestamp, pngImg]]));
              console.log(`🔄 WebP fallback till PNG: ${safeTimestamp}`);
            };
            pngImg.onerror = () => {
              console.warn(`❌ Både WebP och PNG misslyckades: ${safeTimestamp}`);
            };
            pngImg.src = pngUrl;
          }
        };
        
        img.src = imageUrl;
        
        // MINIMAL delay för maximal hastighet med 8GB heap
        await new Promise(resolve => setTimeout(resolve, 1));
      }
      
      // All images preloaded
    };
    
    // Start preloading immediately with delay after current images
    setTimeout(preloadImages, 200);
  }, [availableImages, generatedAt]);

  // Memoized timestamp prefix - samma som CurrentMagnitudeLayer
  const timestampPrefix = useMemo(() => {
    // Om baseTime saknas, använd current time som fallback
    const currentTime = baseTime || Date.now();
    return new Date(currentTime + effectiveSelectedHour * 3600_000)
      .toISOString().slice(0, 13);
  }, [effectiveSelectedHour, baseTime]);

  // Ladda initial bild direkt när metadata finns - samma som CurrentMagnitudeLayer
  useEffect(() => {
    if (!metadata?.timestamps || currentImageUrl) return;
    
    // Hitta närmaste tidsstämpel till nuvarande tid
    const now = new Date().toISOString().slice(0, 13);
    const initialTimestamp = metadata.timestamps.find(ts => ts.startsWith(now)) || metadata.timestamps[0];
    
    if (initialTimestamp) {
      const safeTimestamp = initialTimestamp.replaceAll(':', '-').replaceAll('+', 'plus');
      const imageUrl = `/data/temperature-images-mercator/temperature_${safeTimestamp}.png`;
      

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

        };
        img.onerror = () => {

        };
        // CACHE BUSTING: Lägg till generated_at parameter
        const imageUrlWithCache = generatedAt ? `${imageUrl}?v=${generatedAt}` : imageUrl;
        img.src = imageUrlWithCache;
      }
    }
  }, [metadata?.timestamps, preloadedImages, currentImageUrl]);

  // Hitta rätt bild för nuvarande tidsstämpel - samma som CurrentMagnitudeLayer
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
    
    // Skapa URL för bilden baserat på tidsstämpel (prioritera WebP) med cache-busting
    const baseUrl = `/data/temperature-images-mercator/temperature_${safeTimestamp}.webp`;
    const imageUrl = generatedAt ? `${baseUrl}?v=${generatedAt}` : baseUrl;
    
    return imageUrl;
  }, [metadata, availableImages]);

  // Smart bildväxling - samma som CurrentMagnitudeLayer
  useEffect(() => {
    if (!timestampPrefix || !metadata) return;
    
    const imageUrl = findImageForTimestamp(timestampPrefix);
    
    if (imageUrl !== currentImageUrl) {
      setCurrentImageUrl(imageUrl);
      
      if (imageUrl) {
        // Extrahera filename från URL för att matcha preloadad bild
        const filename = imageUrl.split('/').pop();
        const safeTimestamp = filename?.replace('temperature_', '').replace('.png', '');
        
        const preloadedImg = preloadedImages.get(safeTimestamp || '');
        
        if (preloadedImg) {
          setImageLoaded(true); // INSTANT - bilden är redan laddad!
        } else {
          // Bilden är inte preloaded, ladda den direkt
          setImageLoaded(false);
          const img = new Image();
          // CACHE BUSTING: Lägg till generated_at parameter
          const imageUrlWithCache = generatedAt ? `${imageUrl}?v=${generatedAt}` : imageUrl;
          
          img.onload = () => {
            // Dubbelkolla att detta fortfarande är rätt bild (använd img.src istället för currentImageUrl)
            if (img.src === imageUrlWithCache) {
              setImageLoaded(true);
            }
          };
          img.onerror = () => {
            // Tyst fail
          };
          img.src = imageUrlWithCache;
        }
      } else {
        setImageLoaded(false);
      }
    }
  }, [timestampPrefix, metadata, findImageForTimestamp, preloadedImages, currentImageUrl]);

  // Skapa MapLibre GL Source/Layer för raster - samma som CurrentMagnitudeLayer
  const rasterSource = useMemo(() => {
    if (!currentImageUrl || !imageLoaded || !metadata?.bbox) {
      return null;
    }
    
    const [lon_min, lon_max, lat_min, lat_max] = metadata.bbox;
    
    // Använd regionspecifik offset baserat på bbox
    const offset = getLayerOffsetForBbox(lon_min, lon_max, lat_min, lat_max);
    const { lat_offset, lon_offset } = offset;   
    
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

  // Layer configuration - samma som CurrentMagnitudeLayer
  const rasterLayer = useMemo(() => {
    if (!visible) return null;
    
    return {
      id: 'temperature-raster',
      type: 'raster' as const,
      paint: {
        'raster-opacity': opacity,
        'raster-fade-duration': 300, // Mjuk övergång mellan bilder - samma som CurrentMagnitudeLayer
      }
    };
  }, [visible, opacity]);

  // Visa inget om inte synligt eller ingen data
  if (!visible || !rasterSource || !rasterLayer) {
    return null;
  }

  return (
    <Source id="temperature-source" {...rasterSource}>
      <Layer {...rasterLayer} />
    </Source>
  );
});

TemperatureLayer.displayName = 'TemperatureLayer';

export default TemperatureLayer; 