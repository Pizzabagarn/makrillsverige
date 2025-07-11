'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer } from 'react-map-gl/maplibre';
import React from 'react';
import { useTimeSlider } from '../context/TimeSliderContext';
import { useHeavyThrottle, useDraggingDetection } from '../../lib/throttleHooks';
import { getLayerOffsetForBbox } from '../../lib/layerOffsets';

interface SalinityMetadata {
  bbox: [number, number, number, number]; // [lon_min, lon_max, lat_min, lat_max]
  total_images: number;
  timestamps: string[];
  colormap: Array<[number, string]>;
  resolution: number;
  generated_at: string;
}

interface SalinityLayerProps {
  visible?: boolean;
  opacity?: number;
}

const SalinityLayer = React.memo<SalinityLayerProps>(({ 
  visible = true, 
  opacity = 0.8 
}) => {
  const { current: map } = useMap();
  const { selectedHour, baseTime } = useTimeSlider();
  
  // Detect if user is actively dragging - samma som CurrentMagnitudeLayer
  const isDragging = useDraggingDetection(selectedHour);
  
  // Use different throttling based on dragging state  
  const lightThrottledHour = useHeavyThrottle(selectedHour, 100);
  const heavyThrottledHour = useHeavyThrottle(selectedHour, 500);
  const effectiveSelectedHour = isDragging ? heavyThrottledHour : lightThrottledHour;
  
  const [metadata, setMetadata] = useState<SalinityMetadata | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [preloadedImages, setPreloadedImages] = useState<Map<string, HTMLImageElement>>(new Map());

  // Dynamisk upptäckt av tillgängliga bilder från metadata - samma som CurrentMagnitudeLayer
  const availableImages = useMemo(() => {
    if (!metadata?.timestamps) return [];
    
    // Konvertera metadata timestamps till safe filenames
    return metadata.timestamps.map(timestamp => 
      timestamp.replaceAll(':', '-').replaceAll('+', 'plus')
    );
  }, [metadata?.timestamps]);

  // Load metadata - samma som CurrentMagnitudeLayer
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const response = await fetch('/data/salinity-images/metadata.json');
        
        if (!response.ok) {
          return;
        }
        
        const data = await response.json();
        setMetadata(data);
        
      } catch (error) {
        // Tyst fail - ta bort console.warn för bättre prestanda
      }
    };
    
    loadMetadata();
  }, []);

  // Optimized preloading - prioritera första bilden, sedan resten i bakgrunden
  useEffect(() => {
    if (availableImages.length === 0 || !baseTime) return;
    
    const preloadImages = async () => {
      console.log(`🚀 Optimerad preloading av ${availableImages.length} salinity bilder...`);
      const imageMap = new Map<string, HTMLImageElement>();
      let loadedCount = 0;
      
      // 1. Bestäm vilken bild som ska visas först (baserat på selectedHour)
      const firstImageTime = new Date(baseTime + selectedHour * 3600_000);
      const firstImagePrefix = firstImageTime.toISOString().slice(0, 13);
      const firstImageTimestamp = metadata?.timestamps?.find(ts => ts.startsWith(firstImagePrefix));
      const firstImageSafeTimestamp = firstImageTimestamp?.replaceAll(':', '-').replaceAll('+', 'plus');
      
      // 2. Ladda första bilden omedelbart (högsta prioritet)
      if (firstImageSafeTimestamp && availableImages.includes(firstImageSafeTimestamp)) {
        const img = new Image();
        const imageUrl = `/data/salinity-images/salinity_${firstImageSafeTimestamp}.png`;
        
        img.onload = () => {
          imageMap.set(firstImageSafeTimestamp, img);
          loadedCount++;
          setPreloadedImages(prev => new Map([...prev, [firstImageSafeTimestamp, img]]));
          console.log('⚡ Första salinity bild preloaded:', firstImageSafeTimestamp);
        };
        
        img.onerror = () => {
          console.log('⚠️ Kunde inte preload första salinity bild:', firstImageSafeTimestamp);
        };
        
        img.src = imageUrl;
      }
      
      // 3. Vänta lite för att låta första bilden ladda, sedan ladda resten
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 4. Preload alla andra bilder i bakgrunden
      for (const safeTimestamp of availableImages) {
        // Skippa första bilden som redan laddats
        if (safeTimestamp === firstImageSafeTimestamp) continue;
        
        const img = new Image();
        const imageUrl = `/data/salinity-images/salinity_${safeTimestamp}.png`;
        
        img.onload = () => {
          imageMap.set(safeTimestamp, img);
          loadedCount++;
          if (loadedCount % 10 === 0) {
            console.log(`✅ Preloaded ${loadedCount}/${availableImages.length} salinity bilder`);
          }
          setPreloadedImages(prev => new Map([...prev, [safeTimestamp, img]]));
        };
        
        img.onerror = () => {
          // Tyst fail för bättre prestanda
        };
        
        img.src = imageUrl;
        
        // Small delay to prevent blocking the UI
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      console.log(`🎉 Alla ${loadedCount} salinity bilder preloadade!`);
    };
    
    // Start preloading immediately för första bilden, sedan resten i bakgrunden
    setTimeout(preloadImages, 100);
  }, [availableImages, baseTime, selectedHour, metadata?.timestamps]);

  // Memoized timestamp prefix - samma som CurrentMagnitudeLayer
  const timestampPrefix = useMemo(() => {
    // Om baseTime saknas, använd current time som fallback
    const currentTime = baseTime || Date.now();
    return new Date(currentTime + effectiveSelectedHour * 3600_000)
      .toISOString().slice(0, 13);
  }, [effectiveSelectedHour, baseTime]);

  // Ladda initial bild direkt när metadata finns eller när lagret blir synligt
  useEffect(() => {
    if (!metadata?.timestamps || !baseTime || !visible) return;
    
    // Använd selectedHour för att bestämma initial bild (inte nuvarande tid)
    const initialTime = new Date(baseTime + selectedHour * 3600_000);
    const initialTimePrefix = initialTime.toISOString().slice(0, 13);
    const initialTimestamp = metadata.timestamps.find(ts => ts.startsWith(initialTimePrefix)) || metadata.timestamps[0];
    
    if (initialTimestamp) {
      const safeTimestamp = initialTimestamp.replaceAll(':', '-').replaceAll('+', 'plus');
      const imageUrl = `/data/salinity-images/salinity_${safeTimestamp}.png`;
      
      // Kolla om vi redan har denna bild laddad
      if (currentImageUrl === imageUrl && imageLoaded) {
        console.log('⚡ Salinity bild redan laddad:', safeTimestamp);
        return;
      }
      
      console.log('🎯 Laddar initial salinity bild för selectedHour:', selectedHour, 'timestamp:', safeTimestamp, 'visible:', visible);
      setCurrentImageUrl(imageUrl);
      
      // Ladda bilden direkt även om den inte är preloaded
      const preloadedImg = preloadedImages.get(safeTimestamp);
      if (preloadedImg) {
        setImageLoaded(true);
        console.log('⚡ Initial salinity bild från cache:', safeTimestamp);
      } else {
        // Ladda bilden manuellt om den inte är preloaded
        setImageLoaded(false);
        const img = new Image();
        img.onload = () => {
          setImageLoaded(true);
          console.log('✅ Initial salinity bild laddad:', safeTimestamp);
        };
        img.onerror = () => {
          console.log('❌ Kunde inte ladda initial salinity bild:', safeTimestamp);
        };
        img.src = imageUrl;
      }
    }
  }, [metadata?.timestamps, preloadedImages, selectedHour, baseTime, visible]);

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
    
    // Skapa URL för bilden baserat på tidsstämpel
    const imageUrl = `/data/salinity-images/salinity_${safeTimestamp}.png`;
    
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
        const safeTimestamp = filename?.replace('salinity_', '').replace('.png', '');
        
        const preloadedImg = preloadedImages.get(safeTimestamp || '');
        
        if (preloadedImg) {
          setImageLoaded(true); // INSTANT - bilden är redan laddad!
        } else {
          // Bilden är inte preloaded, ladda den direkt
          setImageLoaded(false);
          const img = new Image();
          img.onload = () => {
            // Dubbelkolla att detta fortfarande är rätt bild
            if (img.src === imageUrl) {
              setImageLoaded(true);
            }
          };
          img.onerror = () => {
            // Tyst fail
          };
          img.src = imageUrl;
        }
      } else {
        setImageLoaded(false);
      }
    }
  }, [timestampPrefix, metadata, findImageForTimestamp, preloadedImages]);

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
      id: 'salinity-raster',
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
    <Source id="salinity-source" {...rasterSource}>
      <Layer {...rasterLayer} />
    </Source>
  );
});

SalinityLayer.displayName = 'SalinityLayer';

export default SalinityLayer; 