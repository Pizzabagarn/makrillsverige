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
    }, 1000) as any; // Längre timeout för mindre känslighet

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

interface CurrentVectorsLayerProps {
  visible?: boolean;
}

const CurrentVectorsLayer = React.memo<CurrentVectorsLayerProps>(({ 
  visible = true 
}) => {
  const { current: map } = useMap();
  const { selectedHour, baseTime } = useTimeSlider();
  
  // Track if arrow image is loaded
  const [arrowImageLoaded, setArrowImageLoaded] = useState(false);
  
  // Detect if user is actively dragging
  const isDragging = useDraggingDetection(selectedHour);
  
  // Use different throttling based on dragging state - mycket aggressivare
  const lightThrottledHour = useHeavyThrottle(selectedHour, 200);   // Långsammare även när inte dragging
  const heavyThrottledHour = useHeavyThrottle(selectedHour, 800);   // Mycket långsam under dragging
  const effectiveSelectedHour = isDragging ? heavyThrottledHour : lightThrottledHour;
  
  const [gridData, setGridData] = useState<GridPoint[]>([]);
  const [zoomLevel, setZoomLevel] = useState(8.5);
  const [arrowsGeoJSON, setArrowsGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);

  // 1) Ladda grid från area-parameters API
  useEffect(() => {
    const loadGridData = async () => {
      try {
        const response = await fetch('/api/area-parameters');
        if (!response.ok) {
          console.warn('⚠️ Area parameters API inte tillgänglig');
          return;
        }
        
        const data = await response.json();
        if (data.points) {
          // Konvertera area-parameters format till grid format
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
          console.log(`✅ Grid data laddad: ${gridPoints.length} punkter`);
        }
      } catch (error) {
        console.error('❌ Kunde inte ladda grid data:', error);
      }
    };
    
    loadGridData();
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

    // Visa alla pilar på alla zoom-nivåer - ingen begränsning
    const minD = 0; // Alltid visa alla pilar

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

  if (!visible || !arrowsGeoJSON || !arrowImageLoaded) return null;

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
