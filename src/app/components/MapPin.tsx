'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer, Popup } from 'react-map-gl/maplibre';
import { useAreaParameters } from '../context/AreaParametersContext';
import { useTimeSlider } from '../context/TimeSliderContext';
import { getColorForValue } from '../../lib/colormap-utils';

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
  const [popupPosition, setPopupPosition] = useState<{x: number, y: number} | null>(null);

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

  // Beräkna popup position för att hålla den inom skärmen
  const calculatePopupPosition = useCallback((longitude: number, latitude: number) => {
    if (!map) return { longitude, latitude };
    
    const canvas = map.getCanvas();
    const rect = canvas.getBoundingClientRect();
    const point = map.project([longitude, latitude]);
    
    // Popup dimensioner (responsiva) - uppdaterade för kompakt design
    const isSmallScreen = window.innerWidth < 640;
    const popupWidth = isSmallScreen ? 200 : 260;
    const popupHeight = isSmallScreen ? 200 : 250; // Mindre höjd för kompakt design
    const offset = 15; // Mindre offset för kompakt känsla
    
    let adjustedLng = longitude;
    let adjustedLat = latitude;
    
    // Kolla om popupen skulle gå utanför höger kant
    if (point.x + popupWidth + offset > rect.width) {
      const newPoint = map.unproject([Math.max(offset, rect.width - popupWidth - offset), point.y]);
      adjustedLng = newPoint.lng;
    }
    
    // Kolla om popupen skulle gå utanför vänster kant
    if (point.x - popupWidth/2 < offset) {
      const newPoint = map.unproject([popupWidth/2 + offset, point.y]);
      adjustedLng = newPoint.lng;
    }
    
    // Kolla om popupen skulle gå utanför undre kant (nu prioriterat eftersom popup är under pinnen)
    if (point.y + popupHeight + offset > rect.height) {
      const newPoint = map.unproject([point.x, rect.height - popupHeight - offset]);
      adjustedLat = newPoint.lat;
    }
    
    return { longitude: adjustedLng, latitude: adjustedLat };
  }, [map]);

  // Rensa pin när popup stängs
  useEffect(() => {
    if (!showPopup) {
      setPinLocation(null);
      setPinData(null);
    }
  }, [showPopup]);

  // Hantera klick på kartan
  useEffect(() => {
    if (!map || !visible) return;

    const handleMapClick = (e: maplibregl.MapMouseEvent) => {
      // Om popup redan är öppen, stäng den istället för att skapa ny pin
      if (showPopup) {
        setShowPopup(false);
        return;
      }

      const { lngLat } = e;
      const clickedLocation = { lat: lngLat.lat, lon: lngLat.lng };
      
      // Hitta närmaste datapunkt
      const nearestData = findNearestDataPoint(clickedLocation.lat, clickedLocation.lon);
      
      if (nearestData) {
        setPinLocation(clickedLocation);
        setPinData(nearestData);
        setShowPopup(true);
      } else {
        // Visa popup även om det inte finns data
        setPinLocation(clickedLocation);
        setPinData({
          lat: clickedLocation.lat,
          lon: clickedLocation.lon,
          timestamp: targetTimestamp || new Date().toISOString(),
          temperature: undefined,
          salinity: undefined,
          current: undefined
        });
        setShowPopup(true);
      }
    };

    map.on('click', handleMapClick);
    
    return () => {
      map.off('click', handleMapClick);
    };
  }, [map, visible, findNearestDataPoint, showPopup, targetTimestamp]);

  // Hantera klick för att stänga popup (endast för UI-element)
  useEffect(() => {
    if (!showPopup) return;

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Lista över selektorer som INTE ska stänga popupen
      const excludedSelectors = [
        '.marine-popup',
        '.maplibregl-popup',
        '.maplibregl-popup-content',
        '.maplibregl-popup-close-button',
        '.maplibregl-canvas',
        '.maplibregl-canvas-container',
        // UI-element som inte ska stänga popupen
        '.clock-knob',
        '.clock-container',
        '.time-slider',
        '.slider',
        '.sidebar',
        '.layer-toggle',
        '.legend',
        '.controls',
        '.hamburger-menu',
        '.mobile-time-slider',
        '.layer-toggle-controls',
        // Alla element med data-no-close attribut
        '[data-no-close]',
        // Alla knappar och formulärelement
        'button',
        'input',
        'select',
        'textarea',
        'svg',
        // Alla element som är children till UI-komponenter
        '.clock-knob *',
        '.sidebar *',
        '.layer-toggle *',
        '.legend *',
        '.controls *',
        '.hamburger-menu *',
        '.mobile-time-slider *',
        '.layer-toggle-controls *',
        // Specifika komponenter
        '.maplibregl-ctrl',
        '.maplibregl-ctrl *'
      ];
      
      // Kolla om klicket var på eller i någon av de exkluderade elementen
      const isExcluded = excludedSelectors.some(selector => {
        try {
          return target.closest(selector) !== null;
        } catch (e) {
          return false;
        }
      });
      
      if (!isExcluded) {
        setShowPopup(false);
      }
    };

    // Lägg till event listener efter en kort fördröjning
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleGlobalClick);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleGlobalClick);
    };
  }, [showPopup]);

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
              'circle-radius': 25,
              'circle-color': '#3B82F6',
              'circle-opacity': 0.15,
              'circle-stroke-width': 1,
              'circle-stroke-color': '#3B82F6',
              'circle-stroke-opacity': 0.3
            }}
          />
          
          {/* Inner pulse animation */}
          <Layer
            id="pin-inner-pulse"
            type="circle"
            paint={{
              'circle-radius': 15,
              'circle-color': '#3B82F6',
              'circle-opacity': 0.25,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#3B82F6',
              'circle-stroke-opacity': 0.5
            }}
          />
          
          {/* Main pin circle */}
          <Layer
            id="pin-main"
            type="circle"
            paint={{
              'circle-radius': 8,
              'circle-color': '#3B82F6',
              'circle-stroke-width': 3,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 0.95
            }}
          />
          
          {/* Inner dot */}
          <Layer
            id="pin-center"
            type="circle"
            paint={{
              'circle-radius': 3,
              'circle-color': '#ffffff',
              'circle-opacity': 0.9
            }}
          />
        </Source>
      )}

      {/* Glasdesign popup med parametrar */}
      {showPopup && pinLocation && pinData && (
        <Popup
          longitude={calculatePopupPosition(pinLocation.lon, pinLocation.lat).longitude}
          latitude={calculatePopupPosition(pinLocation.lon, pinLocation.lat).latitude}
          onClose={() => setShowPopup(false)}
          closeButton={true}
          closeOnClick={false}
          anchor="top"
          offset={[0, 15]}
          className="marine-popup"
        >
          <div 
            className="
              backdrop-blur-md
              rounded-xl shadow-2xl 
              min-w-[220px] sm:min-w-[240px] 
              max-w-[88vw] sm:max-w-[260px]
              p-3 sm:p-3
              text-white
            "
            data-no-close="true"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Kompakt header med Apple-design */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-pulse shadow-lg"></div>
              <h3 className="text-base font-semibold text-white">Marina Data</h3>
            </div>
            
            {/* Kompakt parametrars sektion med Apple-stil */}
            <div className="space-y-2">
              {/* Position och tid - Apple-stil */}
              <div className="glass-card-apple p-2.5 text-sm">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-white/70 font-medium">Position:</span>
                  <span className="font-mono text-white/90 font-semibold">
                    {pinData.lat.toFixed(3)}, {pinData.lon.toFixed(3)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/70 font-medium">Tid:</span>
                  <span className="text-white/90 font-semibold">
                    {new Date(pinData.timestamp).toLocaleString('sv-SE', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              </div>
              
              {/* Temperatur med Apple-design */}
              {pinData.temperature !== undefined && pinData.temperature !== null && (
                <div className="glass-card-apple p-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center shadow-lg">
                        <span className="text-white text-sm">🌡️</span>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">Temperatur</div>
                        <div className="text-xs text-white/60">Vattentemperatur</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div 
                        className="text-xl font-bold"
                        style={{ color: getColorForValue('temperature', pinData.temperature) }}
                      >
                        {pinData.temperature.toFixed(1)}°C
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Salthalt med Apple-design */}
              {pinData.salinity !== undefined && pinData.salinity !== null && (
                <div className="glass-card-apple p-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-lg">
                        <span className="text-white text-sm">🧂</span>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">Salthalt</div>
                        <div className="text-xs text-white/60">Saltkoncentration</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div 
                        className="text-xl font-bold"
                        style={{ color: getColorForValue('salinity', pinData.salinity) }}
                      >
                        {pinData.salinity.toFixed(1)} PSU
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Ström med Apple-design */}
              {pinData.current && pinData.current.u !== undefined && pinData.current.v !== undefined && 
               pinData.current.u !== null && pinData.current.v !== null && (
                <div className="space-y-2">
                  <div className="glass-card-apple p-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
                          <span className="text-white text-sm">🌊</span>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-white">Strömstyrka</div>
                          <div className="text-xs text-white/60">Hastighet</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div 
                          className="text-xl font-bold"
                          style={{ color: getColorForValue('current', Math.hypot(pinData.current.u, pinData.current.v)) }}
                        >
                          {Math.hypot(pinData.current.u, pinData.current.v).toFixed(2)} m/s
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="glass-card-apple p-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-indigo-600 rounded-full flex items-center justify-center shadow-lg">
                          <span className="text-white text-sm">🧭</span>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-white">Strömriktning</div>
                          <div className="text-xs text-white/60">Kompassriktning</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-indigo-300">
                          {((Math.atan2(pinData.current.v, pinData.current.u) * 180 / Math.PI + 360) % 360).toFixed(0)}°
                        </div>
                        <div className="text-sm text-white/70 font-medium">
                          {getCompassDirection(Math.atan2(pinData.current.v, pinData.current.u) * 180 / Math.PI)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Visa meddelande om ingen data finns */}
              {(!pinData.temperature && !pinData.salinity && !pinData.current) && (
                <div className="glass-card-apple p-3 text-center">
                  <div className="text-white/80 font-medium">
                    Ingen data tillgänglig för denna position
                  </div>
                </div>
              )}
            </div>
          </div>
        </Popup>
      )}
    </>
  );
};

export default MapPin; 