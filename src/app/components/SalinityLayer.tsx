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

  // Preload bilder i bakgrunden EFTER metadata laddats - samma som CurrentMagnitudeLayer
  useEffect(() => {
    if (availableImages.length === 0) return;
    
    const preloadImages = async () => {
      const imageMap = new Map<string, HTMLImageElement>();
      let loadedCount = 0;
      
      // Preload ALLA bilder gradvis för att inte blockera UI
      for (const safeTimestamp of availableImages) {
        const img = new Image();
        const imageUrl = `/data/salinity-images/salinity_${safeTimestamp}.png`;
        
        img.onload = () => {
          imageMap.set(safeTimestamp, img);
          loadedCount++;
          // Update preloaded images incrementally
          setPreloadedImages(prev => new Map([...prev, [safeTimestamp, img]]));
        };
        
        img.onerror = () => {
          // Tyst fail för bättre prestanda
        };
        
        img.src = imageUrl;
        
        // Small delay to prevent blocking the UI
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    };
    
    // Start preloading after a short delay to let initial render complete
    setTimeout(preloadImages, 1000);
  }, [availableImages]);

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
      const imageUrl = `/data/salinity-images/salinity_${safeTimestamp}.png`;
      
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
          // Tyst fail
        };
        img.src = imageUrl;
      }
    }
  }, [metadata?.timestamps, currentImageUrl, preloadedImages]);

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
            if (imageUrl === currentImageUrl) {
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
  }, [timestampPrefix, metadata, findImageForTimestamp, currentImageUrl, preloadedImages]);

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