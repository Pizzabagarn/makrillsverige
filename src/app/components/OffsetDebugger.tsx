'use client';

import { useState, useEffect } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { getRegionForPosition, listAllRegions } from '../../lib/layerOffsets';

interface OffsetDebuggerProps {
  visible?: boolean;
  className?: string;
}

export default function OffsetDebugger({ visible = false, className = '' }: OffsetDebuggerProps) {
  const { current: map } = useMap();
  const [currentRegion, setCurrentRegion] = useState<string>('Unknown');
  const [mapCenter, setMapCenter] = useState<{ lon: number; lat: number }>({ lon: 0, lat: 0 });
  const [showAllRegions, setShowAllRegions] = useState(false);

  // Uppdatera region baserat på kartans centrum
  useEffect(() => {
    if (!map) return;

    const updateRegion = () => {
      const center = map.getCenter();
      const region = getRegionForPosition(center.lng, center.lat);
      setCurrentRegion(region);
      setMapCenter({ lon: center.lng, lat: center.lat });
    };

    // Initial update
    updateRegion();

    // Lyssna på kartförflyttningar
    map.on('moveend', updateRegion);
    map.on('zoomend', updateRegion);

    return () => {
      map.off('moveend', updateRegion);
      map.off('zoomend', updateRegion);
    };
  }, [map]);

  if (!visible) return null;

  const allRegions = listAllRegions();

  return (
    <div className={`bg-black/80 text-white p-4 rounded-lg text-sm font-mono ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-blue-400">🎯 Offset Debugger</h3>
        <button
          onClick={() => setShowAllRegions(!showAllRegions)}
          className="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded"
        >
          {showAllRegions ? 'Dölj Alla' : 'Visa Alla'}
        </button>
      </div>

      {/* Aktuell position och region */}
      <div className="space-y-2 mb-4">
        <div className="text-green-400">
          <strong>Kartcentrum:</strong> {mapCenter.lon.toFixed(4)}, {mapCenter.lat.toFixed(4)}
        </div>
        <div className="text-yellow-400">
          <strong>Aktiv Region:</strong> {currentRegion}
        </div>
      </div>

      {/* Alla regioner (optional) */}
      {showAllRegions && (
        <div className="max-h-96 overflow-y-auto border-t border-gray-600 pt-3">
          <h4 className="text-sm font-bold text-orange-400 mb-2">Alla Definierade Regioner:</h4>
          <div className="grid grid-cols-1 gap-2 text-xs">
            {allRegions.map((region, index) => (
              <div 
                key={index} 
                className={`p-2 rounded border ${
                  region.offset.region === currentRegion 
                    ? 'bg-blue-900/50 border-blue-400' 
                    : 'bg-gray-800/50 border-gray-600'
                }`}
              >
                <div className="font-bold text-white">{region.name}</div>
                <div className="text-gray-300">
                  Bounds: [{region.bounds.lon_min.toFixed(1)}, {region.bounds.lat_min.toFixed(1)}] 
                  → [{region.bounds.lon_max.toFixed(1)}, {region.bounds.lat_max.toFixed(1)}]
                </div>
                <div className="text-orange-300">
                  Offset: lat={region.offset.lat_offset.toFixed(3)}, lon={region.offset.lon_offset.toFixed(3)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instruktioner */}
      <div className="text-xs text-gray-400 mt-4 border-t border-gray-600 pt-2">
        <p>💡 Flytta kartan för att se vilken region som används</p>
        <p>🔧 Justera offset-värden i <code>src/lib/layerOffsets.ts</code></p>
      </div>
    </div>
  );
} 