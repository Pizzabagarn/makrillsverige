'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer } from 'react-map-gl/maplibre';
import React from 'react';
import { useTimeSlider } from '../context/TimeSliderContext';
import { useHeavyThrottle, useDraggingDetection } from '../../lib/throttleHooks';

interface TemperatureMetadata {
  parameter: string;
  generated_at: string;
  resolution: string;
  wgs84_bbox: [number, number, number, number];
  mercator_bbox: [number, number, number, number];
  projection: string;
  total_images: number;
  images: Array<{
    timestamp: string;
    filename: string;
    data_points: number;
    value_range: [number, number] | null;
    mercator_coordinates: [[number, number], [number, number], [number, number], [number, number]];
  }>;
}

interface TemperatureLayerMercatorProps {
  visible?: boolean;
  opacity?: number;
}

const TemperatureLayerMercator = React.memo<TemperatureLayerMercatorProps>(({ 
  visible = true, 
  opacity = 0.8 
}) => {
  const mapRef = useMap();
  const [metadata, setMetadata] = useState<TemperatureMetadata | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [preloadedImages, setPreloadedImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [debouncedImageUrl, setDebouncedImageUrl] = useState<string | null>(null);
  const [debouncedImageLoaded, setDebouncedImageLoaded] = useState(false);
  
  const { selectedHour, displayHour, baseTime } = useTimeSlider();
  const isDragging = useDraggingDetection(selectedHour);
  
  // Convert displayHour to Date for throttling
  const currentTime = useMemo(() => {
    return new Date(baseTime + displayHour * 3600 * 1000);
  }, [baseTime, displayHour]);
  
  // Much faster throttling for smooth simulation effect
  const throttledTime = useHeavyThrottle(currentTime, isDragging ? 50 : 10);

  // 1) Ladda metadata vid komponentstart - EAGER LOADING
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const response = await fetch('/data/temperature-images-mercator/metadata.json');
        if (response.ok) {
          const data = await response.json();
          setMetadata(data);
        } else if (response.status === 404) {
          console.warn('⚠️ Temperature Mercator metadata inte funnen - bilder behöver genereras först');
        } else {
          console.error('❌ Kunde inte ladda Temperature Mercator metadata');
        }
      } catch (error) {
        console.warn('⚠️ Temperature Mercator metadata inte tillgänglig:', error instanceof Error ? error.message : String(error));
      }
    };

    // Ladda metadata direkt vid komponentstart - ingen visible check
    loadMetadata();
  }, []);

  // 1.5) Preload bilder i bakgrunden EFTER metadata laddats
  useEffect(() => {
    if (!metadata?.images || metadata.images.length === 0) return;
    
    const preloadImages = async () => {
      const imageMap = new Map<string, HTMLImageElement>();
      let loadedCount = 0;
      
      // Preload bilder gradvis för att inte blockera UI
      for (const imageInfo of metadata.images) {
        const img = new Image();
        const imageUrl = `/data/temperature-images-mercator/${imageInfo.filename}`;
        
        img.onload = () => {
          imageMap.set(imageInfo.filename, img);
          loadedCount++;
          // Update preloaded images incrementally
          setPreloadedImages(prev => new Map([...prev, [imageInfo.filename, img]]));
        };
        
        img.onerror = () => {
          // Silent fail for performance
        };
        
        img.src = imageUrl;
        
        // Small delay to prevent blocking the UI
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    };
    
    // Start preloading after a short delay to let initial render complete
    setTimeout(preloadImages, 1000);
  }, [metadata]);

  // 1.8) Ladda initial bild direkt när metadata finns (inte vänta på interaction)
  useEffect(() => {
    if (!metadata?.images || metadata.images.length === 0) return;
    
    // Hitta närmaste tidsstämpel till nuvarande tid
    const now = new Date().toISOString().slice(0, 13);
    const initialImage = metadata.images.find(img => img.timestamp.startsWith(now)) || metadata.images[0];
    
    if (initialImage) {
      const imageUrl = `/data/temperature-images-mercator/${initialImage.filename}`;
      

      setCurrentImageUrl(imageUrl);
      
      // Ladda bilden direkt även om den inte är preloaded
      const preloadedImg = preloadedImages.get(initialImage.filename);
      if (preloadedImg) {
        setImageLoaded(true);
      } else {
        // Ladda bilden manuellt om den inte är preloaded
        const img = new Image();
        img.onload = () => {
          setImageLoaded(true);
        };
        img.onerror = () => {
          // Silent fail for performance
        };
        img.src = imageUrl;
      }
    }
  }, [metadata, preloadedImages]);

  // 2) Hitta närmaste bild baserat på tid
  const findNearestImage = useCallback((time: Date) => {
    if (!metadata?.images || !Array.isArray(metadata.images) || metadata.images.length === 0) {
      return null;
    }
    
    const timeNum = time.getTime();
    let nearestImage = metadata.images[0];
    if (!nearestImage?.timestamp) return null;
    
    let minDiff = Math.abs(new Date(nearestImage.timestamp).getTime() - timeNum);
    
    for (const image of metadata.images) {
      if (!image?.timestamp) continue;
      const diff = Math.abs(new Date(image.timestamp).getTime() - timeNum);
      if (diff < minDiff) {
        minDiff = diff;
        nearestImage = image;
      }
    }
    
    return nearestImage;
  }, [metadata]);

  // 3) Smart bildväxling - använd preloaded om tillgänglig, annars ladda direkt
  useEffect(() => {
    if (!visible || !metadata) return;
    
    const nearestImage = findNearestImage(throttledTime);
    if (nearestImage) {
      const newImageUrl = `/data/temperature-images-mercator/${nearestImage.filename}`;
      
      if (newImageUrl !== currentImageUrl) {
        setCurrentImageUrl(newImageUrl);
        
        // Kolla om bilden är preloaded
        const preloadedImg = preloadedImages.get(nearestImage.filename);
        
        if (preloadedImg) {
          setImageLoaded(true); // INSTANT - bilden är redan laddad!
        } else {
          // Bilden är inte preloaded, ladda den direkt
          setImageLoaded(false);
          
          const img = new Image();
          let isCurrentRequest = true;
          
          img.onload = () => {
            // Dubbelkolla att detta fortfarande är rätt bild OCH att requesten inte är avbruten
            if (isCurrentRequest && img.src === newImageUrl) {
              setImageLoaded(true);
            }
          };
          img.onerror = () => {
            if (isCurrentRequest) {
              console.error('❌ Fel vid laddning av Temperature Mercator bild:', nearestImage.filename);
              setImageLoaded(false);
            }
          };
          img.src = newImageUrl;
          
          // Cleanup function för att avbryta gamla requests
          return () => {
            isCurrentRequest = false;
            img.onload = null;
            img.onerror = null;
            img.src = ''; // Avbryt laddningen
          };
        }
      }
    }
  }, [visible, metadata, throttledTime, findNearestImage, currentImageUrl, preloadedImages]);

  // 3.5) Debounce MapLibre Source updates för att undvika AJAX abort errors
  useEffect(() => {
    const debounceDelay = isDragging ? 30 : 10; // Much faster debounce for smooth simulation
    
    const timeoutId = setTimeout(() => {
      setDebouncedImageUrl(currentImageUrl);
      setDebouncedImageLoaded(imageLoaded);
    }, debounceDelay);

    return () => clearTimeout(timeoutId);
  }, [currentImageUrl, imageLoaded, isDragging]);

  // 4) Skapa MapLibre GL Source för Mercator-bild
  const rasterSource = useMemo(() => {
    if (!debouncedImageUrl || !debouncedImageLoaded || !metadata) {
      return null;
    }
    
    const nearestImage = findNearestImage(throttledTime);
    if (!nearestImage?.mercator_coordinates) {
      return null;
    }
    
    // VIKTIGT: MapLibre förväntar sig WGS84-koordinater, inte Mercator!
    // Vi behöver använda WGS84 bbox från metadata
    const wgs84_bbox = metadata.wgs84_bbox;
    const [lon_min, lon_max, lat_min, lat_max] = wgs84_bbox;
    
    // Använd WGS84 bbox för MapLibre
    const wgs84Coordinates = [
      [lon_min, lat_max], // top-left
      [lon_max, lat_max], // top-right
      [lon_max, lat_min], // bottom-right
      [lon_min, lat_min]  // bottom-left
    ] as [[number, number], [number, number], [number, number], [number, number]];
    
    return {
      type: 'image' as const,
      url: debouncedImageUrl!,
      coordinates: wgs84Coordinates
    };
  }, [debouncedImageUrl, debouncedImageLoaded, metadata, throttledTime, findNearestImage]);

  // 5) Layer configuration
  const rasterLayer = useMemo(() => {
    if (!visible) return null;
    
    return {
      id: 'temperature-mercator',
      type: 'raster' as const,
      paint: {
        'raster-opacity': opacity,
        'raster-fade-duration': 300,
      }
    };
  }, [visible, opacity]);

  // Visa inget om inte synligt eller ingen data
  if (!visible || !rasterSource || !rasterLayer) {
    return null;
  }

  return (
    <Source id="temperature-mercator-source" {...rasterSource}>
      <Layer {...rasterLayer} />
    </Source>
  );
});

TemperatureLayerMercator.displayName = 'TemperatureLayerMercator';

export default TemperatureLayerMercator; 