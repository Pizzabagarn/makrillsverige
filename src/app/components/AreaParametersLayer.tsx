'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer } from 'react-map-gl/maplibre';
import chroma from 'chroma-js';
import { useTimeSlider } from '../context/TimeSliderContext';
import { useAreaParameters } from '../context/AreaParametersContext';

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
  const { data: areaData, isLoading: areaDataLoading } = useAreaParameters();
  
  const [zoomLevel, setZoomLevel] = useState<number>(8);
  
  // Performance optimization states
  const throttledSelectedHour = useHeavyThrottle(selectedHour, 150);
  const isDragging = useDraggingDetection(throttledSelectedHour);
  const effectiveSelectedHour = isDragging ? throttledSelectedHour : selectedHour;

  // Data now comes from centralized AreaParametersContext

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