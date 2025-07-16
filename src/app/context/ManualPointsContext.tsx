'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ManualGridPoint } from '@/lib/points';

interface ManualPointsContextType {
  // Manual point mode state
  isManualPointMode: boolean;
  setManualPointMode: (active: boolean) => void;
  
  // Manual points data
  manualPoints: ManualGridPoint[];
  
  // Point management functions
  addManualPoint: (lat: number, lon: number, name?: string) => void;
  removeManualPoint: (id: string) => void;
  hasPointAt: (lat: number, lon: number, tolerance?: number) => boolean;
  
  // Data checking
  checkDataAvailability: (lat: number, lon: number) => Promise<boolean>;
  
  // Persistence
  exportManualPoints: () => void;
  importManualPoints: (points: ManualGridPoint[]) => void;
}

const ManualPointsContext = createContext<ManualPointsContextType | undefined>(undefined);

const STORAGE_KEY = 'manual_points';
const TOLERANCE = 0.001; // ~100m precision

export function ManualPointsProvider({ children }: { children: React.ReactNode }) {
  const [isManualPointMode, setIsManualPointMode] = useState(false);
  const [manualPoints, setManualPoints] = useState<ManualGridPoint[]>([]);

  // Load manual points from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const points = JSON.parse(saved) as ManualGridPoint[];
        setManualPoints(points);
      }
    } catch (error) {
      console.warn('Failed to load manual points from localStorage:', error);
    }
  }, []);

  // Save manual points to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(manualPoints));
    } catch (error) {
      console.warn('Failed to save manual points to localStorage:', error);
    }
  }, [manualPoints]);

  const setManualPointMode = useCallback((active: boolean) => {
    setIsManualPointMode(active);
  }, []);

  const updateBackendFile = useCallback(async (points: ManualGridPoint[]) => {
    try {
      const response = await fetch('/api/manual-points/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ points }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const result = await response.json();
      console.log('✅ Backend file updated:', result);
    } catch (error) {
      console.error('❌ Failed to update backend file:', error);
    }
  }, []);

  const addManualPoint = useCallback((lat: number, lon: number, name?: string) => {
    try {
      // Validate inputs
      if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
        console.error('Invalid coordinates passed to addManualPoint:', { lat, lon });
        return;
      }
      
      // Ensure manualPoints is an array
      if (!Array.isArray(manualPoints)) {
        console.error('manualPoints is not an array:', manualPoints);
        return;
      }
      
      const id = `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const pointName = name || `Manuell punkt ${manualPoints.length + 1}`;
      
      const newPoint: ManualGridPoint = {
        id,
        lat: parseFloat(lat.toFixed(6)),
        lon: parseFloat(lon.toFixed(6)),
        name: pointName,
        isManualPoint: true,
        createdAt: new Date().toISOString()
      };

      const newPoints = [...manualPoints, newPoint];
      setManualPoints(newPoints);
      
      // Note: Backend file update is now handled manually via the UI button
      // This prevents automatic updates during development that could cause Fast Refresh issues
      
      console.log('🎯 Manual point added successfully:', newPoint);
    } catch (error) {
      console.error('Error in addManualPoint:', error);
    }
  }, [manualPoints, updateBackendFile]);

  const removeManualPoint = useCallback((id: string) => {
    const newPoints = manualPoints.filter(point => point.id !== id);
    setManualPoints(newPoints);
    
    // Skip backend file update during development to prevent Fast Refresh
    if (process.env.NODE_ENV === 'production') {
      updateBackendFile(newPoints);
    }
    
    console.log('🗑️ Manual point removed:', id);
  }, [manualPoints, updateBackendFile]);

  const hasPointAt = useCallback((lat: number, lon: number, tolerance: number = TOLERANCE) => {
    try {
      // Ensure we have valid inputs
      if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
        console.warn('Invalid coordinates passed to hasPointAt:', { lat, lon });
        return false;
      }
      
      // Ensure manualPoints is an array
      if (!Array.isArray(manualPoints)) {
        console.warn('manualPoints is not an array:', manualPoints);
        return false;
      }
      
      return manualPoints.some(point => {
        // Ensure point has valid coordinates
        if (!point || typeof point.lat !== 'number' || typeof point.lon !== 'number') {
          return false;
        }
        
        return Math.abs(point.lat - lat) < tolerance && 
               Math.abs(point.lon - lon) < tolerance;
      });
    } catch (error) {
      console.error('Error in hasPointAt:', error);
      return false;
    }
  }, [manualPoints]);

  const checkDataAvailability = useCallback(async (lat: number, lon: number): Promise<boolean> => {
    try {
      // Check if we have area parameters data for this location
      const response = await fetch('/api/area-parameters');
      if (!response.ok) return false;
      
      const data = await response.json();
      
      // Find nearest point within reasonable distance
      const nearestPoint = data.points?.find((point: any) => {
        const distance = Math.sqrt(
          Math.pow(point.lat - lat, 2) + Math.pow(point.lon - lon, 2)
        );
        return distance < 0.1; // Within ~10km
      });
      
      if (!nearestPoint) return false;
      
      // Check if point has recent data
      const recentData = nearestPoint.data?.find((d: any) => {
        const dataTime = new Date(d.time).getTime();
        const now = Date.now();
        return now - dataTime < 24 * 60 * 60 * 1000; // Within 24 hours
      });
      
      return !!recentData;
    } catch (error) {
      console.warn('Failed to check data availability:', error);
      return false;
    }
  }, []);

  const exportToFile = useCallback(() => {
    // Create file content for backend consumption
    const fileContent = `// Auto-generated manual points for DMI data fetching
// This file is updated automatically when manual points are added via UI

export interface ManualGridPoint {
  id?: string;
  lat: number;
  lon: number;
  name: string;
  isManualPoint: true;
  createdAt?: string;
}

export const DMI_GRID_POINTS: ManualGridPoint[] = [
  // 🌊 ÖRESUND - Ursprungliga specifika koordinater för bättre datatäckning
  { lat: 56.030646, lon: 12.676845, name: 'Öresund Nord', isManualPoint: true },
  { lat: 56.075782, lon: 12.571651, name: 'Öresund Väst', isManualPoint: true },
  { lat: 56.050565, lon: 12.611470, name: 'Öresund Central 1', isManualPoint: true },
  { lat: 56.020683, lon: 12.685760, name: 'Öresund Öst', isManualPoint: true },
  { lat: 56.089047, lon: 12.629894, name: 'Öresund Central 2', isManualPoint: true },
  { lat: 56.006397, lon: 12.602555, name: 'Öresund Syd', isManualPoint: true },
  { lat: 55.995430, lon: 12.656638, name: 'Öresund Sydöst', isManualPoint: true },
  { lat: 56.092031, lon: 12.584726, name: 'Öresund Nordväst', isManualPoint: true },
  { lat: 56.047029, lon: 12.677629, name: 'Öresund Central 3', isManualPoint: true },
  { lat: 56.066859, lon: 12.659960, name: 'Öresund Central 4', isManualPoint: true },
  { lat: 56.095156, lon: 12.615138, name: 'Öresund Central 5', isManualPoint: true },
  
  // 🎯 ANVÄNDARDEFINIERADE PUNKTER - Läggs till interaktivt via UI
${manualPoints.map(point => 
  `  { lat: ${point.lat}, lon: ${point.lon}, name: '${point.name}', isManualPoint: true${point.id ? `, id: '${point.id}'` : ''}${point.createdAt ? `, createdAt: '${point.createdAt}'` : ''} },`
).join('\n')}
];

export const USER_ADDED_MANUAL_POINTS = ${JSON.stringify(manualPoints, null, 2)};
`;

    // Download file for user
    const blob = new Blob([fileContent], { type: 'text/typescript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'points.ts';
    a.click();
    URL.revokeObjectURL(url);
  }, [manualPoints]);

  const exportManualPoints = useCallback(() => {
    const exportData = {
      exported_at: new Date().toISOString(),
      points: manualPoints,
      total_points: manualPoints.length
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `manual_points_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [manualPoints]);

  const importManualPoints = useCallback((points: ManualGridPoint[]) => {
    setManualPoints(points);
  }, []);

  const value = {
    isManualPointMode,
    setManualPointMode,
    manualPoints,
    addManualPoint,
    removeManualPoint,
    hasPointAt,
    checkDataAvailability,
    exportManualPoints,
    importManualPoints
  };

  return (
    <ManualPointsContext.Provider value={value}>
      {children}
    </ManualPointsContext.Provider>
  );
}

export function useManualPoints() {
  const context = useContext(ManualPointsContext);
  if (context === undefined) {
    throw new Error('useManualPoints must be used within a ManualPointsProvider');
  }
  return context;
} 