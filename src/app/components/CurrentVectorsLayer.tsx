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

// Calculate rotation angle from u,v components
function calculateRotation(u: number, v: number): number {
  // Calculate angle in radians from u,v components
  const angleRad = Math.atan2(v, u);
  // Convert to degrees and adjust for MapLibre GL's coordinate system
  // MapLibre GL uses 0° = north, clockwise positive
  // atan2 gives us standard math coordinates (0° = east, counter-clockwise positive)
  const angleDeg = (angleRad * 180) / Math.PI;
  // Convert from math coordinates to MapLibre GL coordinates
  return (90 - angleDeg) % 360;
}

const CurrentVectorsLayer = React.memo(() => {
  const { current: map } = useMap();
  const { selectedHour, baseTime } = useTimeSlider();
  
  // Track if arrow image is loaded
  const [arrowImageLoaded, setArrowImageLoaded] = useState(false);
  
  // Detect if user is actively dragging
  const isDragging = useDraggingDetection(selectedHour);
  
  // Use different throttling based on dragging state
  const lightThrottledHour = useHeavyThrottle(selectedHour, 50);   // Fast updates when not dragging
  const heavyThrottledHour = useHeavyThrottle(selectedHour, 200);  // Slow updates when dragging
  const effectiveSelectedHour = isDragging ? heavyThrottledHour : lightThrottledHour;
  
  const [gridData, setGridData] = useState<GridPoint[]>([]);
  const [zoomLevel, setZoomLevel] = useState(8.5);
  const [arrowsGeoJSON, setArrowsGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);

  // 1) Ladda förberäknad grid
  useEffect(() => {
    fetch('/data/precomputed-grid.json')
      .then(r => r.json())
      .then(setGridData)
      .catch(console.error);
  }, []);

  // 2) Load arrow image into MapLibre GL
  useEffect(() => {
    if (!map) return;
    
    const loadArrowImage = async () => {
      try {
        const response = await fetch('/images/arrow.png');
        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        
        const img = new Image();
        img.onload = () => {
          if (!map.hasImage('arrow')) {
            map.addImage('arrow', img);
            setArrowImageLoaded(true);
          }
          URL.revokeObjectURL(imageUrl);
        };
        img.src = imageUrl;
      } catch (error) {
        console.error('Failed to load arrow image:', error);
      }
    };
    
    loadArrowImage();
  }, [map]);

  // 3) Track zoom changes
  useEffect(() => {
    if (!map) return;
    
    const handleZoomEnd = () => {
      setZoomLevel(map.getZoom());
    };
    
    map.on('zoomend', handleZoomEnd);
    return () => {
      map.off('zoomend', handleZoomEnd);
    };
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

  // 6) Create GeoJSON data for arrows only
  const createGeoJSONData = useCallback((timestamp: string, performanceMode: boolean = false) => {
    const arrowsFeatures: GeoJSON.Feature[] = [];

    // Distance-based filtering (samma som gamla Leaflet-koden)
    const minD = zoomLevel < 4 ? 50 :
                 zoomLevel < 5 ? 35 :
                 zoomLevel < 6 ? 25 :
                 zoomLevel < 7 ? 15 :
                 zoomLevel < 8 ? 4 : 0; // Mjukare första steget - bara 4 km avstånd

    const used: { lat: number; lon: number }[] = [];

    for (const pt of gridData) {
      // Täthetskontroll - skippa om för nära en redan använd punkt (bara om minD > 0)
      if (minD > 0 && used.some(u => haversineDistance(u.lat, u.lon, pt.lat, pt.lon) < minD)) continue;
      if (minD > 0) used.push({ lat: pt.lat, lon: pt.lon });

      const v = pt.vectors.find(v => v.time.startsWith(timestamp));
      if (!v || v.u == null || v.v == null) continue;

      const mag = Math.hypot(v.u, v.v);
      if (mag < 0.01) continue;
      
      const color = colorScale(mag).hex();

      // Create arrow feature - place exactly on the grid point coordinates
      const rotation = calculateRotation(v.u, v.v);
      
      // Calculate size based on zoom level - smaller at lower zoom
      let baseSize = 0.03; // Minskad från 0.04
      if (zoomLevel < 6) {
        baseSize = 0.015; // Minskad från 0.02
      } else if (zoomLevel < 7) {
        baseSize = 0.025; // Minskad från 0.03
      }
      
      const arrowFeature: GeoJSON.Feature = {
        type: 'Feature',
        properties: {
          color: color,
          magnitude: mag,
          opacity: performanceMode ? 0.8 : 1,
          rotation: rotation,
          size: baseSize // Konstant storlek, ingen ändring under dragging
        },
        geometry: {
          type: 'Point',
          coordinates: [pt.lon, pt.lat] // Exact coordinates, no offset
        }
      };
      arrowsFeatures.push(arrowFeature);
    }

    return {
      arrows: {
        type: 'FeatureCollection' as const,
        features: arrowsFeatures
      }
    };
  }, [gridData, colorScale, zoomLevel]);

  // 7) Main rendering effect with immediate updates
  useEffect(() => {
    if (!gridData.length || !baseTime || !timestampPrefix) return;

    const performanceMode = isDragging;
    
    // Always regenerate immediately - no caching
    const cachedData = createGeoJSONData(timestampPrefix, performanceMode);

    // Update the GeoJSON data state immediately
    setArrowsGeoJSON(cachedData.arrows);

  }, [gridData, timestampPrefix, zoomLevel, createGeoJSONData, isDragging]);

  // 8) No cleanup needed anymore (no cache)
  // useEffect removed since we don't use cache anymore

  if (!arrowsGeoJSON || !arrowImageLoaded) return null;

  return (
    <>
      <Source id="current-arrows" type="geojson" data={arrowsGeoJSON}>
        <Layer
          id="current-arrows-layer"
          type="symbol"
          layout={{
            'icon-image': 'arrow',
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4, ['*', ['get', 'size'], 0.6],  // Smaller at low zoom
              6, ['*', ['get', 'size'], 0.8],  // Medium at medium zoom
              8, ['get', 'size'],              // Normal at high zoom
              12, ['*', ['get', 'size'], 1.2]  // Slightly larger at very high zoom
            ],
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
    </>
  );
});

CurrentVectorsLayer.displayName = 'CurrentVectorsLayer';

export default CurrentVectorsLayer;
