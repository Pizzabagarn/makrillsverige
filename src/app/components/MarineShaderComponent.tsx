'use client';

import { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { MarineShaderLayer } from '../../lib/webgl/MarineShaderLayer';
import { useTimeSlider } from '../context/TimeSliderContext';
import { useHeavyThrottle, useDraggingDetection } from '../../lib/throttleHooks';
import React from 'react';

interface MarineShaderComponentProps {
  parameter: string;           // 'current', 'temperature', 'salinity'
  visible?: boolean;          // Visa/dölj lager
  opacity?: number;           // 0.0 - 1.0
  enhanced?: boolean;         // Använd enhanced shader med effekter
}

const MarineShaderComponent = React.memo<MarineShaderComponentProps>(({ 
  parameter,
  visible = true, 
  opacity = 1.0,
  enhanced = false
}) => {
  const { current: map } = useMap();
  const { selectedHour, displayHour, baseTime } = useTimeSlider();
  
  // Performance throttling - samma som andra lager
  const isDragging = useDraggingDetection(selectedHour);
  const lightThrottledHour = useHeavyThrottle(displayHour, 10);
  const heavyThrottledHour = useHeavyThrottle(displayHour, 50);
  const effectiveSelectedHour = isDragging ? heavyThrottledHour : lightThrottledHour;
  
  // State management
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shaderLayerRef = useRef<MarineShaderLayer | null>(null);
  const layerIdRef = useRef<string>(`shader-${parameter}-${Date.now()}`);

  // Aktuell tidsstämpel för shader
  const currentTime = React.useMemo(() => {
    if (!baseTime) return new Date();
    return new Date(baseTime + effectiveSelectedHour * 3600_000);
  }, [baseTime, effectiveSelectedHour]);

  // Initiera shader layer när map är redo
  useEffect(() => {
    if (!map || !visible) return;

    // Få tag på den faktiska MapLibre GL Map-instansen
    const mapInstance = map.getMap();
    if (!mapInstance) return;

    const layerId = layerIdRef.current;

    const initializeShaderLayer = async () => {
      try {
        console.log(`🚀 Initializing shader layer for ${parameter}`);
        setError(null);

        // Skapa shader layer
        console.log(`🚀 Creating shader layer with parameter: ${parameter}`);
        const shaderLayer = new MarineShaderLayer(layerId, {
          parameter,
          opacity,
          enhanced,
          onDataLoaded: () => {
            console.log(`✅ Shader data loaded for ${parameter}`);
            setIsLoaded(true);
          },
          onError: (err) => {
            console.error(`❌ Shader layer error for ${parameter}:`, err);
            setError(err.message);
          }
        });

        // Lägg till i map
        mapInstance.addLayer(shaderLayer);
        shaderLayerRef.current = shaderLayer;

        // Sätt initial tid
        shaderLayer.setCurrentTime(currentTime);

        console.log(`🎯 Added shader layer: ${layerId}`);

      } catch (err) {
        console.error(`❌ Failed to initialize shader layer for ${parameter}:`, err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    initializeShaderLayer();

    // Cleanup
    return () => {
      if (mapInstance && shaderLayerRef.current) {
        try {
          mapInstance.removeLayer(layerId);
          console.log(`🗑️ Removed shader layer: ${layerId}`);
        } catch (err) {
          console.warn(`⚠️ Error removing shader layer ${layerId}:`, err);
        }
        shaderLayerRef.current = null;
      }
    };
  }, [map, visible, parameter, enhanced]); // Recreate if these change

  // Uppdatera tid när time slider ändras
  useEffect(() => {
    if (shaderLayerRef.current && isLoaded) {
      shaderLayerRef.current.setCurrentTime(currentTime);
    }
  }, [currentTime, isLoaded]);

  // Uppdatera opacity när den ändras
  useEffect(() => {
    if (shaderLayerRef.current && isLoaded) {
      shaderLayerRef.current.setOpacity(opacity);
    }
  }, [opacity, isLoaded]);

  // Ta bort lager när visible = false
  useEffect(() => {
    if (!visible && map && shaderLayerRef.current) {
      const mapInstance = map.getMap();
      if (!mapInstance) return;
      
      const layerId = layerIdRef.current;
      try {
        mapInstance.removeLayer(layerId);
        console.log(`🙈 Hidden shader layer: ${layerId}`);
      } catch (err) {
        console.warn(`⚠️ Error hiding shader layer ${layerId}:`, err);
      }
      shaderLayerRef.current = null;
      setIsLoaded(false);
    }
  }, [visible, map]);

  // Debug-information (endast i development)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const status = error ? '❌ Error' : (isLoaded ? '✅ Loaded' : '⏳ Loading');
      console.log(`🐛 Shader ${parameter}: ${status}${error ? ` - ${error}` : ''}`);
    }
  }, [parameter, isLoaded, error]);

  // Komponenten renderar ingenting - allt sköts av MapLibre custom layer
  return null;
});

MarineShaderComponent.displayName = 'MarineShaderComponent';

export default MarineShaderComponent;

// Helper component för att visa shader status
interface ShaderStatusProps {
  parameter: string;
  isLoaded: boolean;
  error: string | null;
}

export const ShaderStatus: React.FC<ShaderStatusProps> = ({ 
  parameter, 
  isLoaded, 
  error 
}) => {
  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <div className="absolute top-32 left-4 z-30 bg-black/80 text-white p-2 rounded text-xs font-mono">
      <div className="flex items-center gap-2">
        <span>{parameter.toUpperCase()}</span>
        <span>
          {error ? '❌' : (isLoaded ? '✅' : '⏳')}
        </span>
      </div>
      {error && (
        <div className="text-red-300 mt-1 max-w-xs overflow-hidden text-ellipsis">
          {error}
        </div>
      )}
    </div>
  );
}; 