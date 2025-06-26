// src/components/CurrentVectorsLayer.tsx
'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useMap, useMapEvent } from 'react-leaflet';
import React from 'react';
import L from 'leaflet';
import 'leaflet-polylinedecorator';
import chroma from 'chroma-js';
import { useTimeSlider } from '../context/TimeSliderContext';

interface CurrentVector { u: number; v: number; time: string }
interface GridPoint      { lat: number; lon: number; vectors: CurrentVector[] }

// Beräkna avstånd (km)
function haversineDistance(lat1:number,lon1:number,lat2:number,lon2:number) {
  const R=6371, toRad=(d:number)=>(d*Math.PI)/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2
          +Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// Heavy throttle function for dragging
function useHeavyThrottle<T>(value: T, delay: number): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastExecuted = useRef<number>(0);

  useEffect(() => {
    const now = Date.now();
    if (now >= lastExecuted.current + delay) {
      lastExecuted.current = now;
      setThrottledValue(value);
    } else {
      const timer = setTimeout(() => {
        lastExecuted.current = Date.now();
        setThrottledValue(value);
      }, delay - (now - lastExecuted.current));

      return () => clearTimeout(timer);
    }
  }, [value, delay]);

  return throttledValue;
}

// Dragging detection hook
function useDraggingDetection(selectedHour: number): boolean {
  const [isDragging, setIsDragging] = useState(false);
  const lastChangeTime = useRef<number>(0);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    // Mark as dragging when value changes
    setIsDragging(true);
    lastChangeTime.current = Date.now();
    
    // Clear existing timer
    if (dragTimer.current) {
      clearTimeout(dragTimer.current);
    }
    
    // Set timer to detect when dragging stops (300ms after last change)
    dragTimer.current = setTimeout(() => {
      setIsDragging(false);
    }, 300) as any;

    return () => {
      if (dragTimer.current) {
        clearTimeout(dragTimer.current);
      }
    };
  }, [selectedHour]);

  return isDragging;
}

const CurrentVectorsLayer = React.memo(() => {
  const map = useMap();
  const { selectedHour, baseTime } = useTimeSlider();
  
  // Detect if user is actively dragging
  const isDragging = useDraggingDetection(selectedHour);
  
  // Use different throttling based on dragging state
  const lightThrottledHour = useHeavyThrottle(selectedHour, 50);   // Fast updates when not dragging
  const heavyThrottledHour = useHeavyThrottle(selectedHour, 200);  // Slow updates when dragging
  const effectiveSelectedHour = isDragging ? heavyThrottledHour : lightThrottledHour;
  
  const [gridData, setGridData] = useState<GridPoint[]>([]);
  const layerRef = useRef<L.LayerGroup|null>(null);
  const layerCacheRef = useRef<Map<string, L.LayerGroup>>(new Map());
  const [zoomLevel, setZoomLevel] = useState(() => map.getZoom());

  // 1) Ladda förberäknad grid
  useEffect(() => {
    fetch('/data/precomputed-grid.json')
      .then(r => r.json())
      .then(setGridData)
      .catch(console.error);
  }, []);

  // 2) Track zoom with throttling
  const handleZoomEnd = useCallback(() => {
    setZoomLevel(map.getZoom());
  }, [map]);

  useMapEvent('zoomend', handleZoomEnd);

  // 3) Se till att vectorPane finns
  useEffect(() => {
    if (!map.getPane('vectorPane')) {
      map.createPane('vectorPane').style.zIndex = '420';
    }
  }, [map]);

  // 4) Memoized color scale
  const colorScale = useMemo(() => {
    return chroma
      .scale(['#0000ff','#00ffff','#00ff00','#ffff00','#ff0000'])
      .domain([0,0.7]);
  }, []);

  // 5) Memoized timestamp prefix - baseTime is now current UTC hour
  const timestampPrefix = useMemo(() => {
    if (!baseTime) return '';
    // baseTime is current UTC hour, so this calculation gives us the correct UTC time for data lookup
    return new Date(baseTime + effectiveSelectedHour * 3600_000)
      .toISOString().slice(0, 13);
  }, [effectiveSelectedHour, baseTime]);

  // 6) Create layer group for specific time and zoom with performance mode
  const createLayerGroup = useCallback((timestamp: string, zoom: number, performanceMode: boolean = false) => {
    const group = L.layerGroup([], { pane: 'vectorPane' });

    // Reduce arrow density during dragging for better performance
    const skipFactor = performanceMode ? 3 : 1; // Show every 3rd arrow when dragging
    let skipCounter = 0;

    for (const pt of gridData) {
      // Skip arrows during performance mode
      if (performanceMode) {
        skipCounter++;
        if (skipCounter % skipFactor !== 0) continue;
      }

      const v = pt.vectors.find(v => v.time.startsWith(timestamp));
      if (!v || v.u == null || v.v == null) continue;

      const mag = Math.hypot(v.u, v.v);
      if (mag < 0.01) continue;
      
      const color = colorScale(mag).hex();

      // Linjens slutpunkt
      const len = 0.05;
      const lat2 = pt.lat + len * v.v;
      const lon2 = pt.lon + len * v.u;

      // Simplified rendering during performance mode - keep arrows but simpler
      if (performanceMode) {
        // Simple line + arrow during dragging (no glow)
        const line = L.polyline(
          [[pt.lat,pt.lon],[lat2,lon2]],
          { pane:'vectorPane', color, weight: 2, opacity: 0.8 }
        );
        group.addLayer(line);
        
        // Simplified arrow head for performance
        const decorator = (L as any).polylineDecorator(line, {
          pane: 'vectorPane',
          patterns: [{
            offset: '100%',
            repeat: 0,
            symbol: (L as any).Symbol.arrowHead({
              pixelSize: 6, // Smaller arrow during dragging
              polygon: true,
              pathOptions: {
                fill: true,
                fillColor: color,
                fillOpacity: 0.8, // Slightly transparent during dragging
                stroke: false
              }
            })
          }]
        });
        group.addLayer(decorator);
      } else {
        // Full quality rendering when not dragging
        // 1) Glow-linje (tjock & låg opacity) - DISABLED FOR PERFORMANCE TEST
        // const glow = L.polyline(
        //   [[pt.lat,pt.lon],[lat2,lon2]],
        //   { pane:'vectorPane', color, weight:6, opacity:0.3 }
        // );
        // group.addLayer(glow);

        // 2) Huvudlinje
        const line = L.polyline(
          [[pt.lat,pt.lon],[lat2,lon2]],
          { pane:'vectorPane', color, weight:2, opacity:1 }
        );
        group.addLayer(line);

        // 3) Pilhuvud med decorator
        const decorator = (L as any).polylineDecorator(line, {
          pane: 'vectorPane',
          patterns: [{
            offset: '100%',
            repeat: 0,
            symbol: (L as any).Symbol.arrowHead({
              pixelSize: 8,
              polygon: true,
              pathOptions: {
                fill: true,
                fillColor: color,
                fillOpacity: 1,
                stroke: false
              }
            })
          }]
        });
        group.addLayer(decorator);
      }
    }

    return group;
  }, [gridData, colorScale]);

  // 7) Main rendering effect with performance-aware caching
  useEffect(() => {
    if (!gridData.length || !baseTime || !timestampPrefix) return;

    const performanceMode = isDragging;
    const cacheKey = `${timestampPrefix}_${zoomLevel}_${performanceMode ? 'perf' : 'full'}`;
    
    // Check if we already have this layer cached
    let group = layerCacheRef.current.get(cacheKey);
    
    if (!group) {
      // Create new layer group if not cached
      group = createLayerGroup(timestampPrefix, zoomLevel, performanceMode);
      
      // Cache the layer group (limit cache size to prevent memory leaks)
      if (layerCacheRef.current.size > 15) { // Increased cache size for perf/full modes
        // Remove oldest entries
        const firstKey = layerCacheRef.current.keys().next().value;
        if (firstKey) {
          const oldGroup = layerCacheRef.current.get(firstKey);
          if (oldGroup) {
            map.removeLayer(oldGroup);
          }
          layerCacheRef.current.delete(firstKey);
        }
      }
      
      layerCacheRef.current.set(cacheKey, group);
    }

    // Remove old layer
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }

    // Add new/cached layer
    group.addTo(map);
    layerRef.current = group;

  }, [map, gridData, timestampPrefix, zoomLevel, createLayerGroup, isDragging, baseTime]);

  // Cleanup on unmount
  useEffect(() => {
    const currentLayerCache = layerCacheRef.current;
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
      }
      currentLayerCache.forEach(group => {
        map.removeLayer(group);
      });
      currentLayerCache.clear();
    };
  }, [map]);

  return null;
});

CurrentVectorsLayer.displayName = 'CurrentVectorsLayer';

export default CurrentVectorsLayer;
