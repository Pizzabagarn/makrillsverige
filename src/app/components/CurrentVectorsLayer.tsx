// src/components/CurrentVectorsLayer.tsx
'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer } from 'react-map-gl/maplibre';
import React from 'react';
import chroma from 'chroma-js';
import { useTimeSlider } from '../context/TimeSliderContext';
import type { GeoJSON } from 'geojson';

interface CurrentVector { u: number; v: number; time: string }
interface GridPoint { lat: number; lon: number; vectors: CurrentVector[] }

// Calculate rotation angle from u,v components
function calculateRotation(u: number, v: number): number {
  const angleRad = Math.atan2(v, u);
  const angleDeg = (angleRad * 180) / Math.PI;
  return (90 - angleDeg) % 360;
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

// Throttle hook for performance
function useThrottle<T>(value: T, delay: number): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());

  useEffect(() => {
    const now = Date.now();
    if (now - lastUpdate < delay) {
      const timer = setTimeout(() => {
        setThrottledValue(value);
        setLastUpdate(Date.now());
      }, delay - (now - lastUpdate));
      return () => clearTimeout(timer);
    } else {
      setThrottledValue(value);
      setLastUpdate(now);
    }
  }, [value, delay, lastUpdate]);

  return throttledValue;
}

// Detect when user is actively dragging time slider
function useDraggingDetection(selectedHour: number): boolean {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setIsDragging(true);
    
    const timer = setTimeout(() => {
      setIsDragging(false);
    }, 300); // Consider dragging stopped after 300ms of no changes

    return () => clearTimeout(timer);
  }, [selectedHour]);

  return isDragging;
}

interface CurrentVectorsLayerProps {
  visible?: boolean;
}

const CurrentVectorsLayer = React.memo<CurrentVectorsLayerProps>(({ 
  visible = true 
}) => {
  const { current: map } = useMap();
  const { selectedHour, baseTime } = useTimeSlider();
  
  const [arrowImageLoaded, setArrowImageLoaded] = useState(false);
  const [gridData, setGridData] = useState<GridPoint[]>([]);
  const [arrowsGeoJSON, setArrowsGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(8);
  const imageLoadAttempted = useRef(false);
  
  // Performance optimizations
  const isDragging = useDraggingDetection(selectedHour);
  const throttledSelectedHour = useThrottle(selectedHour, isDragging ? 200 : 100);
  const effectiveSelectedHour = isDragging ? throttledSelectedHour : selectedHour;
  
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

  // Load grid data
  useEffect(() => {
    const loadGridData = async () => {
      try {
        const response = await fetch('/api/area-parameters');
        if (!response.ok) {
          console.error('❌ Failed to fetch grid data:', response.status);
          return;
        }
        
        const data = await response.json();
        if (data.points) {
          const gridPoints: GridPoint[] = data.points.map((point: any) => ({
            lat: point.lat,
            lon: point.lon,
            vectors: point.data ? point.data.map((timeData: any) => ({
              time: timeData.time,
              u: timeData.current?.u || null,
              v: timeData.current?.v || null
            })).filter((v: any) => v.u !== null && v.v !== null) : []
          }));
          
          setGridData(gridPoints);
        }
      } catch (error) {
        console.error('❌ Could not load grid data:', error);
      }
    };
    
    loadGridData();
  }, []);

  // Load arrow image - IMPROVED VERSION
  useEffect(() => {
    if (!map || imageLoadAttempted.current) return;
    
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
            console.error('❌ Failed to add image to map:', error);
          }
        };
        
        img.onerror = (error) => {
          console.error('❌ Failed to load arrow image:', error);
          // Try alternative method
          loadImageAlternative();
        };
        
        img.src = '/images/arrow.png';
        
      } catch (error) {
        console.error('❌ Image loading error:', error);
        loadImageAlternative();
      }
    };
    
    const loadImageAlternative = async () => {
      try {
        const response = await fetch('/images/arrow.png');
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
            console.error('❌ Failed to add blob image to map:', error);
          }
          URL.revokeObjectURL(imageUrl);
        };
        
        img.onerror = (error) => {
          console.error('❌ Failed to load arrow image via blob:', error);
          URL.revokeObjectURL(imageUrl);
        };
        
        img.src = imageUrl;
        
      } catch (error) {
        console.error('❌ Alternative image loading failed:', error);
      }
    };
    
    loadArrowImage();
  }, [map]);

  // Generate arrows with performance optimizations
  const generateArrows = useCallback((performanceMode: boolean = false) => {
    if (!gridData.length || !timestampPrefix) return null;
    
    const arrowsFeatures: GeoJSON.Feature[] = [];
    
    // Detect mobile devices
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    
    // Debug logging
    console.log('🔍 Debug:', { isMobile, zoomLevel, windowWidth: typeof window !== 'undefined' ? window.innerWidth : 'SSR' });
    
    // Performance optimization: skip points during dragging for smoother experience
    const skipRatio = performanceMode ? (isMobile ? 2 : 3) : 1;
    let pointIndex = 0;
    
    // First pass: collect all valid points with their vectors
    const validPoints: Array<{
      pt: GridPoint;
      vector: CurrentVector;
      magnitude: number;
      lat: number;
      lon: number;
    }> = [];
    
    for (const pt of gridData) {
      pointIndex++;
      
      // Skip points in performance mode
      if (performanceMode && pointIndex % skipRatio !== 0) continue;
      
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
    
    console.log('📊 Valid points found:', validPoints.length);
    
    // Smart density-aware filtering - activate at higher zoom levels on desktop
    const shouldApplyDensityFiltering = zoomLevel < (isMobile ? 7 : 9); // Desktop activates earlier
    console.log('🎯 Apply density filtering:', shouldApplyDensityFiltering, { isMobile, zoomLevel, windowWidth: typeof window !== 'undefined' ? window.innerWidth : 'SSR' });
    
    if (shouldApplyDensityFiltering) {
      // EXTREME filtering - only keep strongest currents with minimum distance
      const used: Array<{ lat: number; lon: number }> = [];
      let filteredCount = 0;
      
      // Calculate minDistance once outside the loop
      const minDistance = isMobile 
        ? (zoomLevel < 6 ? 15.0 : 10.0)  // Mobile: same as before
        : (zoomLevel < 6 ? 15.0 : zoomLevel < 7 ? 10.0 : zoomLevel < 8 ? 7.0 : 5.0); // Desktop: graduated
      
      // Sort points by magnitude (keep strongest currents)
      const sortedPoints = [...validPoints].sort((a, b) => b.magnitude - a.magnitude);
      
      for (let i = 0; i < sortedPoints.length; i++) {
        const point = sortedPoints[i];
        let shouldInclude = true;
        
        // Check if too close to any already included point
        for (const usedPoint of used) {
          const distance = haversineDistance(usedPoint.lat, usedPoint.lon, point.lat, point.lon);
          if (distance < minDistance) {
            shouldInclude = false;
            filteredCount++;
            break;
          }
        }
        
        if (shouldInclude) {
          used.push({ lat: point.lat, lon: point.lon });
          
          const color = colorScale(point.magnitude).toString();
          const rotation = calculateRotation(point.vector.u, point.vector.v);
          
          // Adjust arrow size based on zoom level and device
          let baseSize = 0.03;
          if (isMobile) {
            if (zoomLevel < 6) {
              baseSize = 0.025;
            } else if (zoomLevel < 7) {
              baseSize = 0.03;
            } else {
              baseSize = 0.035;
            }
          } else {
            if (zoomLevel < 6) {
              baseSize = 0.02;
            } else if (zoomLevel < 7) {
              baseSize = 0.025;
            }
          }
          
          const arrowFeature: GeoJSON.Feature = {
            type: 'Feature',
            properties: {
              color: color,
              magnitude: point.magnitude,
              opacity: performanceMode ? (isMobile ? 0.8 : 0.7) : 1,
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
      }
      
      console.log('🔥 EXTREME Filtering results:', { 
        total: validPoints.length, 
        filtered: filteredCount, 
        remaining: arrowsFeatures.length,
        percentage: Math.round((filteredCount / validPoints.length) * 100) + '%',
        minDistance: minDistance,
        device: isMobile ? 'mobile' : 'desktop',
        zoomLevel: zoomLevel.toFixed(1)
      });
      
    } else {
      // No filtering - include all points
      for (const point of validPoints) {
        const color = colorScale(point.magnitude).toString();
        const rotation = calculateRotation(point.vector.u, point.vector.v);
        
        // Adjust arrow size based on zoom level and device
        let baseSize = 0.03;
        if (isMobile) {
          if (zoomLevel < 6) {
            baseSize = 0.025;
          } else if (zoomLevel < 7) {
            baseSize = 0.03;
          } else {
            baseSize = 0.035;
          }
        } else {
          if (zoomLevel < 6) {
            baseSize = 0.02;
          } else if (zoomLevel < 7) {
            baseSize = 0.025;
          }
        }
        
        const arrowFeature: GeoJSON.Feature = {
          type: 'Feature',
          properties: {
            color: color,
            magnitude: point.magnitude,
            opacity: performanceMode ? (isMobile ? 0.8 : 0.7) : 1,
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
    }

    return {
      type: 'FeatureCollection' as const,
      features: arrowsFeatures
    };
  }, [gridData, timestampPrefix, colorScale, zoomLevel]);

  // Generate arrows with performance mode
  useEffect(() => {
    if (!visible) {
      setArrowsGeoJSON(null);
      return;
    }
    
    const performanceMode = isDragging;
    const geoJSON = generateArrows(performanceMode);
    setArrowsGeoJSON(geoJSON);

  }, [visible, generateArrows, isDragging]);

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
