// src/app/context/TimeSliderContext.tsx
'use client';
import { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useAreaParameters } from './AreaParametersContext';

const TimeSliderContext = createContext<{
  selectedHour: number;
  displayHour: number; // For immediate UI feedback
  setSelectedHour: (h: number) => void;
  setDisplayHour: (h: number) => void; // For instant button feedback
  minHour: number;
  maxHour: number;
  setBounds: (min: number, max: number) => void;
  baseTime: number; // Add baseTime for consistent SSR/client rendering
  isLoadingBounds: boolean; // Add loading state
  availableHours: number[]; // Add available hours array
}>({
  selectedHour: 0,
  displayHour: 0,
  setSelectedHour: () => {},
  setDisplayHour: () => {},
  minHour: 0,
  maxHour: 0, // Will be set dynamically
  setBounds: () => {},
  baseTime: 0,
  isLoadingBounds: true,
  availableHours: [],
});

export const TimeSliderProvider = ({ children }: { children: React.ReactNode }) => {
  const { data: areaData, isLoading: areaDataLoading } = useAreaParameters();
  const [selectedHour, setSelectedHour] = useState(0);
  const [displayHour, setDisplayHour] = useState(0); // For immediate UI updates
  const [minHour, setMinHour] = useState(0); // Will be set dynamically from data
  const [maxHour, setMaxHour] = useState(0); // Will be set dynamically from data  
  const [baseTime, setBaseTime] = useState(0);
  const [isLoadingBounds, setIsLoadingBounds] = useState(true);
  
  // Update loading state based on area data loading
  useEffect(() => {
    if (areaDataLoading) {
      setIsLoadingBounds(true);
    }
  }, [areaDataLoading]);
  const [availableHours, setAvailableHours] = useState<number[]>([]);
  const initializedRef = useRef(false);

  // Calculate dynamic bounds when area data is available
  useEffect(() => {
    if (initializedRef.current || areaDataLoading || !areaData) return;
    
    const initializeBounds = () => {
      setIsLoadingBounds(true);
      
      try {
        if (!areaData.metadata?.timestamps || areaData.metadata.timestamps.length === 0) {
          throw new Error('No timestamps in area data');
        }
        
        // Get timestamps from metadata (all points should have same time series)
        const timestamps = areaData.metadata.timestamps;
        
        // First timestamp is oldest, last timestamp is newest
        const firstTimestamp = timestamps[0];
        const lastTimestamp = timestamps[timestamps.length - 1];
        
        // Set baseTime to CURRENT TIME UTC (rounded to nearest hour for consistency with data)
        const now = new Date();
        const currentHourUTC = new Date(Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(), 
          now.getUTCDate(),
          now.getUTCHours(),
          0, 0, 0
        ));
        const baseTime = currentHourUTC.getTime();
        
        // Calculate exact hours relative to CURRENT HOUR UTC for precise time alignment
        const availableHours: number[] = [];
        for (const ts of timestamps) {
          const dataTime = new Date(ts).getTime();
          const hour = Math.round((dataTime - baseTime) / (1000 * 60 * 60));
          availableHours.push(hour);
        }
        
        // Use exact first and last available hours as bounds
        const minHour = availableHours[0]; // First available hour (most negative)
        const maxHour = availableHours[availableHours.length - 1]; // Last available hour (most positive)
        
        // console.log(`📊 Dynamic time bounds calculated:
        //   Base time (current hour UTC): ${new Date(baseTime).toISOString()}
        //   Current time (local): ${new Date().toLocaleString('sv-SE')}
        //   First available data: ${firstTimestamp} (UTC)
        //   Last available data: ${lastTimestamp} (UTC)
        //   Available time steps: ${availableHours.length}
        //   Range: ${minHour} to ${maxHour} hours (current UTC hour = 0)
        //   First 5 available hours: [${availableHours.slice(0, 5).join(', ')}]
        //   Last 5 available hours: [${availableHours.slice(-5).join(', ')}]
        //   Note: Hour 0 = current UTC hour, UI shows local time but data is UTC-based`);
        
        // Set calculated bounds
        setMinHour(minHour);
        setMaxHour(maxHour);
        setBaseTime(baseTime);
        setAvailableHours(availableHours);
        
        // Start at current time (hour 0 = now), but clamp to available data bounds
        const startHour = Math.max(Math.min(0, maxHour), minHour);
        setSelectedHour(startHour);
        setDisplayHour(startHour);
        
      } catch (error) {
        // console.error('❌ Failed to calculate time bounds:', error);
        
        const fallbackBaseTime = new Date();
        fallbackBaseTime.setHours(fallbackBaseTime.getHours(), 0, 0, 0);
        
        // console.warn('⚠️ Using fallback time bounds due to data processing error');
        
        // Fallback to current time if data processing fails
        setBaseTime(fallbackBaseTime.getTime());
        setMinHour(-48); // 2 days back as fallback
        setMaxHour(120); // 5 days forward as fallback
        setSelectedHour(0); // Start at "now"
        setDisplayHour(0);
        setAvailableHours([]);
        
      }
      
      setIsLoadingBounds(false);
      initializedRef.current = true;
    };

    initializeBounds();
  }, [areaData, areaDataLoading]); // Depend on area data

  // Sync displayHour with selectedHour when not actively changing
  useEffect(() => {
    if (!initializedRef.current) return; // Don't sync during initialization
    setDisplayHour(selectedHour);
  }, [selectedHour]);

  const setBounds = useCallback((min: number, max: number) => {
    setMinHour(min);
    setMaxHour(max);
    setSelectedHour((h) => Math.min(Math.max(h, min), max));
    setDisplayHour((h) => Math.min(Math.max(h, min), max));
  }, []);

  // Function to find the closest available hour - always snaps to exact available timestamps
  const findClosestAvailableHour = useCallback((targetHour: number): number => {
    if (availableHours.length === 0) return targetHour;
    
    // Always find the closest available hour from the actual data
    return availableHours.reduce((prev, curr) => 
      Math.abs(curr - targetHour) < Math.abs(prev - targetHour) ? curr : prev
    );
  }, [availableHours]);

  // Direct setter for selectedHour - with validation against available hours
  const handleSetSelectedHour = useCallback((h: number) => {
    if (!initializedRef.current) return; // Prevent during initialization
    
    const closestAvailableHour = findClosestAvailableHour(h);
    
    // Only log in development
    if (process.env.NODE_ENV === 'development') {
      // console.log(`🎯 setSelectedHour: requested=${h}, closest=${closestAvailableHour}, current=${selectedHour}`);
      // console.log(`   Requested time (UTC): ${new Date(baseTime + h * 3600 * 1000).toISOString()}`);
      // console.log(`   Requested time (local): ${new Date(baseTime + h * 3600 * 1000).toLocaleString('sv-SE')}`);
      // console.log(`   Closest data time (UTC): ${new Date(baseTime + closestAvailableHour * 3600 * 1000).toISOString()}`);
    }
    
    if (closestAvailableHour !== selectedHour) {
      setSelectedHour(closestAvailableHour);
    }
  }, [selectedHour, findClosestAvailableHour]);

  // Display hour setter - for immediate UI feedback
  const handleSetDisplayHour = useCallback((h: number) => {
    if (!initializedRef.current) return; // Prevent during initialization
    
    const closestAvailableHour = findClosestAvailableHour(h);
    
    setDisplayHour(closestAvailableHour);
    if (closestAvailableHour !== selectedHour) {
      setSelectedHour(closestAvailableHour);
    }
  }, [selectedHour, findClosestAvailableHour]);

  const contextValue = useMemo(() => ({
    selectedHour,
    displayHour,
    setSelectedHour: handleSetSelectedHour,
    setDisplayHour: handleSetDisplayHour,
    minHour,
    maxHour,
    setBounds,
    baseTime,
    isLoadingBounds,
    availableHours
  }), [selectedHour, displayHour, handleSetSelectedHour, handleSetDisplayHour, minHour, maxHour, setBounds, baseTime, isLoadingBounds, availableHours]);

  return (
    <TimeSliderContext.Provider value={contextValue}>
      {children}
    </TimeSliderContext.Provider>
  );
};

export const useTimeSlider = () => useContext(TimeSliderContext);

// Helper function for improved date text with "Igår", "Överigår"
export const getDateText = (hour: number, baseTime: number): { weekday: string; fullDate: string } => {
  if (!baseTime) return { weekday: '', fullDate: '' };
  
  const date = new Date(baseTime + hour * 3600 * 1000);
  const now = new Date(baseTime); // baseTime is now current time
  
  // Calculate days difference based on actual date, not hours
  // This ensures proper day boundaries at midnight (00:00)
  const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysDiff = Math.round((targetDateOnly.getTime() - nowDateOnly.getTime()) / (1000 * 60 * 60 * 24));
  
  let weekday: string;
  if (daysDiff === 0) {
    weekday = 'Idag';
  } else if (daysDiff === 1) {
    weekday = 'Imorgon';
  } else if (daysDiff === -1) {
    weekday = 'Igår';
  } else if (daysDiff === -2) {
    weekday = 'Överigår';
  } else if (daysDiff < -2) {
    // For older dates, show weekday
    weekday = date.toLocaleDateString('sv-SE', { weekday: 'short' });
  } else {
    // For future dates beyond tomorrow, show weekday  
    weekday = date.toLocaleDateString('sv-SE', { weekday: 'short' });
  }
  
  const fullDate = date.toLocaleDateString('sv-SE', { 
    day: 'numeric', 
    month: 'short', 
    year: 'numeric' 
  });
  
  return { weekday, fullDate };
};
