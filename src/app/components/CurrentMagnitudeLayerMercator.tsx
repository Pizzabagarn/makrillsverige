'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer } from 'react-map-gl/maplibre';
import React from 'react';
import { useTimeSlider } from '../context/TimeSliderContext';
import { useHeavyThrottle, useDraggingDetection } from '../../lib/throttleHooks';

interface CurrentMagnitudeMetadata {
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

interface CurrentMagnitudeLayerMercatorProps {
  visible?: boolean;
  opacity?: number;
}

const CurrentMagnitudeLayerMercator = React.memo<CurrentMagnitudeLayerMercatorProps>(({ 
  visible = true, 
  opacity = 0.8 
}) => {
  const mapRef = useMap();
  const [metadata, setMetadata] = useState<CurrentMagnitudeMetadata | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [preloadedImages, setPreloadedImages] = useState<Map<string, HTMLImageElement>>(new Map());
  
  const { selectedHour, baseTime } = useTimeSlider();
  const isDragging = useDraggingDetection(selectedHour);
  
  // Convert selectedHour to Date for throttling
  const currentTime = useMemo(() => {
    return new Date(baseTime + selectedHour * 3600 * 1000);
  }, [baseTime, selectedHour]);
  
  // Throttle image updates during dragging
  const throttledTime = useHeavyThrottle(currentTime, isDragging ? 500 : 100);

  // 1) Ladda metadata vid komponentstart - EAGER LOADING
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const response = await fetch('/data/current-images-mercator/metadata.json');
        if (response.ok) {
          const data = await response.json();
          setMetadata(data);
          console.log('✅ Current Mercator metadata laddad (eager):', data);
        } else if (response.status === 404) {
          console.warn('⚠️ Current Mercator metadata inte funnen - bilder behöver genereras först');
        } else {
          console.error('❌ Kunde inte ladda Current Mercator metadata');
        }
      } catch (error) {
        console.warn('⚠️ Current Mercator metadata inte tillgänglig:', error instanceof Error ? error.message : String(error));
      }
    };

    // Ladda metadata direkt vid komponentstart - ingen visible check
    loadMetadata();
  }, []);

  // 1.5) Preload bilder i bakgrunden EFTER metadata laddats
  useEffect(() => {
    if (!metadata?.images || metadata.images.length === 0) return;
    
    const preloadImages = async () => {
      console.log(`🚀 Bakgrundspreloading av ${metadata.images.length} Mercator-bilder...`);
      const imageMap = new Map<string, HTMLImageElement>();
      let loadedCount = 0;
      
      // Preload bilder gradvis för att inte blockera UI
      for (const imageInfo of metadata.images) {
        const img = new Image();
        const imageUrl = `/data/current-images-mercator/${imageInfo.filename}`;
        
        img.onload = () => {
          imageMap.set(imageInfo.filename, img);
          loadedCount++;
          if (loadedCount % 5 === 0) {
            console.log(`✅ Preloaded ${loadedCount}/${metadata.images.length} Mercator-bilder`);
          }
          // Update preloaded images incrementally
          setPreloadedImages(prev => new Map([...prev, [imageInfo.filename, img]]));
        };
        
        img.onerror = () => {
          console.log(`⚠️ Kunde inte preload Mercator-bild: ${imageInfo.filename}`);
        };
        
        img.src = imageUrl;
        
        // Small delay to prevent blocking the UI
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      
      console.log(`🎉 Alla ${loadedCount} Mercator-bilder preloadade!`);
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
      const imageUrl = `/data/current-images-mercator/${initialImage.filename}`;
      
      console.log('🎯 Laddar initial Current Mercator bild:', initialImage.filename);
      setCurrentImageUrl(imageUrl);
      
      // Ladda bilden direkt även om den inte är preloaded
      const preloadedImg = preloadedImages.get(initialImage.filename);
      if (preloadedImg) {
        setImageLoaded(true);
        console.log('⚡ Initial Current Mercator bild från cache:', initialImage.filename);
      } else {
        // Ladda bilden manuellt om den inte är preloaded
        const img = new Image();
        img.onload = () => {
          setImageLoaded(true);
          console.log('✅ Initial Current Mercator bild laddad:', initialImage.filename);
        };
        img.onerror = () => {
          console.log('❌ Kunde inte ladda initial Current Mercator bild:', initialImage.filename);
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
      const newImageUrl = `/data/current-images-mercator/${nearestImage.filename}`;
      
      if (newImageUrl !== currentImageUrl) {
        setCurrentImageUrl(newImageUrl);
        
        // Kolla om bilden är preloaded
        const preloadedImg = preloadedImages.get(nearestImage.filename);
        
        if (preloadedImg) {
          setImageLoaded(true); // INSTANT - bilden är redan laddad!
          console.log('⚡ Instant Mercator bild från cache:', nearestImage.filename);
        } else {
          // Bilden är inte preloaded, ladda den direkt
          setImageLoaded(false);
          console.log('⏳ Laddar Mercator bild (inte cached):', nearestImage.filename);
          
          const img = new Image();
          img.onload = () => {
            // Dubbelkolla att detta fortfarande är rätt bild
            if (img.src === newImageUrl) {
              setImageLoaded(true);
              console.log('✅ Mercator bild laddad:', nearestImage.filename);
            }
          };
          img.onerror = () => {
            console.error('❌ Fel vid laddning av Mercator bild:', nearestImage.filename);
            setImageLoaded(false);
          };
          img.src = newImageUrl;
        }
      }
    }
  }, [visible, metadata, throttledTime, findNearestImage, currentImageUrl, preloadedImages]);

  // 4) Skapa MapLibre GL Source för Mercator-bild
  const rasterSource = useMemo(() => {
    if (!currentImageUrl || !imageLoaded || !metadata) {
      return null;
    }
    
    const nearestImage = findNearestImage(throttledTime);
    if (!nearestImage?.mercator_coordinates) {
      return null;
    }
    
    // VIKTIGT: MapLibre förväntar sig WGS84-koordinater, inte Mercator!
    // Vi behöver konvertera tillbaka från Mercator till WGS84
    const [topLeft, topRight, bottomRight, bottomLeft] = nearestImage.mercator_coordinates;
    
    // Konvertera från Mercator tillbaka till WGS84 för MapLibre
    const wgs84_bbox = metadata.wgs84_bbox;
    const [lon_min, lon_max, lat_min, lat_max] = wgs84_bbox;
    
    // Använd WGS84 bbox istället för Mercator-koordinater
    const wgs84Coordinates = [
      [lon_min, lat_max], // top-left
      [lon_max, lat_max], // top-right
      [lon_max, lat_min], // bottom-right
      [lon_min, lat_min]  // bottom-left
    ] as [[number, number], [number, number], [number, number], [number, number]];
    
    console.log('🗺️ Använder WGS84-koordinater för MapLibre:', {
      wgs84Coordinates,
      originalMercator: { topLeft, topRight, bottomRight, bottomLeft }
    });
    
    return {
      type: 'image' as const,
      url: currentImageUrl,
      coordinates: wgs84Coordinates
    };
  }, [currentImageUrl, imageLoaded, metadata, throttledTime, findNearestImage]);

  // 5) Layer configuration
  const rasterLayer = useMemo(() => {
    if (!visible) return null;
    
    return {
      id: 'current-magnitude-mercator',
      type: 'raster' as const,
      paint: {
        'raster-opacity': opacity,
        'raster-fade-duration': 300,
      }
    };
  }, [visible, opacity]);

  // Debug-information
  useEffect(() => {
    if (metadata && currentImageUrl) {
      const nearestImage = findNearestImage(throttledTime);
      if (nearestImage) {
        console.log('🔍 Mercator debug:', {
          timestamp: nearestImage.timestamp,
          filename: nearestImage.filename,
          projection: metadata.projection,
          wgs84_bbox: metadata.wgs84_bbox,
          mercator_bbox: metadata.mercator_bbox,
          coordinates: nearestImage.mercator_coordinates
        });
      }
    }
  }, [metadata, currentImageUrl, throttledTime, findNearestImage]);

  // Visa inget om inte synligt eller ingen data
  if (!visible || !rasterSource || !rasterLayer) {
    return null;
  }

  return (
    <Source id="current-magnitude-mercator-source" {...rasterSource}>
      <Layer {...rasterLayer} />
    </Source>
  );
});

CurrentMagnitudeLayerMercator.displayName = 'CurrentMagnitudeLayerMercator';

export default CurrentMagnitudeLayerMercator; 