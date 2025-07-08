'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer, Popup } from 'react-map-gl/maplibre';
import { useAreaParameters } from '../context/AreaParametersContext';
import { useTimeSlider } from '../context/TimeSliderContext';

interface PinData {
  lat: number;
  lon: number;
  timestamp: string;
  temperature?: number;
  salinity?: number;
  current?: { u: number; v: number };
}

interface MapPinProps {
  visible?: boolean;
}

// Hjälpfunktion för att beräkna avstånd mellan två punkter
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Hjälpfunktion för att konvertera grader till kompassriktning
function getCompassDirection(degrees: number): string {
  const normalizedDegrees = ((degrees % 360) + 360) % 360;
  
  const directions = [
    { name: 'N', min: 0, max: 11.25 },
    { name: 'NNÖ', min: 11.25, max: 33.75 },
    { name: 'NÖ', min: 33.75, max: 56.25 },
    { name: 'ÖNÖ', min: 56.25, max: 78.75 },
    { name: 'Ö', min: 78.75, max: 101.25 },
    { name: 'ÖSÖ', min: 101.25, max: 123.75 },
    { name: 'SÖ', min: 123.75, max: 146.25 },
    { name: 'SSÖ', min: 146.25, max: 168.75 },
    { name: 'S', min: 168.75, max: 191.25 },
    { name: 'SSV', min: 191.25, max: 213.75 },
    { name: 'SV', min: 213.75, max: 236.25 },
    { name: 'VSV', min: 236.25, max: 258.75 },
    { name: 'V', min: 258.75, max: 281.25 },
    { name: 'VNV', min: 281.25, max: 303.75 },
    { name: 'NV', min: 303.75, max: 326.25 },
    { name: 'NNV', min: 326.25, max: 348.75 },
    { name: 'N', min: 348.75, max: 360 }
  ];
  
  for (const direction of directions) {
    if (normalizedDegrees >= direction.min && normalizedDegrees < direction.max) {
      return direction.name;
    }
  }
  
  return 'N'; // Fallback
}

const MapPin: React.FC<MapPinProps> = ({ visible = true }) => {
  const { current: map } = useMap();
  const { data: areaData } = useAreaParameters();
  const { selectedHour, baseTime } = useTimeSlider();
  
  const [pinLocation, setPinLocation] = useState<{lat: number, lon: number} | null>(null);
  const [pinData, setPinData] = useState<PinData | null>(null);
  const [showPopup, setShowPopup] = useState(false);

  // Beräkna aktuell tidsstämpel
  const targetTimestamp = useMemo(() => {
    if (!baseTime || !areaData?.metadata?.timestamps) return '';
    
    const targetTime = new Date(baseTime + selectedHour * 3600_000);
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
  }, [selectedHour, baseTime, areaData?.metadata?.timestamps]);

  // Hitta närmaste datapunkt och extrahera parametrar
  const findNearestDataPoint = useCallback((lat: number, lon: number): PinData | null => {
    if (!areaData?.points || !targetTimestamp) return null;

    let nearestPoint = null;
    let minDistance = Infinity;

    for (const point of areaData.points) {
      const distance = calculateDistance(lat, lon, point.lat, point.lon);
      if (distance < minDistance) {
        minDistance = distance;
        nearestPoint = point;
      }
    }

    if (!nearestPoint) return null;

    // Hitta data för aktuell tidsstämpel
    const timeData = nearestPoint.data.find(d => d.time === targetTimestamp);
    if (!timeData) return null;

    return {
      lat: nearestPoint.lat,
      lon: nearestPoint.lon,
      timestamp: targetTimestamp,
      temperature: timeData.temperature,
      salinity: timeData.salinity,
      current: timeData.current
    };
  }, [areaData, targetTimestamp]);

  // Hantera klick på kartan
  useEffect(() => {
    if (!map || !visible) return;

    const handleMapClick = (e: maplibregl.MapMouseEvent) => {
      const { lngLat } = e;
      const clickedLocation = { lat: lngLat.lat, lon: lngLat.lng };
      
      // Hitta närmaste datapunkt
      const nearestData = findNearestDataPoint(clickedLocation.lat, clickedLocation.lon);
      
      if (nearestData) {
        setPinLocation(clickedLocation);
        setPinData(nearestData);
        setShowPopup(true);
      }
    };

    map.on('click', handleMapClick);
    
    return () => {
      map.off('click', handleMapClick);
    };
  }, [map, visible, findNearestDataPoint]);

  // Uppdatera pin data när tiden ändras
  useEffect(() => {
    if (pinLocation && areaData) {
      const updatedData = findNearestDataPoint(pinLocation.lat, pinLocation.lon);
      if (updatedData) {
        setPinData(updatedData);
      }
    }
  }, [pinLocation, targetTimestamp, findNearestDataPoint, areaData]);

  // Skapa GeoJSON för pin
  const pinGeoJSON = useMemo(() => {
    if (!pinLocation) return null;

    return {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [pinLocation.lon, pinLocation.lat]
        },
        properties: {}
      }]
    };
  }, [pinLocation]);

  if (!visible) return null;

  return (
    <>
      {/* Pin marker */}
      {pinGeoJSON && (
        <Source id="map-pin" type="geojson" data={pinGeoJSON}>
          {/* Outer pulse animation */}
          <Layer
            id="pin-outer-pulse"
            type="circle"
            paint={{
              'circle-radius': 30,
              'circle-color': '#ff4444',
              'circle-opacity': 0.1,
              'circle-stroke-width': 1,
              'circle-stroke-color': '#ff4444',
              'circle-stroke-opacity': 0.2
            }}
          />
          
          {/* Inner pulse animation */}
          <Layer
            id="pin-inner-pulse"
            type="circle"
            paint={{
              'circle-radius': 20,
              'circle-color': '#ff4444',
              'circle-opacity': 0.2,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ff4444',
              'circle-stroke-opacity': 0.4
            }}
          />
          
          {/* Main pin circle */}
          <Layer
            id="pin-main"
            type="circle"
            paint={{
              'circle-radius': 10,
              'circle-color': '#ff4444',
              'circle-stroke-width': 4,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 0.95
            }}
          />
          
          {/* Inner dot */}
          <Layer
            id="pin-center"
            type="circle"
            paint={{
              'circle-radius': 4,
              'circle-color': '#ffffff',
              'circle-opacity': 0.9
            }}
          />
        </Source>
      )}

      {/* Popup med parametrar */}
      {showPopup && pinLocation && pinData && (
        <Popup
          longitude={pinLocation.lon}
          latitude={pinLocation.lat}
          onClose={() => setShowPopup(false)}
          closeButton={true}
          closeOnClick={false}
          offset={[0, -10]}
          className="pin-popup"
        >
          <div className="p-4 min-w-[280px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                Marin Data
              </h3>
              <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                Live
              </div>
            </div>
            
            <div className="space-y-3">
              {/* Koordinater och tid */}
              <div className="bg-gray-50 p-3 rounded-lg space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Position</span>
                  <span className="text-sm font-mono text-gray-700">
                    {pinData.lat.toFixed(4)}, {pinData.lon.toFixed(4)}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Tid</span>
                  <span className="text-sm text-gray-700">
                    {new Date(pinData.timestamp).toLocaleString('sv-SE', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              </div>
              
              {/* Parametrar */}
              <div className="space-y-3">
                {pinData.temperature !== undefined && (
                  <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm">🌡️</span>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-800">Temperatur</div>
                        <div className="text-xs text-gray-600">Vattentemperatur</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-blue-600">
                        {pinData.temperature.toFixed(1)}°
                      </div>
                      <div className="text-xs text-gray-500">Celsius</div>
                    </div>
                  </div>
                )}
                
                {pinData.salinity !== undefined && (
                  <div className="flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-green-100 rounded-lg border border-green-200">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm">🧂</span>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-800">Salthalt</div>
                        <div className="text-xs text-gray-600">Saltkoncentration</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-green-600">
                        {pinData.salinity.toFixed(1)}
                      </div>
                      <div className="text-xs text-gray-500">PSU</div>
                    </div>
                  </div>
                )}
                
                {pinData.current && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg border border-purple-200">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-sm">🌊</span>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-800">Strömstyrka</div>
                          <div className="text-xs text-gray-600">Hastighet</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-purple-600">
                          {Math.hypot(pinData.current.u, pinData.current.v).toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500">m/s</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-gradient-to-r from-indigo-50 to-indigo-100 rounded-lg border border-indigo-200">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-sm">🧭</span>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-800">Strömriktning</div>
                          <div className="text-xs text-gray-600">Kompassriktning</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-indigo-600">
                          {((Math.atan2(pinData.current.v, pinData.current.u) * 180 / Math.PI + 360) % 360).toFixed(0)}°
                        </div>
                        <div className="text-xs text-gray-500">
                          {getCompassDirection(Math.atan2(pinData.current.v, pinData.current.u) * 180 / Math.PI)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Popup>
      )}
    </>
  );
};

export default MapPin; 