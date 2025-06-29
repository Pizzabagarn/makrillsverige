'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface AreaParametersData {
  points: Array<{
    lat: number;
    lon: number;
    data: Array<{
      time: string;
      current?: { u: number; v: number };
      temperature?: number;
      salinity?: number;
    }>;
  }>;
  metadata: {
    timestamps: string[];
  };
}

interface AreaParametersContextType {
  data: AreaParametersData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const AreaParametersContext = createContext<AreaParametersContextType | undefined>(undefined);

export function AreaParametersProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AreaParametersData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('🌊 Fetching area-parameters (centralized)...');
      const startTime = Date.now();
      
      const response = await fetch('/api/area-parameters');
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const areaData = await response.json();
      
      const loadTime = Date.now() - startTime;
      console.log(`✅ Area-parameters loaded in ${loadTime}ms (${areaData.points?.length || 0} points)`);
      
      setData(areaData);
    } catch (err: any) {
      console.error('❌ Failed to load area-parameters:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const refetch = async () => {
    await fetchData();
  };

  return (
    <AreaParametersContext.Provider value={{ data, isLoading, error, refetch }}>
      {children}
    </AreaParametersContext.Provider>
  );
}

export function useAreaParameters() {
  const context = useContext(AreaParametersContext);
  if (context === undefined) {
    throw new Error('useAreaParameters must be used within an AreaParametersProvider');
  }
  return context;
} 