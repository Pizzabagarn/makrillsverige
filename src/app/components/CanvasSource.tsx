'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer } from 'react-map-gl/maplibre';
import React from 'react';
import { useTimeSlider } from '../context/TimeSliderContext';
import { useHeavyThrottle, useDraggingDetection } from '../../lib/throttleHooks';

interface ImageMetadata {
  timestamp: string;
  filename: string;
  data_points?: number;
  value_range?: [number, number] | null;
  mercator_coordinates?: [[number, number], [number, number], [number, number], [number, number]];
}

interface CanvasSourceMetadata {
  parameter: string;
  generated_at: string;
  resolution: string;
  wgs84_bbox: [number, number, number, number];
  mercator_bbox?: [number, number, number, number];
  projection: string;
  total_images: number;
  images?: ImageMetadata[];
  timestamps?: string[]; // Legacy format support
}

interface CanvasSourceProps {
  id: string;
  layerId: string;
  visible?: boolean;
  opacity?: number;
  metadataUrl: string;
  imageUrlPattern: string; // Pattern with {filename} placeholder
  canvasSize?: { width: number; height: number };
}

const CanvasSource = React.memo<CanvasSourceProps>(({ 
  id,
  layerId,
  visible = true, 
  opacity = 0.8,
  metadataUrl,
  imageUrlPattern,
  canvasSize = { width: 1200, height: 800 }
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  
  const [metadata, setMetadata] = useState<CanvasSourceMetadata | null>(null);
  const [preloadedImages, setPreloadedImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [currentImageKey, setCurrentImageKey] = useState<string | null>(null);
  const [canvasSource, setCanvasSource] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const { selectedHour, displayHour, baseTime } = useTimeSlider();
  const isDragging = useDraggingDetection(selectedHour);
  
  // USE SAME THROTTLING LOGIC AS OTHER WORKING LAYERS
  const lightThrottledHour = useHeavyThrottle(displayHour, 10);   // Very fast when not dragging
  const heavyThrottledHour = useHeavyThrottle(displayHour, 50);   // Still fast when dragging
  const effectiveDisplayHour = isDragging ? heavyThrottledHour : lightThrottledHour;
  
  // Convert to Date for image finding
  const currentTime = useMemo(() => {
    return new Date(baseTime + effectiveDisplayHour * 3600 * 1000);
  }, [baseTime, effectiveDisplayHour]);

  // 1) Load metadata on component start
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const response = await fetch(metadataUrl);
        if (response.ok) {
          const data = await response.json();
          setMetadata(data);
        }
      } catch (error) {
        // Silent fail
      }
    };

    loadMetadata();
  }, [metadataUrl, id]);

  // 2) Initialize canvas when metadata is loaded
  useEffect(() => {
    if (!metadata || isInitialized) return;
    
    // Create canvas element
    const canvas = document.createElement('canvas');
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.error('Failed to get 2D context for canvas');
      return;
    }
    
    canvasRef.current = canvas;
    contextRef.current = ctx;
    
    // Setup WGS84 coordinates
    const wgs84_bbox = metadata.wgs84_bbox;
    const [lon_min, lon_max, lat_min, lat_max] = wgs84_bbox;
    
    const wgs84Coordinates = [
      [lon_min, lat_max], // top-left
      [lon_max, lat_max], // top-right
      [lon_max, lat_min], // bottom-right
      [lon_min, lat_min]  // bottom-left
    ] as [[number, number], [number, number], [number, number], [number, number]];
    
    // Create canvas source configuration
    const sourceConfig = {
      type: 'canvas' as const,
      canvas: canvas,
      coordinates: wgs84Coordinates,
      animate: true // Enable animation so MapLibre continuously redraws the canvas
    };
    
    setCanvasSource(sourceConfig);
    setIsInitialized(true);
    
    // Cleanup function
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [metadata, canvasSize, id, isInitialized]);

  // 3) Preload images after metadata is loaded
  useEffect(() => {
    if (!metadata || preloadedImages.size > 0) return;
    
    const preloadImages = async () => {

      
      let imageList: ImageMetadata[] = [];
      
      // Handle both new format (images array) and legacy format (timestamps)
      if (metadata.images && metadata.images.length > 0) {
        // New format - use images array directly
        imageList = metadata.images;

      } else if (metadata.timestamps && metadata.timestamps.length > 0) {
        // Legacy format - build filenames from timestamps
        imageList = metadata.timestamps.map(timestamp => ({
          timestamp,
          filename: `${id.replace('-', '_')}_${timestamp.replaceAll(':', '-').replaceAll('+', 'plus')}.png`
        }));

      }
      
      const imageMap = new Map<string, HTMLImageElement>();
      let loadedCount = 0;
      
      for (const imageInfo of imageList) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        const imageUrl = imageUrlPattern.includes('{filename}') 
          ? imageUrlPattern.replace('{filename}', imageInfo.filename)
          : `${imageUrlPattern}/${imageInfo.filename}`;
        
        img.onload = () => {
          const key = imageInfo.filename || imageInfo.timestamp;
          imageMap.set(key, img);
          loadedCount++;
          

          
          // Update preloaded images incrementally
          setPreloadedImages(prev => new Map([...prev, [key, img]]));
          

        };
        
        img.onerror = () => {
          // Silent fail
        };
        
        img.src = imageUrl;
        
        // Small delay to prevent blocking the UI
        await new Promise(resolve => setTimeout(resolve, 15));
      }
      

    };
    
    // Start preloading after a short delay
    setTimeout(preloadImages, 500);
  }, [metadata, preloadedImages.size, id, imageUrlPattern]);

  // 4) Find nearest image based on time
  const findNearestImage = useCallback((time: Date) => {
    if (!metadata) return null;
    
    let imageList: ImageMetadata[] = [];
    
    if (metadata.images && metadata.images.length > 0) {
      // New format - use images array directly
      imageList = metadata.images;
    } else if (metadata.timestamps && metadata.timestamps.length > 0) {
      // Legacy format - build filenames from timestamps
      imageList = metadata.timestamps.map(timestamp => ({
        timestamp,
        filename: `${id.replace('-', '_')}_${timestamp.replaceAll(':', '-').replaceAll('+', 'plus')}.png`
      }));
    }
    
    if (imageList.length === 0) {

      return null;
    }
    
    const timeNum = time.getTime();
    let nearestImage = imageList[0];
    let minDiff = Math.abs(new Date(nearestImage.timestamp).getTime() - timeNum);
    
    for (const image of imageList) {
      if (!image?.timestamp) continue;
      const diff = Math.abs(new Date(image.timestamp).getTime() - timeNum);
      if (diff < minDiff) {
        minDiff = diff;
        nearestImage = image;
      }
    }
    
    
    return nearestImage;
  }, [metadata, id]);

  // 5) Render current image to canvas
  const renderImageToCanvas = useCallback((imageKey: string) => {
    if (!canvasRef.current || !contextRef.current) return;
    
    const image = preloadedImages.get(imageKey);
    if (!image) {
      return;
    }
    
    const ctx = contextRef.current;
    const canvas = canvasRef.current;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Check if image is loaded with data
    if (image.width === 0 || image.height === 0) {
      return;
    }
    
    // Draw image to fill entire canvas (original behavior for all layers)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    
    // Force a repaint with requestAnimationFrame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(() => {
      // Canvas is automatically redrawn by MapLibre with animate: true
    });
  }, [preloadedImages, id]);

  // 6) Update canvas when time changes
  useEffect(() => {
    if (!visible || !metadata || !canvasSource || preloadedImages.size === 0) return;
    
    const nearestImage = findNearestImage(currentTime);
    if (!nearestImage) {
      return;
    }
    
    const imageKey = nearestImage.filename || nearestImage.timestamp;
    
    if (imageKey !== currentImageKey) {
      setCurrentImageKey(imageKey);
      renderImageToCanvas(imageKey);
    }
  }, [visible, metadata, canvasSource, preloadedImages.size, currentTime, findNearestImage, currentImageKey, renderImageToCanvas]);

  // 7) Create layer configuration
  const rasterLayer = useMemo(() => {
    if (!visible || !canvasSource) return null;
    
    return {
      id: layerId,
      type: 'raster' as const,
      paint: {
        'raster-opacity': opacity,
        'raster-fade-duration': 0, // No fade needed since we control the canvas
      }
    };
  }, [visible, canvasSource, layerId, opacity]);

  // Don't render anything if not ready
  if (!visible || !canvasSource || !rasterLayer) {
    return null;
  }

  // Render using react-map-gl's Source component
  return (
    <Source id={id} {...canvasSource}>
      <Layer {...rasterLayer} />
    </Source>
  );
});

CanvasSource.displayName = 'CanvasSource';

export default CanvasSource; 