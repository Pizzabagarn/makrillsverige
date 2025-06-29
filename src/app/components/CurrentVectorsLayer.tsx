// src/components/CurrentVectorsLayer.tsx
'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer } from 'react-map-gl/maplibre';
import React from 'react';
import chroma from 'chroma-js';
import { useTimeSlider } from '../context/TimeSliderContext';
import { useAreaParameters } from '../context/AreaParametersContext';
import { useHeavyThrottle, useDraggingDetection } from '../../lib/throttleHooks';
import { DMI_GRID_POINTS } from '../../lib/points';
import type { GeoJSON } from 'geojson';

interface CurrentVector { u: number; v: number; time: string }
interface GridPoint { lat: number; lon: number; vectors: CurrentVector[] }

// Calculate rotation angle from u,v components
function calculateRotation(u: number, v: number): number {
  const angleRad = Math.atan2(v, u);
  const angleDeg = (angleRad * 180) / Math.PI;
  return (90 - angleDeg) % 360;
}

// Check if a point is a manual point (used for calculations but not rendered)
function isManualPoint(lat: number, lon: number): boolean {
  return DMI_GRID_POINTS.some(point => 
    Math.abs(point.lat - lat) < 0.001 && Math.abs(point.lon - lon) < 0.001
  );
}

// Simple haversine distance function
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + 
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// Removed local throttling hooks - using optimized ones from throttleHooks.ts

interface CurrentVectorsLayerProps {
  visible?: boolean;
}

const CurrentVectorsLayer = React.memo<CurrentVectorsLayerProps>(({ 
  visible = true 
}) => {
  const { current: map } = useMap();
  const { selectedHour, baseTime } = useTimeSlider();
  const { data: areaData, isLoading: areaDataLoading } = useAreaParameters();
  
  const [arrowImageLoaded, setArrowImageLoaded] = useState(false);
  const [gridData, setGridData] = useState<GridPoint[]>([]);
  const [arrowsGeoJSON, setArrowsGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(8);
  const imageLoadAttempted = useRef(false);
  
  // Performance optimizations - same as CurrentMagnitudeLayer
  const isDragging = useDraggingDetection(selectedHour);
  const lightThrottledHour = useHeavyThrottle(selectedHour, 100);   // Faster when not dragging
  const heavyThrottledHour = useHeavyThrottle(selectedHour, 500);   // Slower when dragging
  const effectiveSelectedHour = isDragging ? heavyThrottledHour : lightThrottledHour;
  
  // Simple color scale
  const colorScale = useMemo(() => {
    return chroma.scale(['#0000ff','#00ffff','#00ff00','#ffff00','#ff0000']).domain([0,0.7]);
  }, []);

  // Current timestamp
  const timestampPrefix = useMemo(() => {
    if (!baseTime) return '';
    return new Date(baseTime + effectiveSelectedHour * 3600_000).toISOString().slice(0, 13);
  }, [effectiveSelectedHour, baseTime]);

  // Track zoom level for performance optimizations
  useEffect(() => {
    if (!map) return;
    
    const handleZoomEnd = () => {
      setZoomLevel(map.getZoom());
    };
    
    map.on('zoomend', handleZoomEnd);
    setZoomLevel(map.getZoom());
    
    return () => {
      map.off('zoomend', handleZoomEnd);
    };
  }, [map]);

  // Process grid data from context
  useEffect(() => {
    if (areaDataLoading || !areaData) return;
    
    try {
      if (areaData.points) {
        const gridPoints: GridPoint[] = areaData.points.map((point: any) => ({
          lat: point.lat,
          lon: point.lon,
          vectors: point.data ? point.data.map((timeData: any) => ({
            time: timeData.time,
            u: timeData.current?.u || null,
            v: timeData.current?.v || null
          })).filter((v: any) => v.u !== null && v.v !== null) : []
        }));
        
        // console.log(`🌊 CurrentVectors: Processed ${gridPoints.length} grid points from context`);
        setGridData(gridPoints);
      }
    } catch (error) {
      // console.error('❌ Could not process grid data:', error);
    }
  }, [areaData, areaDataLoading]);

  // Load arrow image - IMPROVED VERSION with AbortController
  useEffect(() => {
    if (!map || imageLoadAttempted.current) return;
    
    const abortController = new AbortController();
    
    const loadArrowImage = async () => {
      imageLoadAttempted.current = true;
      
      try {
        // Method 1: Try loading directly from public path
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
          try {
            if (map.hasImage('arrow')) {
              map.removeImage('arrow');
            }
            map.addImage('arrow', img);
            setArrowImageLoaded(true);
          } catch (error) {
            // console.error('❌ Failed to add image to map:', error);
          }
        };
        
        img.onerror = (error) => {
          // console.error('❌ Failed to load arrow image:', error);
          // Try alternative method
          loadImageAlternative(abortController.signal);
        };
        
        img.src = '/images/arrow.png';
        
      } catch (error) {
        // console.error('❌ Image loading error:', error);
        loadImageAlternative(abortController.signal);
      }
    };
    
    const loadImageAlternative = async (signal?: AbortSignal) => {
      try {
        const response = await fetch('/images/arrow.png', { signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        
        const img = new Image();
        img.onload = () => {
          try {
            if (map.hasImage('arrow')) {
              map.removeImage('arrow');
            }
            map.addImage('arrow', img);
            setArrowImageLoaded(true);
          } catch (error) {
            // console.error('❌ Failed to add blob image to map:', error);
          }
          URL.revokeObjectURL(imageUrl);
        };
        
        img.onerror = (error) => {
          // console.error('❌ Failed to load arrow image via blob:', error);
          URL.revokeObjectURL(imageUrl);
        };
        
        img.src = imageUrl;
        
              } catch (error: any) {
          if (error.name !== 'AbortError') {
            // console.error('❌ Alternative image loading failed:', error);
          }
        }
    };
    
    loadArrowImage();
    
    return () => {
      abortController.abort();
    };
  }, [map]);

  // Generate arrows with performance optimizations
  const generateArrows = useCallback((performanceMode: boolean = false) => {
    if (!gridData.length || !timestampPrefix) return null;
    
    const arrowsFeatures: GeoJSON.Feature[] = [];
    
    // Detect mobile devices
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    
    // Collect all valid points with their vectors, excluding manual points
    const validPoints: Array<{
      pt: GridPoint;
      vector: CurrentVector;
      magnitude: number;
      lat: number;
      lon: number;
    }> = [];
    
    for (const pt of gridData) {
      // Skip manual points - they're used for calculations but not rendered as arrows
      if (isManualPoint(pt.lat, pt.lon)) {
        continue;
      }
      
      const v = pt.vectors.find(v => v.time.startsWith(timestampPrefix));
      if (!v || v.u == null || v.v == null) continue;

      const mag = Math.hypot(v.u, v.v);
      if (mag < 0.01) continue;
      
      validPoints.push({
        pt,
        vector: v,
        magnitude: mag,
        lat: pt.lat,
        lon: pt.lon
      });
    }
    
    // Performance mode: Keep only 15% of arrows (remove 85%) based on geographic position
    const pointsToRender = performanceMode 
      ? validPoints.filter((point) => {
          // Create deterministic hash from lat/lon coordinates 
          // This ensures same geographic points are always kept/removed
          const hash = Math.floor(point.lat * 1000) + Math.floor(point.lon * 1000);
          return hash % 20 === 0; // Keep every 20th point (15% remaining, 85% removed)
        })
      : validPoints; // Keep all arrows when not in performance mode
    
    // Generate arrow features
    for (const point of pointsToRender) {
      const color = colorScale(point.magnitude).toString();
      const rotation = calculateRotation(point.vector.u, point.vector.v);
      
      // Adjust arrow size based on device
      let baseSize = 0.03;
      if (isMobile) {
        if (zoomLevel < 6) {
          baseSize = 0.010;
        } else if (zoomLevel < 7) {
          baseSize = 0.013;
        } else {
          baseSize = 0.016;
        }
      } else {
        baseSize = 0.025;
      }
      
      const arrowFeature: GeoJSON.Feature = {
        type: 'Feature',
        properties: {
          color: color,
          magnitude: point.magnitude,
          opacity: performanceMode ? 0.8 : 1, // Slightly transparent during performance mode
          rotation: rotation,
          size: baseSize
        },
        geometry: {
          type: 'Point',
          coordinates: [point.lon, point.lat]
        }
      };
      arrowsFeatures.push(arrowFeature);
    }

    return {
      type: 'FeatureCollection' as const,
      features: arrowsFeatures
    };
  }, [gridData, timestampPrefix, colorScale, zoomLevel]);

  // Smart arrow generation with reduced flickering
  useEffect(() => {
    if (!visible || !timestampPrefix || gridData.length === 0) {
      setArrowsGeoJSON(null);
      return;
    }

    const performanceMode = isDragging && zoomLevel < 8;
    
    // Generate new arrows without setting to null first (reduces flicker)
    const newGeoJSON = generateArrows(performanceMode);
    
    // Only update if valid and actually different (reduce unnecessary re-renders)
    if (newGeoJSON) {
      setArrowsGeoJSON(prevGeoJSON => {
        if (!prevGeoJSON || prevGeoJSON.features.length !== newGeoJSON.features.length) {
          return newGeoJSON;
        }
        return newGeoJSON;
      });
    }

  }, [visible, generateArrows, isDragging, timestampPrefix, zoomLevel, gridData.length]);

  // FORCE ARROWS TO TOP - guarantees arrows are always above everything
  useEffect(() => {
    if (!map || !arrowsGeoJSON || !arrowImageLoaded || !visible) return;
    
    const forceArrowsToTop = () => {
      try {
        // Get all layers in the map
        const layers = map.getStyle().layers || [];
        
        // Check if our arrow layer exists
        const arrowLayerExists = layers.some(layer => layer.id === 'current-arrows-layer');
        
        if (arrowLayerExists) {
          // Move arrows layer to the very top (no beforeId = top)
          map.moveLayer('current-arrows-layer');
          // console.log('🏹 Arrows forced to TOP of all layers');
        }
      } catch (error) {
        // Ignore errors if layer doesn't exist yet
      }
    };
    
    // Force to top immediately
    setTimeout(forceArrowsToTop, 100);
    
    // Also force to top whenever any new layer is added
    const handleDataChange = () => {
      setTimeout(forceArrowsToTop, 50);
    };
    
    map.on('data', handleDataChange);
    map.on('styledata', handleDataChange);
    
    return () => {
      map.off('data', handleDataChange);
      map.off('styledata', handleDataChange);
    };
  }, [map, arrowsGeoJSON, arrowImageLoaded, visible]);

  // Don't render anything if not visible
  if (!visible) {
    return null;
  }

  // Don't render if no data or image not loaded
  if (!arrowsGeoJSON || !arrowImageLoaded) {
    return null;
  }

  return (
    <Source 
      id="current-arrows" 
      type="geojson" 
      data={arrowsGeoJSON}
    >
      <Layer
        id="current-arrows-layer"
        type="symbol"
        layout={{
          'icon-image': 'arrow',
          'icon-size': ['get', 'size'],
          'icon-rotate': ['get', 'rotation'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        }}
        paint={{
          'icon-color': ['get', 'color'],
          'icon-opacity': ['get', 'opacity']
        }}
      />
    </Source>
  );
});

CurrentVectorsLayer.displayName = 'CurrentVectorsLayer';

export default CurrentVectorsLayer;
