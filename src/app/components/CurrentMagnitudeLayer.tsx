'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer } from 'react-map-gl/maplibre';
import React from 'react';
import { useTimeSlider } from '../context/TimeSliderContext';
import { useHeavyThrottle, useDraggingDetection } from '../../lib/throttleHooks';
import { getLayerOffsetForBbox } from '../../lib/layerOffsets';

interface CurrentMagnitudeMetadata {
  bbox: [number, number, number, number]; // [lon_min, lon_max, lat_min, lat_max]
  total_images: number;
  timestamps: string[];
  colormap: Array<[number, string]>;
  resolution: number; // Grid-upplösning för bilderna (800, 1200, 1600, etc.)
  generated_at: string;
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

  // Dynamisk upptäckt av tillgängliga bilder från metadata
  const availableImages = useMemo(() => {
    if (!metadata?.timestamps) return [];
    
    // Konvertera metadata timestamps till safe filenames
    return metadata.timestamps.map(timestamp => 
      timestamp.replaceAll(':', '-').replaceAll('+', 'plus')
    );
  }, [metadata?.timestamps]);

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
  }, [metadata?.timestamps, preloadedImages]);

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
            // Dubbelkolla att detta fortfarande är rätt bild (använd img.src istället för currentImageUrl)
            if (img.src === imageUrl) {
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
  }, [timestampPrefix, metadata, findImageForTimestamp, preloadedImages]);

  // 5) Skapa MapLibre GL Source/Layer för raster
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