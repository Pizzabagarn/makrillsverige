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

  const fetchData = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Tyst area-parameters hämtning
      const startTime = Date.now();
      
      // Försök först med API
      let areaData = null;
      try {
        areaData = await fetchFromAPI(signal);
      } catch (apiError) {
        // Tyst API fallback
        
        // Fallback: försök ladda direkt från statisk fil
        areaData = await fetchFromStaticFile(signal);
      }
      
      const loadTime = Date.now() - startTime;
      console.log(`✅ Area-parameters loaded in ${loadTime}ms (${areaData.points?.length || 0} points)`);
      
      // Validera data
      if (!areaData || !areaData.points || !Array.isArray(areaData.points)) {
        throw new Error('Invalid area-parameters data structure');
      }
      
      if (!areaData.metadata || !areaData.metadata.timestamps) {
        throw new Error('Missing metadata in area-parameters data');
      }
      
      console.log('📊 Data validation passed');
      setData(areaData);
      
    } catch (err: any) {
      // Detaljerad felhantering
      // Tyst detaljerad felhantering
      // Tyst felhantering
      
      if (err.name === 'AbortError') {
        console.log('🚫 Fetch aborted (normal behavior)');
        return;
      }
      
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        console.error('🌐 Network error - kontrollera nätverksanslutning');
        setError('Nätverksfel - kontrollera anslutningen');
      } else {
        console.error('❌ Failed to load area-parameters:', err);
        setError(err.message || 'Okänt fel vid laddning av data');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Försök med API först
  const fetchFromAPI = async (signal?: AbortSignal): Promise<AreaParametersData> => {
    const url = '/api/area-parameters';
          // Tyst API fetch
    
    const response = await fetch(url, { 
      signal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      cache: 'no-cache'
    });
    
    console.log('📊 API response status:', response.status);
    console.log('📊 API response ok:', response.ok);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API error response:', errorText);
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
    
    return await response.json();
  };

  // Fallback: ladda direkt från statisk fil
  const fetchFromStaticFile = async (signal?: AbortSignal): Promise<AreaParametersData> => {
          // Tyst statisk filladdning
    
    // Först, testa om komprimerad fil finns
    let fileUrl = '/data/area-parameters-extended.json.gz';
          // Tyst komprimerad filtest
    
    try {
      const response = await fetch(fileUrl, { 
        signal,
        headers: {
          'Accept': 'application/json, application/gzip',
        },
        cache: 'no-cache'
      });
      
      if (response.ok) {
        console.log('✅ Komprimerad fil hittades');
        
        // Kontrollera om vi får compressed data
        const contentEncoding = response.headers.get('Content-Encoding');
        console.log('📊 Content-Encoding:', contentEncoding);
        
        if (contentEncoding === 'gzip') {
          // Browsern dekomprimerar automatiskt
          return await response.json();
        } else {
          // Manuell dekomprimering kan behövas
          const arrayBuffer = await response.arrayBuffer();
          console.log('📊 Received arrayBuffer size:', arrayBuffer.byteLength);
          
          // Försök med pako för dekomprimering
          const pako = await import('pako');
          const decompressed = pako.inflate(new Uint8Array(arrayBuffer), { to: 'string' });
          return JSON.parse(decompressed);
        }
      }
    } catch (gzError) {
              // Tyst komprimerad fil fallback
    }
    
    // Fallback: försök med okomprimerad fil
    fileUrl = '/data/area-parameters-extended.json';
            // Tyst okomprimerad filtest
    
    const response = await fetch(fileUrl, { 
      signal,
      headers: {
        'Accept': 'application/json',
      },
      cache: 'no-cache'
    });
    
    if (!response.ok) {
      throw new Error(`Kunde inte ladda statisk fil: ${response.status}`);
    }
    
    console.log('✅ Okomprimerad fil hittades');
    return await response.json();
  };

  useEffect(() => {
    // Tyst provider mounting
    const abortController = new AbortController();
    fetchData(abortController.signal);
    
    return () => {
      // Tyst provider unmounting
      abortController.abort();
    };
  }, []);

  const refetch = async () => {
    console.log('🔄 Manual refetch requested');
    const abortController = new AbortController();
    await fetchData(abortController.signal);
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