'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer } from 'react-map-gl/maplibre';
import React from 'react';
import chroma from 'chroma-js';
import { useTimeSlider } from '../context/TimeSliderContext';
import type { GeoJSON } from 'geojson';

interface CurrentData { u: number; v: number; }
interface DataEntry { 
  time: string; 
  current?: CurrentData; 
  temperature?: number; 
  salinity?: number;
}
interface AreaPoint { 
  lat: number; 
  lon: number; 
  data: DataEntry[];
}

interface AreaParametersData {
  metadata: {
    collection: string;
    parameters: string[];
    timestamps: string[];
    fetchedAt: string;
  };
  points: AreaPoint[];
}

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
    
    // Set timer to detect when dragging stops (150ms after last change for faster response)
    dragTimer.current = setTimeout(() => {
      setIsDragging(false);
    }, 150) as any;

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

const AreaParametersLayer = React.memo(() => {
  const { current: map } = useMap();
  const { selectedHour, baseTime } = useTimeSlider();
  
  // Track if arrow image is loaded
  const [arrowImageLoaded, setArrowImageLoaded] = useState(false);
  
  // Detect if user is actively dragging
  const isDragging = useDraggingDetection(selectedHour);
  
  // More aggressive throttling based on dragging state
  const lightThrottledHour = useHeavyThrottle(selectedHour, 100);   // Slower updates when not dragging
  const heavyThrottledHour = useHeavyThrottle(selectedHour, 500);   // Much slower updates when dragging
  const effectiveSelectedHour = isDragging ? heavyThrottledHour : lightThrottledHour;
  
  const [areaData, setAreaData] = useState<AreaParametersData | null>(null);
  const [zoomLevel, setZoomLevel] = useState(8.5);
  const [arrowsGeoJSON, setArrowsGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [showArrows, setShowArrows] = useState(true); // Control arrow visibility

  // 1) Ladda area-parameters data med client-side cache
  useEffect(() => {
    const loadAreaData = async () => {
      try {
        // Försök ladda från localStorage först för instant laddning
        const cacheKey = 'area-parameters-cache';
        const cacheTimeKey = 'area-parameters-cache-time';
        const CACHE_DURATION = 1000 * 60 * 60; // 1 timme
        
        const cachedData = localStorage.getItem(cacheKey);
        const cacheTime = localStorage.getItem(cacheTimeKey);
        
        const now = Date.now();
        const isCacheValid = cachedData && cacheTime && 
                            (now - parseInt(cacheTime)) < CACHE_DURATION;
        
        if (isCacheValid) {
          console.log('⚡ Loading area-parameters from browser cache (instant)');
          const data = JSON.parse(cachedData);
          setAreaData(data);
          
          // Hämta ny data i bakgrunden för nästa gång
          fetchAndCacheData(cacheKey, cacheTimeKey, false);
          return;
        }
        
        // Ingen cache eller utgången - hämta från server
        console.log('🔄 Loading area-parameters from server...');
        await fetchAndCacheData(cacheKey, cacheTimeKey, true);
        
      } catch (error) {
        console.error('❌ Failed to load area-parameters data:', error);
      }
    };
    
    const fetchAndCacheData = async (cacheKey: string, cacheTimeKey: string, updateUI: boolean) => {
      const response = await fetch('/api/area-parameters');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Spara i localStorage för nästa gång
      try {
        localStorage.setItem(cacheKey, JSON.stringify(data));
        localStorage.setItem(cacheTimeKey, Date.now().toString());
        console.log('💾 Area-parameters cached in browser');
      } catch (e) {
        console.warn('⚠️ Could not cache data in localStorage:', e);
      }
      
      if (updateUI) {
        console.log('✅ Area-parameters data loaded:', {
          points: data.points?.length || 0,
          parameters: data.metadata?.parameters || [],
          timestamps: data.metadata?.timestamps?.length || 0
        });
        setAreaData(data);
      }
    };
    
    loadAreaData();
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

  // 5) Memoized timestamp for data lookup
  const targetTimestamp = useMemo(() => {
    if (!baseTime || !areaData?.metadata?.timestamps) return '';
    
    // Calculate the target time based on baseTime + selectedHour
    const targetTime = new Date(baseTime + effectiveSelectedHour * 3600_000);
    const targetISOString = targetTime.toISOString();
    
    // Find the closest timestamp in the data
    const availableTimestamps = areaData.metadata.timestamps;
    let closestTimestamp = availableTimestamps[0];
    let minDiff = Math.abs(new Date(availableTimestamps[0]).getTime() - targetTime.getTime());
    
    for (const timestamp of availableTimestamps) {
      const diff = Math.abs(new Date(timestamp).getTime() - targetTime.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closestTimestamp = timestamp;
      }
    }
    
    return closestTimestamp;
  }, [effectiveSelectedHour, baseTime, areaData?.metadata?.timestamps]);

  // 6) Create GeoJSON data for arrows
  const createGeoJSONData = useCallback((timestamp: string, performanceMode: boolean = false) => {
    if (!areaData?.points) return { arrows: { type: 'FeatureCollection' as const, features: [] } };
    
    const arrowsFeatures: GeoJSON.Feature[] = [];

        // Show all arrows at high zoom, then use constant density approach when zoomed out
    let minD: number;
    
    if (zoomLevel >= 7) {
      // Show all arrows at zoom 7 and higher (4 steps from current ~11)
      minD = 0;
    } else {
      // Constant density approach for lower zoom levels
      const targetArrowCount = performanceMode ? 30 : 80; // Fewer during dragging
      
      // Calculate approximate screen coverage in km based on zoom
      const screenWidthKm = 40000 / Math.pow(2, zoomLevel); // Rough approximation
      
      // Calculate minimum distance to achieve target density
      const areaKm2 = screenWidthKm * screenWidthKm * 0.7; // 0.7 factor for water coverage
      minD = Math.sqrt(areaKm2 / targetArrowCount) * 0.8; // 0.8 factor for overlap
    }

    const used: { lat: number; lon: number }[] = [];
    
    // In performance mode, skip many points entirely
    const skipRatio = performanceMode ? 3 : 1; // Only process every 3rd point during dragging
    let pointIndex = 0;

    for (const point of areaData.points) {
      pointIndex++;
      
      // Skip points in performance mode for faster rendering
      if (performanceMode && pointIndex % skipRatio !== 0) continue;
      
      // Distance-based filtering - skip if too close to an already used point
      if (minD > 0 && used.some(u => haversineDistance(u.lat, u.lon, point.lat, point.lon) < minD)) continue;
      if (minD > 0) used.push({ lat: point.lat, lon: point.lon });

      // Find data for the target timestamp
      const dataEntry = point.data.find(d => d.time === timestamp);
      if (!dataEntry || !dataEntry.current) continue;

      const { u, v } = dataEntry.current;
      if (u == null || v == null) continue;

      const mag = Math.hypot(u, v);
      if (mag < 0.01) continue; // Skip very small currents
      
      const color = colorScale(mag).hex();

      // Create arrow feature
      const rotation = calculateRotation(u, v);
      
      // Calculate size based on zoom level
      let baseSize = 0.03;
      if (zoomLevel < 6) {
        baseSize = 0.015;
      } else if (zoomLevel < 7) {
        baseSize = 0.025;
      }
      
      const arrowFeature: GeoJSON.Feature = {
        type: 'Feature',
        properties: {
          color: color,
          magnitude: mag,
          opacity: performanceMode ? 0.8 : 1,
          rotation: rotation,
          size: baseSize,
          // Additional properties from area data
          temperature: dataEntry.temperature,
          salinity: dataEntry.salinity,
          timestamp: timestamp
        },
        geometry: {
          type: 'Point',
          coordinates: [point.lon, point.lat]
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
  }, [areaData, colorScale, zoomLevel]);

  // 7) Hide arrows temporarily during active dragging for ultra-smooth experience
  useEffect(() => {
    if (isDragging) {
      setShowArrows(false);
      // Show arrows again after a short delay when dragging stops
      const timer = setTimeout(() => {
        setShowArrows(true);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setShowArrows(true);
    }
  }, [isDragging]);

  // 8) Main rendering effect
  useEffect(() => {
    if (!areaData?.points || !baseTime || !targetTimestamp) return;

    const performanceMode = isDragging;
    
    // Generate GeoJSON data
    const geoJSONData = createGeoJSONData(targetTimestamp, performanceMode);

    // Update the GeoJSON data state
    setArrowsGeoJSON(geoJSONData.arrows);

    console.log('🔄 Updated area-parameters visualization:', {
      timestamp: targetTimestamp,
      arrows: geoJSONData.arrows.features.length,
      performanceMode,
      showArrows,
      zoomLevel: zoomLevel.toFixed(1)
    });

  }, [areaData, targetTimestamp, zoomLevel, createGeoJSONData, isDragging, baseTime]);

  if (!arrowsGeoJSON || !arrowImageLoaded || !showArrows) return null;

  return (
    <>
      <Source id="area-current-arrows" type="geojson" data={arrowsGeoJSON}>
        <Layer
          id="area-current-arrows-layer"
          type="symbol"
          layout={{
            'icon-image': 'arrow',
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4, ['*', ['get', 'size'], 0.6],
              6, ['*', ['get', 'size'], 0.8],
              8, ['get', 'size'],
              12, ['*', ['get', 'size'], 1.2]
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

AreaParametersLayer.displayName = 'AreaParametersLayer';

export default AreaParametersLayer; 