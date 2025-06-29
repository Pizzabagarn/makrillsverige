'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer } from 'react-map-gl/maplibre';
import chroma from 'chroma-js';
import { useTimeSlider } from '../context/TimeSliderContext';

// Interface definitions for area parameters data (temperature, salinity, etc)
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

// Simple haversine distance function (not used for arrows anymore)
function haversineDistance(lat1:number,lon1:number,lat2:number,lon2:number) {
  const R=6371, toRad=(d:number)=>(d*Math.PI)/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.asin(Math.sqrt(a));
}

// Heavy throttle for performance
function useHeavyThrottle<T>(value: T, delay: number): T {
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

// Detect dragging for performance optimization
function useDraggingDetection(selectedHour: number): boolean {
  const [isDragging, setIsDragging] = useState(false);
  const [lastChangeTime, setLastChangeTime] = useState(Date.now());

  useEffect(() => {
    setLastChangeTime(Date.now());
    setIsDragging(true);
    
    const timer = setTimeout(() => {
      setIsDragging(false);
    }, 500); // Consider dragging stopped after 500ms of no changes

    return () => clearTimeout(timer);
  }, [selectedHour]);

  return isDragging;
}

const AreaParametersLayer = React.memo(() => {
  const { current: map } = useMap();
  const { selectedHour, baseTime } = useTimeSlider();
  
  // State for area parameters data (temperature, salinity, etc) - NO ARROWS
  const [areaData, setAreaData] = useState<AreaParametersData | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(8);
  
  // Performance optimization states
  const throttledSelectedHour = useHeavyThrottle(selectedHour, 150);
  const isDragging = useDraggingDetection(throttledSelectedHour);
  const effectiveSelectedHour = isDragging ? throttledSelectedHour : selectedHour;

  // Load area parameters data
  useEffect(() => {
    const loadAreaData = async () => {
      try {
        const cacheKey = 'area-parameters-cache';
        const cacheTimeKey = 'area-parameters-cache-time';
        
        // Check cache first
        try {
          const cachedData = localStorage.getItem(cacheKey);
          const cacheTime = localStorage.getItem(cacheTimeKey);
          
                     if (cachedData && cacheTime) {
             const cacheAge = Date.now() - parseInt(cacheTime);
             if (cacheAge < 30 * 60 * 1000) { // 30 minutes
               setAreaData(JSON.parse(cachedData));
               return;
             }
           }
         } catch (e) {
           // Cache read failed, will fetch fresh data
         }
        
        // Fetch fresh data if no valid cache
        await fetchAndCacheData(cacheKey, cacheTimeKey, true);
        
      } catch (error) {
        console.error('❌ Could not load area data:', error);
      }
    };

    const fetchAndCacheData = async (cacheKey: string, cacheTimeKey: string, updateUI: boolean) => {
      try {
        const response = await fetch('/api/area-parameters');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        if (updateUI) {
          setAreaData(data);
        }
        
        // Try to cache (might fail if quota exceeded)
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
          localStorage.setItem(cacheTimeKey, Date.now().toString());
        } catch (error) {
          console.log('⚠️ Could not cache data in localStorage - quota exceeded');
          // Clear old cache data to make space
          localStorage.removeItem(cacheKey);
          localStorage.removeItem(cacheTimeKey);
        }
        
      } catch (error) {
        console.error('❌ Failed to fetch area-parameters data:', error);
      }
    };

    loadAreaData();
  }, []);

  // Track zoom level changes
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

  // Create temperature/salinity visualization data (if needed in future)
  const createParametersData = useCallback((timestamp: string) => {
    if (!areaData?.points) return null;
    
    // This could be used for temperature/salinity heatmaps in the future
    // For now, just process the data silently
    let tempCount = 0;
    let salinityCount = 0;
    
    for (const point of areaData.points) {
      const dataEntry = point.data.find(d => d.time === timestamp);
      if (dataEntry?.temperature) tempCount++;
      if (dataEntry?.salinity) salinityCount++;
    }
    
    return null;
  }, [areaData]);

  // Find target timestamp
  const targetTimestamp = useMemo(() => {
    if (!baseTime || !areaData?.metadata?.timestamps) return '';
    
    const targetTime = new Date(baseTime + effectiveSelectedHour * 3600_000);
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

  // Process parameters data when timestamp changes
  useEffect(() => {
    if (!areaData?.points || !baseTime || !targetTimestamp) return;

    // Process area parameters (temperature, salinity, etc) - NO ARROWS!
    const parametersData = createParametersData(targetTimestamp);

  }, [areaData, targetTimestamp, createParametersData, baseTime]);

  // AreaParametersLayer no longer renders arrows - only area parameters!
  // Future implementation could render temperature/salinity heatmaps here
  return null;
});

AreaParametersLayer.displayName = 'AreaParametersLayer';

export default AreaParametersLayer; 