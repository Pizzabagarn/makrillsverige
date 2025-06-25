'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';
import Map, { MapRef } from 'react-map-gl/maplibre';
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

export default function MapLibreMap({
  activeLayer,
  activeDepth,
  showMackerelOverlay,
  showCurrentVectors,
  showWindVectors,
  mackerelThreshold
}: MapLibreMapProps) {
  const mapRef = useRef<MapRef>(null);
  const { selectedHour, baseTime } = useTimeSlider();
  
  // Data states enligt specifikationen
  const [temperatureData, setTemperatureData] = useState<TemperatureData[]>([]);
  const [mackerelHotspots, setMackerelHotspots] = useState<MackerelHotspot[]>([]);
  const [currentGridData, setCurrentGridData] = useState<GridPoint[]>([]);
  const [visibleArrows, setVisibleArrows] = useState(0);
  const [loading, setLoading] = useState(false);

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

    // Havsströmmar som pilar med PathLayer (enklare och mer tillförlitlig)
    if (showCurrentVectors && currentGridData.length > 0) {
      // Skapa pildata för EXAKT tid från TimeSlider
      const currentTimeMs = baseTime + selectedHour * 3600 * 1000;
      const currentTime = new Date(currentTimeMs).toISOString();
      
      console.log(`🌊 Updating vectors for time: ${currentTime} (selectedHour: ${selectedHour})`);
      
      const arrows: Array<{
        path: [number, number][];
        speed: number;
        u: number;
        v: number;
        lat: number;
        lon: number;
      }> = [];
      
      currentGridData.forEach(point => {
        // Hitta närmaste vector baserat på tid (mer flexibel matching)
        const vector = point.vectors.find(v => {
          const vectorTime = new Date(v.time).getTime();
          const timeDiff = Math.abs(vectorTime - currentTimeMs);
          return timeDiff < 1800000; // Inom 30 minuter = match
        });
        
        if (!vector || vector.u == null || vector.v == null) {
          // DEBUG: Logga varför vector inte hittas
          if (point === currentGridData[0]) { // Bara logga för första punkten
            console.log(`❌ No vector found for time ${currentTime}`);
            console.log(`Available times in first point:`, point.vectors.slice(0, 3).map(v => v.time));
          }
          return;
        }
        
        const speed = Math.hypot(vector.u, vector.v);
        if (speed < 0.01) return; // Skippa mycket svaga strömmar
        
        // Beräkna pilens riktning (radianer)
        const angle = Math.atan2(vector.u, vector.v);
        
        // Skapa en större, mer synlig pil
        const length = Math.min(speed * 0.02 + 0.008, 0.015); // Större baslängd
        const endLon = point.lon + Math.sin(angle) * length;
        const endLat = point.lat + Math.cos(angle) * length;
        
        // Större pilspets för bättre synlighet
        const arrowAngle = 0.6; // 35 grader - bredare pilspets
        const arrowLength = length * 0.4; // Längre pilspets
        const leftArrowLon = endLon - Math.sin(angle - arrowAngle) * arrowLength;
        const leftArrowLat = endLat - Math.cos(angle - arrowAngle) * arrowLength;
        const rightArrowLon = endLon - Math.sin(angle + arrowAngle) * arrowLength;
        const rightArrowLat = endLat - Math.cos(angle + arrowAngle) * arrowLength;
        
        arrows.push({
          path: [
            [point.lon, point.lat],
            [endLon, endLat],
            [leftArrowLon, leftArrowLat],
            [endLon, endLat],
            [rightArrowLon, rightArrowLat]
          ],
          speed,
          u: vector.u,
          v: vector.v,
          lat: point.lat,
          lon: point.lon
        });
      });
      
      console.log(`🏹 Rendered ${arrows.length} arrows from ${currentGridData.length} grid points`);
      setVisibleArrows(arrows.length);
      
      const currentLayer = new PathLayer<typeof arrows[0]>({
        id: 'current-vectors',
        data: arrows,
        getPath: (d) => d.path,
        getWidth: (d) => Math.max(3, d.speed * 100 + 2),
        getColor: (d) => {
          // Starkare färger med bättre kontrast
          const speed = d.speed;
          if (speed < 0.1) return [0, 150, 255, 255];   // Klarblå för svag ström
          if (speed < 0.3) return [0, 255, 100, 255];   // Klargrön för medel
          if (speed < 0.5) return [255, 220, 0, 255];   // Klargul för stark
          return [255, 50, 0, 255];                     // Klarröd för mycket stark ström
        },
        pickable: true,
        autoHighlight: true,
        widthScale: 1,
        widthMinPixels: 2,
        widthMaxPixels: 15,
        visible: true
      });
      deckLayers.push(currentLayer);
    }

    return deckLayers;
  }, [activeLayer, temperatureData, showMackerelOverlay, mackerelHotspots, showCurrentVectors, currentGridData, baseTime, selectedHour]);

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
        <Map
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
            <div><strong>Strömtid:</strong> {new Date(baseTime + selectedHour * 3600 * 1000).toLocaleString('sv-SE').slice(0, 16)}</div>
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