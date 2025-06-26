'use client';

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Map as ReactMapGL, MapRef } from 'react-map-gl/maplibre';
import { DeckGL } from '@deck.gl/react';
import { ScatterplotLayer, TextLayer, IconLayer } from '@deck.gl/layers';

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
          // Mock temperaturdata för demo - ersätt med riktig API när den finns
          const mockData: TemperatureData[] = [];
          for (let lat = 55.0; lat <= 58.0; lat += 0.1) {
            for (let lon = 10.5; lon <= 14.5; lon += 0.1) {
              mockData.push({
                lat,
                lon,
                temperature: 8 + Math.random() * 10, // 8-18°C
                time: new Date().toISOString()
              });
            }
          }
          setTemperatureData(mockData);
          console.log(`🌡️ Loaded ${mockData.length} temperature points (mock data)`);
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
          // Mock makrill-hotspots för demo - ersätt med riktig algoritm
          const mockHotspots: MackerelHotspot[] = [
            {
              lat: 57.0,
              lon: 11.5,
              suitability: 0.85,
              temperature: 12.5,
              salinity: 34.2,
              confidence: 'high'
            },
            {
              lat: 56.2,
              lon: 12.8,
              suitability: 0.72,
              temperature: 13.1,
              salinity: 33.8,
              confidence: 'medium'
            },
            {
              lat: 55.8,
              lon: 13.2,
              suitability: 0.65,
              temperature: 11.8,
              salinity: 34.5,
              confidence: 'medium'
            }
          ];
          setMackerelHotspots(mockHotspots);
          console.log(`🐟 Loaded ${mockHotspots.length} mackerel hotspots (mock data)`);
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

  // Create arrows data with caching - optimized for better visual density
  const createArrowsData = useCallback((performanceMode: boolean = false) => {
    if (!currentGridData.length || !baseTime || !timestampPrefix) {
      return [];
    }

    const cacheKey = `${timestampPrefix}_${performanceMode ? 'perf' : 'full'}`;
    
    // Check cache first
    if (arrowCache.current.has(cacheKey)) {
      return arrowCache.current.get(cacheKey)!;
    }

    const arrows: Array<{
      speed: number;
      u: number;
      v: number;
      lat: number;
      lon: number;
    }> = [];

    // More aggressive filtering to reduce arrow density
    const skipFactor = performanceMode ? 5 : 3; // Show fewer arrows
    let skipCounter = 0;

    currentGridData.forEach(point => {
      // Always skip some arrows for better visual clarity
      skipCounter++;
      if (skipCounter % skipFactor !== 0) return;

      // Find vector matching the timestamp prefix - same logic as original
      const vector = point.vectors.find(v => v.time.startsWith(timestampPrefix));
      
      if (!vector || vector.u == null || vector.v == null) {
        return;
      }
      
      const speed = Math.hypot(vector.u, vector.v);
      if (speed < 0.02) return; // Skip weaker currents than before
      
      arrows.push({
        speed,
        u: vector.u,
        v: vector.v,
        lat: point.lat,
        lon: point.lon
      });
    });

    // Cache the result (limit cache size to prevent memory leaks)
    if (arrowCache.current.size > 15) {
      const firstKey = arrowCache.current.keys().next().value;
      if (firstKey) {
        arrowCache.current.delete(firstKey);
      }
    }
    
    arrowCache.current.set(cacheKey, arrows);
    
    console.log(`🌊 Created ${arrows.length} arrows for time ${timestampPrefix} (perf: ${performanceMode})`);
    return arrows;
  }, [currentGridData, timestampPrefix, baseTime, selectedHour, displayHour, effectiveSelectedHour]);

  // Deck.gl lager enligt specifikationen
  const layers = useMemo(() => {
    const deckLayers = [];

    // Temperatur scatter-plot lager (ersätter heatmap för enkelhet)
    if (activeLayer === 'temperature' && temperatureData.length > 0) {
      const temperatureLayer = new ScatterplotLayer<TemperatureData>({
        id: 'temperature-points',
        data: temperatureData,
        getPosition: (d: TemperatureData) => [d.lon, d.lat],
        getRadius: 800, // Större radie för heatmap-liknande effekt
        getFillColor: (d: TemperatureData) => {
          // Utökad temperatur färgkodning: 0°C = djupblå, 25°C = rött
          const temp = Math.max(0, Math.min(25, d.temperature));
          const ratio = temp / 25;
          
          if (ratio < 0.2) {
            // 0-5°C: Djupblå till blå
            const localRatio = ratio / 0.2;
            return [Math.floor(0 + localRatio * 50), Math.floor(50 + localRatio * 150), 255, 160];
          } else if (ratio < 0.4) {
            // 5-10°C: Blå till cyan
            const localRatio = (ratio - 0.2) / 0.2;
            return [0, Math.floor(200 + localRatio * 55), 255, 160];
          } else if (ratio < 0.6) {
            // 10-15°C: Cyan till grön
            const localRatio = (ratio - 0.4) / 0.2;
            return [0, 255, Math.floor(255 - localRatio * 155), 160];
          } else if (ratio < 0.8) {
            // 15-20°C: Grön till gul
            const localRatio = (ratio - 0.6) / 0.2;
            return [Math.floor(localRatio * 255), 255, Math.floor(100 - localRatio * 100), 160];
          } else {
            // 20-25°C: Gul till rött
            const localRatio = (ratio - 0.8) / 0.2;
            return [255, Math.floor(255 - localRatio * 255), 0, 160];
          }
        },
        pickable: true,
        autoHighlight: true,
        radiusScale: 1,
        radiusMinPixels: 15,
        radiusMaxPixels: 120,
        visible: true
      });
      deckLayers.push(temperatureLayer);
    }

    // Makrill-hotspots med konfidensbaserad visualisering
    if (showMackerelOverlay && mackerelHotspots.length > 0) {
      const mackerelLayer = new ScatterplotLayer<MackerelHotspot>({
        id: 'mackerel-hotspots',
        data: mackerelHotspots,
        getPosition: (d: MackerelHotspot) => [d.lon, d.lat],
        getRadius: (d: MackerelHotspot) => d.suitability * 300 + 100,
        getFillColor: (d: MackerelHotspot): Color => {
          // Färgkodning enligt suitability-algoritmen
          if (d.confidence === 'high') return [0, 255, 0, 200]; // Grön för hög konfidans
          if (d.confidence === 'medium') return [255, 255, 0, 180]; // Gul för medel
          return [255, 165, 0, 160]; // Orange för låg
        },
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

    // Havsströmmar som pilar med IconLayer - Fixed version
    if (showCurrentVectors && currentGridData.length > 0) {
      const arrows = createArrowsData(isDragging);
      
      if (arrows.length > 0) {
        const currentLayer = new IconLayer<typeof arrows[0]>({
          id: 'current-vectors',
          data: arrows,
          getPosition: (d) => [d.lon, d.lat],
          getIcon: () => 'arrow',
          getSize: (d) => {
            // Mindre, mer realistisk storlek
            const baseSize = isDragging ? 15 : 20;
            const calculatedSize = Math.max(baseSize, Math.min(d.speed * 50 + baseSize, 40));
            return calculatedSize;
          },
          getAngle: (d) => {
            // Calculate angle from u,v components - same logic as original CurrentVectorsLayer
            const angle = Math.atan2(d.u, d.v) * (180 / Math.PI);
            return angle;
          },
          getColor: (d) => {
            const opacity = isDragging ? 180 : 255;
            const speed = d.speed;
            if (speed < 0.1) return [0, 150, 255, opacity];   // Klarblå för svag ström
            if (speed < 0.3) return [0, 255, 100, opacity];   // Klargrön för medel
            if (speed < 0.5) return [255, 220, 0, opacity];   // Klargul för stark
            return [255, 50, 0, opacity];                     // Klarröd för mycket stark ström
          },
          iconAtlas: '/images/arrow.png',
          iconMapping: {
            arrow: {
              x: 0,
              y: 0,
              width: 24, // Antar att din arrow.png är ungefär 24x24 pixlar
              height: 24,
              anchorX: 12, // Centrera pilen
              anchorY: 12
            }
          },
          pickable: !isDragging,
          autoHighlight: !isDragging,
          sizeScale: 1,
          sizeMinPixels: 8,
          sizeMaxPixels: 30,
          visible: true,
          updateTriggers: {
            getPosition: [arrows],
            getAngle: [arrows],
            getSize: [arrows],
            getColor: [isDragging]
          }
        });
        deckLayers.push(currentLayer);
      }
    }

    return deckLayers;
  }, [activeLayer, temperatureData, showMackerelOverlay, mackerelHotspots, showCurrentVectors, currentGridData, createArrowsData, isDragging]);

  // Update visibleArrows count separately to avoid circular dependency
  useEffect(() => {
    if (showCurrentVectors && currentGridData.length > 0) {
      const arrows = createArrowsData(isDragging);
      setVisibleArrows(arrows.length);
    } else {
      setVisibleArrows(0);
    }
  }, [showCurrentVectors, currentGridData, createArrowsData, isDragging]);

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

    if (object.speed !== undefined && object.path !== undefined) {
      const direction = Math.atan2(object.u, object.v) * (180 / Math.PI);
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
      
      {/* Dragging indicator - useful for debugging */}
      {isDragging && (
        <div className="absolute top-4 left-4 bg-yellow-500/80 text-black px-2 py-1 rounded text-sm font-medium">
          Performance Mode
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