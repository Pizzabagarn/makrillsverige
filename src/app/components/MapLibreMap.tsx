'use client';

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Map as ReactMapGL, MapRef } from 'react-map-gl/maplibre';
import { DeckGL } from '@deck.gl/react';
import { ScatterplotLayer, TextLayer, PathLayer, IconLayer } from '@deck.gl/layers';

import { useTimeSlider } from '../context/TimeSliderContext';
import type { PickingInfo, Color } from '@deck.gl/core';
import 'maplibre-gl/dist/maplibre-gl.css';

// Import våra data-typer
interface TemperatureData {
  lat: number;
  lon: number;
  temperature: number;
  time: string;
}

interface MackerelHotspot {
  lat: number;
  lon: number;
  suitability: number;
  temperature: number;
  salinity: number;
  confidence: 'low' | 'medium' | 'high';
}

interface CurrentVector {
  u: number;
  v: number;
  time: string;
}

interface GridPoint {
  lat: number;
  lon: number;
  vectors: CurrentVector[];
}

interface MapLibreMapProps {
  activeLayer: 'none' | 'temperature' | 'salinity' | 'current' | 'wind' | 'mackerel';
  activeDepth: 'surface' | '10m' | '20m' | '30m';
  showMackerelOverlay: boolean;
  showCurrentVectors: boolean;
  showWindVectors: boolean;
  mackerelThreshold: number;
}

// Heavy throttle function for dragging - borrowed from original CurrentVectorsLayer
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

// Dragging detection hook - borrowed from original CurrentVectorsLayer
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
    }, 300);

    return () => {
      if (dragTimer.current) {
        clearTimeout(dragTimer.current);
      }
    };
  }, [selectedHour]);

  return isDragging;
}

export default function MapLibreMap({
  activeLayer,
  activeDepth,
  showMackerelOverlay,
  showCurrentVectors,
  showWindVectors,
  mackerelThreshold
}: MapLibreMapProps) {
  const mapRef = useRef<MapRef>(null);
  const { selectedHour, displayHour, baseTime } = useTimeSlider();
  
  // Dragging detection and throttling - same as original CurrentVectorsLayer
  // Use selectedHour for consistent state management - the primary source of truth
  const isDragging = useDraggingDetection(selectedHour);
  const lightThrottledHour = useHeavyThrottle(selectedHour, 50);   
  const heavyThrottledHour = useHeavyThrottle(selectedHour, 200); 
  const effectiveSelectedHour = isDragging ? heavyThrottledHour : lightThrottledHour;

    // Data states enligt specifikationen
  const [temperatureData, setTemperatureData] = useState<TemperatureData[]>([]);
  const [mackerelHotspots, setMackerelHotspots] = useState<MackerelHotspot[]>([]);
  const [currentGridData, setCurrentGridData] = useState<GridPoint[]>([]);

  // Debug sync between ClockKnob and Map
  useEffect(() => {
    console.log(`🎯 MAP SYNC DEBUG:
      selectedHour: ${selectedHour}
      displayHour: ${displayHour}
      effectiveSelectedHour: ${effectiveSelectedHour}
      isDragging: ${isDragging}
      timestampPrefix: ${new Date(baseTime + effectiveSelectedHour * 3600_000).toISOString().slice(0, 13)}
      showCurrentVectors: ${showCurrentVectors}
      currentGridData.length: ${currentGridData.length}`);
  }, [selectedHour, displayHour, effectiveSelectedHour, isDragging, baseTime, showCurrentVectors, currentGridData.length]);
  const [visibleArrows, setVisibleArrows] = useState(0);
  const [loading, setLoading] = useState(false);

  // Cache for arrows to avoid recalculation - similar to original CurrentVectorsLayer
  const arrowCache = useRef<Map<string, any[]>>(new Map());

  const initialViewState = {
    longitude: 12.6,  // Centrerat på Öresund
    latitude: 56.0,
    zoom: 9,
    bearing: 0,
    pitch: 0
  };

  // Hämta temperaturdata enligt DMI EDR API-specifikationen
  useEffect(() => {
    if (activeLayer === 'temperature') {
      const fetchTemperatureData = async () => {
        setLoading(true);
        try {
          const response = await fetch(
            `/api/dmi/temperature?bbox=10.5,54.5,14.5,58.5&depth=${activeDepth}`
          );
          const result = await response.json();
          
          if (result.success) {
            setTemperatureData(result.data);
            console.log(`🌡️ Loaded ${result.data.length} temperature points`);
          } else {
            console.error('Failed to load temperature data:', result);
          }
        } catch (error) {
          console.error('Error fetching temperature data:', error);
        } finally {
          setLoading(false);
        }
      };

      fetchTemperatureData();
    }
  }, [activeLayer, activeDepth]);

  // Hämta makrill-hotspots enligt algoritmen
  useEffect(() => {
    if (showMackerelOverlay) {
      const fetchMackerelHotspots = async () => {
        try {
          const response = await fetch(
            `/api/mackerel/hotspots?bbox=10.5,54.5,14.5,58.5&threshold=${mackerelThreshold}&month=${new Date().getMonth() + 1}`
          );
          const result = await response.json();
          
          if (result.success) {
            setMackerelHotspots(result.data);
            console.log(`🐟 Loaded ${result.data.length} mackerel hotspots`);
          }
        } catch (error) {
          console.error('Error fetching mackerel hotspots:', error);
        }
      };

      fetchMackerelHotspots();
    }
  }, [showMackerelOverlay, mackerelThreshold]);

  // Hämta förberäknade havsström-data
  useEffect(() => {
    if (showCurrentVectors) {
      const fetchCurrentData = async () => {
        try {
          const response = await fetch('/data/precomputed-grid.json');
          const gridData: GridPoint[] = await response.json();
          setCurrentGridData(gridData);
          console.log(`🌊 Loaded ${gridData.length} current grid points`);
        } catch (error) {
          console.error('Error fetching current data:', error);
        }
      };

      fetchCurrentData();
    }
  }, [showCurrentVectors]);

  // Memoized timestamp prefix calculation - same logic as original CurrentVectorsLayer
  const timestampPrefix = useMemo(() => {
    if (!baseTime) return '';
    // baseTime is current UTC hour, so this calculation gives us the correct UTC time for data lookup
    return new Date(baseTime + effectiveSelectedHour * 3600_000)
      .toISOString().slice(0, 13);
  }, [effectiveSelectedHour, baseTime]);

  // Deck.gl lager enligt specifikationen
  const layers = useMemo(() => {
    const deckLayers: any[] = [];

    // Temperaturdatapunkter enligt specifikationen
    if (activeLayer === 'temperature' && temperatureData.length > 0) {
      const temperatureLayer = new ScatterplotLayer<TemperatureData>({
        id: 'temperature-points',
        data: temperatureData,
        getPosition: (d: TemperatureData) => [d.lon, d.lat],
        getFillColor: (d: TemperatureData) => {
          // Färgskala baserad på temperatur: Blå (kallt) -> Grön -> Gul -> Röd (varmt)
          const temp = d.temperature;
          if (temp < 5) return [0, 100, 255];      // Djupblå för kallt vatten
          if (temp < 10) return [0, 150, 255];     // Ljusblå 
          if (temp < 15) return [0, 255, 200];     // Turkos
          if (temp < 20) return [100, 255, 100];   // Grön
          if (temp < 25) return [255, 255, 0];     // Gul
          return [255, 100, 0];                    // Orange/röd för varmt
        },
        getRadius: 150,
        pickable: true,
        autoHighlight: true,
        highlightColor: [0, 0, 128, 128],
        radiusScale: 1,
        radiusMinPixels: 8,
        radiusMaxPixels: 100,
        visible: true
      });
      deckLayers.push(temperatureLayer);
    }

    // Makrill-hotspots enligt specifikationen
    if (showMackerelOverlay && mackerelHotspots.length > 0) {
      const mackerelLayer = new ScatterplotLayer<MackerelHotspot>({
        id: 'mackerel-hotspots',
        data: mackerelHotspots,
        getPosition: (d: MackerelHotspot) => [d.lon, d.lat],
        getFillColor: (d: MackerelHotspot) => {
          // Färgskala baserad på suitability: Grön (hög) -> Gul -> Orange -> Röd (låg)
          const suitability = d.suitability;
          if (suitability > 0.8) return [0, 255, 0];     // Grön för utmärkt
          if (suitability > 0.65) return [128, 255, 0];   // Gulgrön för bra
          if (suitability > 0.5) return [255, 255, 0];    // Gul för ok
          return [255, 128, 0];                           // Orange för dålig
        },
        getRadius: (d: MackerelHotspot) => d.suitability * 300 + 50,
        pickable: true,
        autoHighlight: true,
        highlightColor: [0, 0, 128, 128],
        radiusScale: 1,
        radiusMinPixels: 8,
        radiusMaxPixels: 100,
        visible: true
      });
      deckLayers.push(mackerelLayer);

      // Lägg till textlager för konfidensinfo
      const textLayer = new TextLayer<MackerelHotspot>({
        id: 'mackerel-labels',
        data: mackerelHotspots.filter(h => h.confidence === 'high').slice(0, 10), // Visa bara top hotspots
        getPosition: (d: MackerelHotspot) => [d.lon, d.lat],
        getText: (d: MackerelHotspot) => `${(d.suitability * 100).toFixed(0)}%`,
        getColor: [255, 255, 255],
        getSize: 12,
        getAngle: 0,
        getTextAnchor: 'middle' as const,
        getAlignmentBaseline: 'center' as const,
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        visible: true
      });
      deckLayers.push(textLayer);
    }

    // Havsströmmar som pilar med IconLayer - använder arrow.png
    if (showCurrentVectors && currentGridData.length > 0) {
      const iconData = [];
      for (const point of currentGridData) {
        const vector = point.vectors.find(v => v.time.startsWith(timestampPrefix));
        if (!vector || vector.u == null || vector.v == null) continue;
        
        const speed = Math.hypot(vector.u, vector.v);
        if (speed < 0.01) continue;
        
        const direction = Math.atan2(vector.u, vector.v) * (180 / Math.PI);
        
        iconData.push({
          position: [point.lon, point.lat],
          speed,
          direction,
          u: vector.u,
          v: vector.v,
          lat: point.lat,
          lon: point.lon
        });
      }
      
      if (iconData.length > 0) {
        const currentLayer = new IconLayer({
          id: 'current-arrows',
          data: iconData,
          getPosition: d => d.position,
          getIcon: () => ({
            url: '/images/arrow.png',
            width: 128,
            height: 128,
            anchorY: 64,
            anchorX: 64
          }),
          getSize: 25,
          getAngle: d => d.direction,
          getColor: d => {
            const speed = d.speed;
            if (speed < 0.1) return [50, 150, 255];     // Klarare blå
            if (speed < 0.3) return [0, 255, 150];      // Klarare grön  
            if (speed < 0.5) return [255, 200, 0];      // Klarare gul
            return [255, 80, 0];                        // Klarare röd
          },
          pickable: true,
          sizeScale: 1,
          visible: true
        });
        deckLayers.push(currentLayer);
        setVisibleArrows(iconData.length);
      }
    }

    return deckLayers;
  }, [activeLayer, temperatureData, showMackerelOverlay, mackerelHotspots, showCurrentVectors, currentGridData, timestampPrefix]);

  // Tooltip för interaktivitet enligt specifikationen
  const getTooltip = (info: PickingInfo) => {
    if (!info.object) return null;

    const object = info.object as any;

    if (object.temperature !== undefined) {
      return {
        html: `
          <div style="background: rgba(0,0,0,0.8); color: white; padding: 8px; border-radius: 4px;">
            <strong>Vattentemperatur</strong><br/>
            <strong>${object.temperature.toFixed(1)}°C</strong><br/>
            Position: ${object.lat.toFixed(3)}, ${object.lon.toFixed(3)}
          </div>
        `,
        style: { pointerEvents: 'none' }
      };
    }

    if (object.suitability !== undefined) {
      return {
        html: `
          <div style="background: rgba(0,50,0,0.9); color: white; padding: 8px; border-radius: 4px;">
            <strong>🐟 Makrill-Hotspot</strong><br/>
            <strong>Sannolikhet: ${(object.suitability * 100).toFixed(0)}%</strong><br/>
            Konfidans: ${object.confidence}<br/>
            Temperatur: ${object.temperature.toFixed(1)}°C<br/>
            Salthalt: ${object.salinity.toFixed(1)}‰<br/>
            Position: ${object.lat.toFixed(3)}, ${object.lon.toFixed(3)}
          </div>
        `,
        style: { pointerEvents: 'none' }
      };
    }

    if (object.speed !== undefined && object.position !== undefined) {
      const direction = object.direction;
      const directionDegrees = ((direction + 360) % 360).toFixed(0);
      
      return {
        html: `
          <div style="background: rgba(0,100,200,0.9); color: white; padding: 8px; border-radius: 4px;">
            <strong>🌊 Havsström</strong><br/>
            <strong>Hastighet: ${(object.speed * 100).toFixed(1)} cm/s</strong><br/>
            Riktning: ${directionDegrees}° från norr<br/>
            U: ${object.u.toFixed(3)} m/s, V: ${object.v.toFixed(3)} m/s<br/>
            Position: ${object.lat.toFixed(3)}, ${object.lon.toFixed(3)}
          </div>
        `,
        style: { pointerEvents: 'none' }
      };
    }

    return null;
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <DeckGL
        initialViewState={initialViewState}
        controller={true}
        layers={layers}
        getTooltip={getTooltip}
      >
        <ReactMapGL
          ref={mapRef}
          mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
          attributionControl={false}
        />
      </DeckGL>
      
      {/* Laddningsindikator */}
      {loading && (
        <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-2 rounded-lg">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            <span>Laddar data...</span>
          </div>
        </div>
      )}
      
      {/* Status-information enligt specifikationen - flyttad till vänster */}
      <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm text-white p-3 rounded-lg max-w-sm">
        <div className="text-sm space-y-1">
          <div><strong>Aktivt lager:</strong> {activeLayer}</div>
          <div><strong>Djup:</strong> {activeDepth}</div>
          {temperatureData.length > 0 && (
            <div><strong>Temperaturpunkter:</strong> {temperatureData.length}</div>
          )}
          {mackerelHotspots.length > 0 && (
            <div><strong>Makrill-hotspots:</strong> {mackerelHotspots.length}</div>
          )}
          {showCurrentVectors && currentGridData.length > 0 && (
            <div><strong>Strömpunkter:</strong> {currentGridData.length} → {visibleArrows} pilar</div>
          )}
          {showCurrentVectors && baseTime && (
            <div><strong>Strömtid:</strong> {new Date(baseTime + effectiveSelectedHour * 3600 * 1000).toLocaleString('sv-SE').slice(0, 16)}</div>
          )}
          {isDragging && (
            <div className="text-yellow-300"><strong>Status:</strong> Drar (display: {displayHour}, selected: {selectedHour}, effective: {effectiveSelectedHour})</div>
          )}
        </div>
      </div>
      
      {/* Temperaturlegend i nedersta högra hörnet */}
      {activeLayer === 'temperature' && (
        <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-sm text-white p-3 rounded-lg">
          <div className="text-sm font-medium mb-2">Vattentemperatur</div>
          <div className="flex items-center space-x-2 text-xs">
            <span>0°C</span>
            <div className="w-20 h-3 bg-gradient-to-r from-blue-700 via-cyan-400 via-green-400 via-yellow-400 to-red-500 rounded"></div>
            <span>25°C</span>
          </div>
          {temperatureData.length > 0 && (
            <div className="text-xs text-white/70 mt-1">
              Djup: {activeDepth === 'surface' ? 'Yta' : activeDepth}
            </div>
          )}
        </div>
      )}
    </div>
  );
} 