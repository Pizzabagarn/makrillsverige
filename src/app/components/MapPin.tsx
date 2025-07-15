'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { Source, Layer, Popup } from 'react-map-gl/maplibre';
import { useAreaParameters } from '../context/AreaParametersContext';
import { useTimeSlider } from '../context/TimeSliderContext';
import { getColorForValue } from '../../lib/colormap-utils';

// Cache för makrill-värden
const mackerelValuesCache = new Map<string, any>();

// Cache för vattenmask
let waterMaskCache: any = null;

// Hjälpfunktion för att ladda vattenmask
async function loadWaterMask(): Promise<any> {
  if (waterMaskCache) {
    return waterMaskCache;
  }
  
  try {
    const response = await fetch('/data/scandinavian-waters.geojson');
    if (!response.ok) {
      console.warn('⚠️ Kunde inte ladda vattenmask');
      return null;
    }
    
    waterMaskCache = await response.json();
    return waterMaskCache;
  } catch (error) {
    console.warn('⚠️ Fel vid laddning av vattenmask:', error);
    return null;
  }
}

// Hjälpfunktion för att kontrollera om punkt är i vatten
function isPointInWater(lat: number, lon: number, waterMask: any): boolean {
  if (!waterMask || !waterMask.features) return true; // Fallback: visa data om ingen vattenmask
  
  const point = [lon, lat]; // GeoJSON använder [lon, lat]
  
  for (const feature of waterMask.features) {
    if (feature.geometry.type === 'Polygon') {
      // Polygon har en yttre ring [0] och potentiellt inre ringar (hål)
      if (pointInPolygon(point as [number, number], feature.geometry.coordinates[0])) {
        return true;
      }
    } else if (feature.geometry.type === 'MultiPolygon') {
      for (const polygonCoords of feature.geometry.coordinates) {
        // Varje polygon i MultiPolygon har samma struktur som Polygon
        if (pointInPolygon(point as [number, number], polygonCoords[0])) {
          return true;
        }
      }
    }
  }
  
  return false;
}

// Enkel punkt-i-polygon algoritm
function pointInPolygon(point: [number, number], polygon: any[]): boolean {
  const [x, y] = point;
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const coords = polygon[i];
    const nextCoords = polygon[j];
    
    if (coords.length >= 2 && nextCoords.length >= 2) {
      const [xi, yi] = coords;
      const [xj, yj] = nextCoords;
      
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
  }
  
  return inside;
}

// Hjälpfunktion för att ladda makrill-värden via API (hanterar .gz filer)
async function loadMackerelValues(timestamp: string): Promise<any> {
  const cacheKey = timestamp;
  
  // Kolla cache först
  if (mackerelValuesCache.has(cacheKey)) {
    return mackerelValuesCache.get(cacheKey);
  }
  
  try {
    // Använd API-route som hanterar dekomprimering på servern
    const response = await fetch(`/api/mackerel-values/${encodeURIComponent(timestamp)}`);
    
    if (!response.ok) {
      console.warn(`⚠️ Kunde inte ladda makrill-värden för ${timestamp}`);
      return null;
    }
    
    const data = await response.json();
    
    // Spara i cache
    mackerelValuesCache.set(cacheKey, data);
    
    return data;
  } catch (error) {
    console.warn(`⚠️ Fel vid laddning av makrill-värden för ${timestamp}:`, error);
    return null;
  }
}

// Hjälpfunktion för att hitta närmaste makrill-värde
function findNearestMackerelValue(lat: number, lon: number, mackerelData: any): number | undefined {
  if (!mackerelData?.values) return undefined;
  
  let nearestValue = undefined;
  let minDistance = Infinity;
  
  for (const point of mackerelData.values) {
    const distance = Math.sqrt(
      Math.pow(lat - point.lat, 2) + Math.pow(lon - point.lon, 2)
    );
    
    if (distance < minDistance) {
      minDistance = distance;
      nearestValue = point.value;
    }
  }
  
  return nearestValue;
}

// Hjälpfunktion för att konvertera makrill-procent till beskrivande text
function getMackerelDescription(probability: number): string {
  if (probability >= 90) return 'Exceptionell chans';
  if (probability >= 75) return 'Hotspot';
  if (probability >= 50) return 'Bra chans';
  if (probability >= 25) return 'Måttlig chans';
  if (probability >= 10) return 'Låg chans';
  if (probability > 0) return 'Minimal chans';
  return 'Ingen chans';
}

interface PinData {
  lat: number;
  lon: number;
  timestamp: string;
  temperature?: number;
  salinity?: number;
  current?: { u: number; v: number };
  mackerel?: number; // Makrill-sannolikhet i procent
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
  const findNearestDataPoint = useCallback(async (lat: number, lon: number): Promise<PinData | null> => {
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

    // Ladda vattenmask och kontrollera om punkt är i vatten
    const waterMask = await loadWaterMask();
    const isInWater = isPointInWater(lat, lon, waterMask);

    // Ladda makrill-data endast om punkt är i vatten
    let mackerelValue: number | undefined = undefined;
    if (isInWater) {
      const mackerelData = await loadMackerelValues(targetTimestamp);
      const rawMackerelValue = mackerelData ? 
        findNearestMackerelValue(lat, lon, mackerelData) : 
        undefined;
      
      // Filtrera bort negativa värden
      if (rawMackerelValue !== undefined && rawMackerelValue >= 0) {
        mackerelValue = rawMackerelValue;
      }
    }

    return {
      lat: nearestPoint.lat,
      lon: nearestPoint.lon,
      timestamp: targetTimestamp,
      temperature: timeData.temperature,
      salinity: timeData.salinity,
      current: timeData.current,
      mackerel: mackerelValue
    };
  }, [areaData, targetTimestamp]);

  // Lokal interpolation för mjukare övergångar
  const findInterpolatedDataPoint = useCallback(async (lat: number, lon: number): Promise<PinData | null> => {
    if (!areaData?.points || !targetTimestamp) return null;

    // Hitta punkter inom en radie (ca 10km)
    const radius = 0.1; // ~11km radie
    const nearbyPoints: Array<{
      lat: number;
      lon: number;
      distance: number;
      data: any;
    }> = [];

    for (const point of areaData.points) {
      const distance = calculateDistance(lat, lon, point.lat, point.lon);
      if (distance <= radius) {
        const timeData = point.data.find(d => d.time === targetTimestamp);
        if (timeData) {
          nearbyPoints.push({
            lat: point.lat,
            lon: point.lon,
            distance,
            data: timeData
          });
        }
      }
    }

    if (nearbyPoints.length === 0) {
      // Fallback till närmaste punkt
      return await findNearestDataPoint(lat, lon);
    }

    // Ladda vattenmask och kontrollera om punkt är i vatten
    const waterMask = await loadWaterMask();
    const isInWater = isPointInWater(lat, lon, waterMask);

    // Ladda makrill-data endast om punkt är i vatten
    let mackerelValue: number | undefined = undefined;
    if (isInWater) {
      const mackerelData = await loadMackerelValues(targetTimestamp);
      const rawMackerelValue = mackerelData ? 
        findNearestMackerelValue(lat, lon, mackerelData) : 
        undefined;
      
      // Filtrera bort negativa värden
      if (rawMackerelValue !== undefined && rawMackerelValue >= 0) {
        mackerelValue = rawMackerelValue;
      }
    }

    if (nearbyPoints.length === 1) {
      // Bara en punkt - använd den
      const point = nearbyPoints[0];

      return {
        lat: point.lat,
        lon: point.lon,
        timestamp: targetTimestamp,
        temperature: point.data.temperature,
        salinity: point.data.salinity,
        current: point.data.current,
        mackerel: mackerelValue
      };
    }

    // Interpolera med viktad medelvärde baserat på avstånd
    const interpolateParameter = (paramName: string) => {
      const validPoints = nearbyPoints.filter(p => 
        p.data[paramName] !== undefined && p.data[paramName] !== null
      );

      if (validPoints.length === 0) return undefined;
      if (validPoints.length === 1) return validPoints[0].data[paramName];

      // Beräkna vikter (närmare = högre vikt)
      const weights = validPoints.map(p => 1 / (p.distance + 0.001)); // +0.001 för att undvika division med 0
      const weightSum = weights.reduce((a, b) => a + b, 0);

      // Viktad interpolation
      if (paramName === 'current') {
        let weightedU = 0;
        let weightedV = 0;
        
        for (let i = 0; i < validPoints.length; i++) {
          const current = validPoints[i].data.current;
          if (current && current.u !== undefined && current.v !== undefined) {
            const weight = weights[i] / weightSum;
            weightedU += current.u * weight;
            weightedV += current.v * weight;
          }
        }
        
        return { u: weightedU, v: weightedV };
      } else {
        // För temperature och salinity
        let weightedSum = 0;
        
        for (let i = 0; i < validPoints.length; i++) {
          const weight = weights[i] / weightSum;
          weightedSum += validPoints[i].data[paramName] * weight;
        }
        
        return weightedSum;
      }
    };

    return {
      lat,
      lon,
      timestamp: targetTimestamp,
      temperature: interpolateParameter('temperature'),
      salinity: interpolateParameter('salinity'),
      current: interpolateParameter('current'),
      mackerel: mackerelValue // Använd redan beräknat mackerelValue
    };
  }, [areaData, targetTimestamp, findNearestDataPoint]);

  // Smart popup positionering som alltid håller popupen synlig
  const calculatePopupPosition = useCallback((longitude: number, latitude: number) => {
    if (!map) return { longitude, latitude, anchor: 'top', offset: [0, 15] };
    
    const canvas = map.getCanvas();
    const rect = canvas.getBoundingClientRect();
    const point = map.project([longitude, latitude]);
    
    // Responsiva popup-dimensioner som matchar CSS
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    let popupWidth, popupHeight, baseOffset;
    
    if (screenWidth < 480) {
      // Tiny mobile screens
      popupWidth = 200;
      popupHeight = 200; // Increased from 180 to show more content
      baseOffset = 12;
    } else if (screenWidth < 640) {
      // Small mobile screens  
      popupWidth = 220;
      popupHeight = 220; // Increased from 200 to show more content
      baseOffset = 15;
    } else if (screenWidth < 1024) {
      // Tablet screens
      popupWidth = 260;
      popupHeight = 260; // Increased from 240 to show more content
      baseOffset = 18;
    } else {
      // Desktop screens
      popupWidth = 280;
      popupHeight = 280; // Increased from 260 to show more content
      baseOffset = 20;
    }
    
    // UI-element dimensioner (clock knob etc.)
    const clockKnobHeight = screenWidth < 640 ? 120 : 150;
    const sidebarWidth = screenWidth < 640 ? 0 : 300;
    const safeMargin = 20;
    
    // Beräkna tillgängligt utrymme i alla riktningar
    const spaceTop = point.y - safeMargin;
    const spaceBottom = screenHeight - point.y - clockKnobHeight - safeMargin;
    const spaceLeft = point.x - sidebarWidth - safeMargin;
    const spaceRight = screenWidth - point.x - safeMargin;
    
    let anchor = 'top';
    let offset = [0, baseOffset];
    let adjustedLng = longitude;
    let adjustedLat = latitude;
    
    // Vertical positioning - prioritera under pinnen
    if (spaceBottom >= popupHeight) {
      // Tillräckligt utrymme under - placera under pinnen
      anchor = 'top';
      offset = [0, baseOffset];
    } else if (spaceTop >= popupHeight) {
      // Inte tillräckligt utrymme under men tillräckligt ovan - placera ovan
      anchor = 'bottom';
      offset = [0, -baseOffset];
    } else {
      // Inte tillräckligt utrymme i någon riktning - anpassa positionen
      if (spaceBottom > spaceTop) {
        // Mer utrymme under - placera under men justera position
        anchor = 'top';
        offset = [0, baseOffset];
        if (spaceBottom < popupHeight) {
          // Flytta pinnen uppåt så popupen får plats
          const needsToMove = popupHeight - spaceBottom;
          const newY = point.y - needsToMove;
          const newPoint = map.unproject([point.x, newY]);
          adjustedLat = newPoint.lat;
        }
      } else {
        // Mer utrymme ovan - placera ovan men justera position
        anchor = 'bottom';
        offset = [0, -baseOffset];
        if (spaceTop < popupHeight) {
          // Flytta pinnen nedåt så popupen får plats
          const needsToMove = popupHeight - spaceTop;
          const newY = point.y + needsToMove;
          const newPoint = map.unproject([point.x, newY]);
          adjustedLat = newPoint.lat;
        }
      }
    }
    
    // Horizontal positioning - använd canvas-dimensioner istället för screen
    const canvasWidth = rect.width;
    const canvasHeight = rect.height;
    
    // Beräkna popup-position vid default centrering (relativt till canvas)
    const popupLeftEdge = point.x - (popupWidth / 2);
    const popupRightEdge = point.x + (popupWidth / 2);
    
    let horizontalOffset = 0;
    
    // Kontrollera vänster kant (ta hänsyn till sidebar bara på desktop)
    const leftBoundary = screenWidth >= 640 ? sidebarWidth + safeMargin : safeMargin;
    
    if (popupLeftEdge < leftBoundary) {
      // Flytta popupen åt höger
      horizontalOffset = leftBoundary - popupLeftEdge;
    }
    // Kontrollera höger kant (använd canvas-bredd)
    else if (popupRightEdge > canvasWidth - safeMargin) {
      // Flytta popupen åt vänster
      horizontalOffset = (canvasWidth - safeMargin) - popupRightEdge;
    }
    
    // Ytterligare säkerhetskontroll - se till att popupen inte går utanför efter justering
    const adjustedLeft = point.x + horizontalOffset - (popupWidth / 2);
    const adjustedRight = point.x + horizontalOffset + (popupWidth / 2);
    
    // Om den fortfarande skulle gå utanför, flytta pinnen själv
    if (adjustedLeft < leftBoundary || adjustedRight > canvasWidth - safeMargin) {
      // Flytta pinnen till en säker position
      let safeX = point.x;
      
      if (adjustedLeft < leftBoundary) {
        safeX = leftBoundary + (popupWidth / 2);
      } else if (adjustedRight > canvasWidth - safeMargin) {
        safeX = canvasWidth - safeMargin - (popupWidth / 2);
      }
      
      // Omvandla tillbaka till lng/lat
      const safePoint = map.unproject([safeX, point.y]);
      adjustedLng = safePoint.lng;
      
      // Nollställ horizontal offset eftersom vi flyttat pinnen
      horizontalOffset = 0;
    }
    
    // Uppdatera offset med horizontal justering
    offset = [horizontalOffset, offset[1]];
    
    // Om vi fortfarande inte har tillräckligt utrymme, använd center anchor
    if (spaceTop < popupHeight && spaceBottom < popupHeight) {
      anchor = 'center';
      offset = [horizontalOffset, 0];
    }
    
    return { 
      longitude: adjustedLng, 
      latitude: adjustedLat, 
      anchor, 
      offset 
    };
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

    const handleMapClick = async (e: maplibregl.MapMouseEvent) => {
      // Om popup redan är öppen, stäng den istället för att skapa ny pin
      if (showPopup) {
        setShowPopup(false);
        return;
      }

      const { lngLat } = e;
      const clickedLocation = { lat: lngLat.lat, lon: lngLat.lng };
      
      // Hitta interpolerade datapunkt (med fallback till närmaste)
      const nearestData = await findInterpolatedDataPoint(clickedLocation.lat, clickedLocation.lon);
      
      if (nearestData) {
        setPinLocation(clickedLocation);
        setPinData(nearestData);
        setShowPopup(true);
      } else {
        // Visa popup även om det inte finns data - försök med närmaste punkt som fallback
        const fallbackData = await findNearestDataPoint(clickedLocation.lat, clickedLocation.lon);
        
        setPinLocation(clickedLocation);
        setPinData(fallbackData || {
          lat: clickedLocation.lat,
          lon: clickedLocation.lon,
          timestamp: targetTimestamp || new Date().toISOString(),
          temperature: undefined,
          salinity: undefined,
          current: undefined,
          mackerel: undefined
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
      const updatePinData = async () => {
        const updatedData = await findInterpolatedDataPoint(pinLocation.lat, pinLocation.lon);
        if (updatedData) {
          setPinData(updatedData);
        }
      };
      updatePinData();
    }
  }, [pinLocation, targetTimestamp, findInterpolatedDataPoint, areaData]);

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
      {showPopup && pinLocation && pinData && (() => {
        const popupPos = calculatePopupPosition(pinLocation.lon, pinLocation.lat);
        return (
          <Popup
            longitude={popupPos.longitude}
            latitude={popupPos.latitude}
            onClose={() => setShowPopup(false)}
            closeButton={true}
            closeOnClick={false}
            anchor={popupPos.anchor as any}
            offset={popupPos.offset as [number, number]}
            className="marine-popup"
          >
          <div 
            className="
              backdrop-blur-md
              rounded-xl shadow-2xl 
              p-1.5 xs:p-1.5 sm:p-2 lg:p-2.5
              text-white text-xs xs:text-xs sm:text-sm lg:text-sm
            "
            data-no-close="true"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Kompakt header med Apple-design */}
            <div className="flex items-center gap-1 mb-1 xs:mb-1 sm:mb-1.5">
              <div className="w-1.5 h-1.5 xs:w-1.5 xs:h-1.5 sm:w-2 sm:h-2 bg-blue-400 rounded-full animate-pulse shadow-lg"></div>
              <h3 className="text-xs xs:text-xs sm:text-sm font-semibold text-white">Marina Data</h3>
            </div>
            
            {/* Kompakt parametrars sektion med Apple-stil */}
            <div className="space-y-1 xs:space-y-1 sm:space-y-1.5">
              {/* Position och tid - Apple-stil */}
              <div className="glass-card-apple p-1 xs:p-1 sm:p-1.5 text-xs xs:text-xs sm:text-sm">
                                  <div className="flex justify-between items-center mb-0.5 xs:mb-0.5 sm:mb-1">
                    <span className="text-white/70 font-medium text-xs xs:text-xs sm:text-sm">Position:</span>
                    <span className="font-mono text-white/90 font-semibold text-xs xs:text-xs sm:text-sm">
                      {pinData.lat.toFixed(2)}, {pinData.lon.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/70 font-medium text-xs xs:text-xs sm:text-sm">Tid:</span>
                    <span className="text-white/90 font-semibold text-xs xs:text-xs sm:text-sm">
                    {new Date(pinData.timestamp).toLocaleString('sv-SE', {
                      day: 'numeric',
                      month: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }).replace(/\s/, ' ')}
                  </span>
                </div>
              </div>
              
              {/* Temperatur med Apple-design */}
              {pinData.temperature !== undefined && pinData.temperature !== null && (
                <div className="glass-card-apple p-1 xs:p-1 sm:p-1.5">
                                      <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 xs:gap-1 sm:gap-2">
                        <div className="w-4 h-4 xs:w-4 xs:h-4 sm:w-5 sm:h-5 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center shadow-lg">
                          <span className="text-white text-xs xs:text-xs sm:text-xs">🌡️</span>
                        </div>
                        <div>
                          <div className="text-xs xs:text-xs sm:text-sm font-semibold text-white">Temperatur</div>
                          <div className="text-xs xs:text-xs sm:text-xs text-white/60">Vattentemp</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div 
                          className="text-xs xs:text-xs sm:text-sm font-bold text-outlined"
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
                <div className="glass-card-apple p-1 xs:p-1 sm:p-1.5">
                                      <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 xs:gap-1 sm:gap-2">
                        <div className="w-4 h-4 xs:w-4 xs:h-4 sm:w-5 sm:h-5 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-lg">
                          <span className="text-white text-xs xs:text-xs sm:text-xs">🧂</span>
                        </div>
                        <div>
                          <div className="text-xs xs:text-xs sm:text-sm font-semibold text-white">Salthalt</div>
                          <div className="text-xs xs:text-xs sm:text-xs text-white/60">Koncentration</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div 
                          className="text-xs xs:text-xs sm:text-sm font-bold text-outlined"
                          style={{ color: getColorForValue('salinity', pinData.salinity) }}
                        >
                          {pinData.salinity.toFixed(1)} g/kg
                        </div>
                      </div>
                    </div>
                </div>
              )}
              
              {/* Ström med Apple-design */}
              {pinData.current && pinData.current.u !== undefined && pinData.current.v !== undefined && 
               pinData.current.u !== null && pinData.current.v !== null && (
                <div className="glass-card-apple p-1 xs:p-1 sm:p-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 xs:gap-1 sm:gap-2">
                      <div className="w-4 h-4 xs:w-4 xs:h-4 sm:w-5 sm:h-5 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
                        <span className="text-white text-xs xs:text-xs sm:text-xs">🌊</span>
                      </div>
                      <div>
                        <div className="text-xs xs:text-xs sm:text-sm font-semibold text-white">Ström</div>
                        <div className="text-xs xs:text-xs sm:text-xs text-white/60">Hastighet</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div 
                        className="text-xs xs:text-xs sm:text-sm font-bold text-outlined"
                        style={{ color: getColorForValue('current', Math.hypot(pinData.current.u, pinData.current.v)) }}
                      >
                        {Math.hypot(pinData.current.u, pinData.current.v).toFixed(2)} m/s
                      </div>
                      <div className="text-xs xs:text-xs sm:text-xs text-white/70 font-medium">
                        {/* Konvertera från matematiska grader (0° = Öst) till kompassgrader (0° = Nord) */}
                        {getCompassDirection(90 - Math.atan2(pinData.current.v, pinData.current.u) * 180 / Math.PI)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Makrill-sannolikhet med Apple-design */}
              {pinData.mackerel !== undefined && pinData.mackerel !== null && (
                <div className="glass-card-apple p-1 xs:p-1 sm:p-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 xs:gap-1 sm:gap-2">
                      <div className="w-4 h-4 xs:w-4 xs:h-4 sm:w-5 sm:h-5 bg-gradient-to-br from-red-400 to-red-600 rounded-full flex items-center justify-center shadow-lg">
                        <span className="text-white text-xs xs:text-xs sm:text-xs">🐟</span>
                      </div>
                      <div>
                        <div className="text-xs xs:text-xs sm:text-sm font-semibold text-white">Makrill</div>
                        <div className="text-xs xs:text-xs sm:text-xs text-white/60">Sannolikhet</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div 
                        className="text-xs xs:text-xs sm:text-sm font-bold text-outlined"
                        style={{ color: getColorForValue('mackerel', pinData.mackerel) }}
                      >
                        {pinData.mackerel.toFixed(0)}%
                      </div>
                      <div className="text-xs xs:text-xs sm:text-xs text-white/70 font-medium">
                        {getMackerelDescription(pinData.mackerel)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Visa meddelande om ingen data finns */}
              {(!pinData.temperature && !pinData.salinity && !pinData.current && !pinData.mackerel) && (
                <div className="glass-card-apple p-1 xs:p-1 sm:p-1.5 text-center">
                  <div className="text-white/80 font-medium text-xs xs:text-xs sm:text-sm">
                    Ingen data tillgänglig för denna position
                  </div>
                </div>
              )}
            </div>
          </div>
        </Popup>
        );
      })()}
    </>
  );
};

export default MapPin; 