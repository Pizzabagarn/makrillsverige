'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTimeSlider } from '../context/TimeSliderContext';
import { useAreaParameters } from '../context/AreaParametersContext';
import LayerPreloadingManager from '@/lib/layerPreloadingManager';
import { useSimulationLayer } from '../context/SimulationContext';
import { useCacheInvalidation } from '../context/CacheInvalidationContext';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer } from 'react-map-gl/maplibre';
import React from 'react';
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
  const { selectedHour, baseTime } = useTimeSlider();
  const { simulationLayer } = useSimulationLayer();
  const { lastInvalidation } = useCacheInvalidation();
  const mapInstance = useMap();

  // Detect if user is actively dragging
  const isDragging = useDraggingDetection(selectedHour);
  
  // Much faster throttling for smooth simulation effect
  const lightThrottledHour = useHeavyThrottle(selectedHour, 10);   // Very fast when not dragging
  const heavyThrottledHour = useHeavyThrottle(selectedHour, 50);   // Still fast when dragging
  const effectiveSelectedHour = isDragging ? heavyThrottledHour : lightThrottledHour;
  
  const [metadata, setMetadata] = useState<CurrentMagnitudeMetadata | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [preloadedImages, setPreloadedImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);

  // Dynamisk upptäckt av tillgängliga bilder från metadata
  const availableImages = useMemo(() => {
    if (!metadata?.timestamps) return [];
    
    // Konvertera metadata timestamps till safe filenames
    return metadata.timestamps.map(timestamp => 
      timestamp.replaceAll(':', '-').replaceAll('+', 'plus')
    );
  }, [metadata?.timestamps]);

  // Load metadata - EAGER LOADING med cache invalidation support
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        // Använd cache busting om cache har invaliderats
        const cacheParam = lastInvalidation ? `?t=${lastInvalidation}` : '';
        const response = await fetch(`/data/current-images-mercator/metadata.json${cacheParam}`);
        
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
  }, [lastInvalidation]); // Re-run när cache invalideras

  // Preload bilder i bakgrunden - IMMEDIATE PRELOADING
  useEffect(() => {
    if (availableImages.length === 0 || !generatedAt) return;
    
    const preloadImages = async () => {
      const imageMap = new Map<string, HTMLImageElement>();
      let loadedCount = 0;
      
      // Preload bilder gradvis för att inte blockera UI
      for (const safeTimestamp of availableImages) {
        const img = new Image();
        // CACHE BUSTING: Lägg till generated_at och invalidation som cache buster
        const cacheParams = [
          generatedAt && `v=${generatedAt}`,
          lastInvalidation && `t=${lastInvalidation}`
        ].filter(Boolean).join('&');
        const imageUrl = `/data/current-images-mercator/current_magnitude_${safeTimestamp}.webp?${cacheParams}`;
        
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
            const pngUrl = imageUrl.replace('.webp', '.png');
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
    
    // Start preloading immediately - no delay
    setTimeout(preloadImages, 100);
  }, [availableImages, generatedAt, lastInvalidation]);

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
          console.log('❌ Kunde inte ladda initial magnitude bild:', safeTimestamp);
        };
        // CACHE BUSTING: Lägg till generated_at och invalidation parameter
        const cacheParams = [
          generatedAt && `v=${generatedAt}`,
          lastInvalidation && `t=${lastInvalidation}`
        ].filter(Boolean).join('&');
        const imageUrlWithCache = cacheParams ? `${imageUrl}?${cacheParams}` : imageUrl;
        img.src = imageUrlWithCache;
      }
    }
  }, [metadata?.timestamps, preloadedImages, currentImageUrl]);

  // 3) Hitta rätt bild för nuvarande tidsstämpel
  const findImageForTimestamp = useMemo(() => {
    if (!metadata || !metadata.timestamps) return null;
    
    // Hitta exakt match för tidsstämpel-prefix
    const matchingTimestamp = metadata.timestamps.find(ts => 
      ts.startsWith(timestampPrefix)
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
    
    // Skapa URL för bilden baserat på tidsstämpel (prioritera WebP)
    const imageUrl = `/data/current-images-mercator/current_magnitude_${safeTimestamp}.webp`;
    
    return imageUrl;
  }, [metadata, availableImages, timestampPrefix]);

  // 4) Smart bildväxling - använd GLOBAL preloaded om tillgänglig, annars fallback till lokal
  useEffect(() => {
    if (!timestampPrefix || !metadata) return;
    
    const imageUrl = findImageForTimestamp;
    
    if (imageUrl !== currentImageUrl) {
      setCurrentImageUrl(imageUrl);
      
      if (imageUrl) {
        // Extrahera filename från URL för att matcha preloadad bild
        const filename = imageUrl.split('/').pop();
        const safeTimestamp = filename?.replace('current_magnitude_', '').replace('.png', '');
        
        // Först: försök med global preloading manager
        const preloadingManager = LayerPreloadingManager.getInstance();
        const globalPreloadedImg = preloadingManager.getPreloadedImage('current-magnitude', safeTimestamp || '');
        
        if (globalPreloadedImg) {
          setImageLoaded(true); // INSTANT - bilden är redan laddad globalt!
          console.log('⚡ Global preloaded current magnitude:', safeTimestamp);
        } else {
          // Fallback: lokal preloaded bild
          const localPreloadedImg = preloadedImages.get(safeTimestamp || '');
          
          if (localPreloadedImg) {
            setImageLoaded(true); // INSTANT - bilden är redan laddad lokalt!
            console.log('⚡ Local preloaded current magnitude:', safeTimestamp);
          } else {
            // Bilden är inte preloaded, ladda den direkt
            setImageLoaded(false);
            console.log('⏳ Laddar current magnitude bild (inte cached):', safeTimestamp);
            const img = new Image();
            let isCurrentRequest = true;
            
            // CACHE BUSTING: Lägg till generated_at och invalidation parameter
            const cacheParams = [
              generatedAt && `v=${generatedAt}`,
              lastInvalidation && `t=${lastInvalidation}`
            ].filter(Boolean).join('&');
            const imageUrlWithCache = cacheParams ? `${imageUrl}?${cacheParams}` : imageUrl;
            
            img.onload = () => {
              // Dubbelkolla att detta fortfarande är rätt bild OCH att requesten inte är avbruten
              if (isCurrentRequest && img.src === imageUrlWithCache) {
                setImageLoaded(true);
              }
            };
            img.onerror = () => {
              if (isCurrentRequest) {
                // console.log('❌ Kunde inte ladda magnitude bild:', safeTimestamp);
              }
            };
            img.src = imageUrlWithCache;
            
            // Cleanup function för att avbryta gamla requests
            return () => {
              isCurrentRequest = false;
              img.onload = null;
              img.onerror = null;
              img.src = ''; // Avbryt laddningen
            };
          }
        }
      } else {
        setImageLoaded(false);
      }
    }
  }, [timestampPrefix, metadata, findImageForTimestamp, preloadedImages, currentImageUrl]);

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