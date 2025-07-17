'use client';

import React, { useState, useEffect } from 'react';
import { Popup } from 'react-map-gl/maplibre';
import { Target, X, Plus, Thermometer, Droplets, Waves } from 'lucide-react';
import { useAreaParameters } from '../context/AreaParametersContext';
import { useTimeSlider } from '../context/TimeSliderContext';
import PopupPreloadManager from '../../lib/popupPreloadManager';

interface ManualPointPopupProps {
  longitude: number;
  latitude: number;
  onClose: () => void;
  onConfirm: (lat: number, lon: number) => void;
}

interface ParameterData {
  temperature?: number;
  salinity?: number;
  current?: {
    u?: number;
    v?: number;
  };
  hasData: boolean;
  distance?: number;
  isInWater?: boolean;
}

// Cache för vattenmask
let waterMaskCache: any = null;

// Hjälpfunktion för att ladda vattenmask - använder förladdad data
async function loadWaterMask(): Promise<any> {
  if (waterMaskCache) {
    return waterMaskCache;
  }
  
  // Kontrollera om vattenmasken är förladdad från popup preload manager
  const popupPreloadManager = PopupPreloadManager.getInstance();
  const preloadedWaterMask = popupPreloadManager.getWaterMask();
  
  if (preloadedWaterMask) {
    
    waterMaskCache = preloadedWaterMask;
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

const ManualPointPopup: React.FC<ManualPointPopupProps> = ({
  longitude,
  latitude,
  onClose,
  onConfirm
}) => {
  const { data: areaData } = useAreaParameters();
  const { selectedHour, baseTime } = useTimeSlider();
  const [parameterData, setParameterData] = useState<ParameterData>({ hasData: false });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkParameters = async () => {
      setIsLoading(true);
      
      // Ladda vattenmask först
      const waterMask = await loadWaterMask();
      const isInWater = isPointInWater(latitude, longitude, waterMask);
      
      // Om punkten är på land, visa direkt att ingen marindata är tillgänglig
      if (!isInWater) {
        setParameterData({ hasData: false, isInWater: false });
        setIsLoading(false);
        return;
      }
      
      if (!areaData?.points || !baseTime) {
        setParameterData({ hasData: false, isInWater: true });
        setIsLoading(false);
        return;
      }

      // Calculate target timestamp
      const targetTime = new Date(baseTime + selectedHour * 3600_000);
      const availableTimestamps = areaData.metadata?.timestamps || [];
      
      let closestTimestamp = availableTimestamps[0];
      let minDiff = Math.abs(new Date(availableTimestamps[0]).getTime() - targetTime.getTime());
      
      for (const timestamp of availableTimestamps) {
        const diff = Math.abs(new Date(timestamp).getTime() - targetTime.getTime());
        if (diff < minDiff) {
          minDiff = diff;
          closestTimestamp = timestamp;
        }
      }

      // Find nearest data point
      let nearestPoint = null;
      let minDistance = Infinity;

      for (const point of areaData.points) {
        const distance = Math.sqrt(
          Math.pow(point.lat - latitude, 2) + Math.pow(point.lon - longitude, 2)
        );
        if (distance < minDistance) {
          minDistance = distance;
          nearestPoint = point;
        }
      }

      if (nearestPoint && minDistance < 0.05) { // Within ~5km
        // Find data for current timestamp
        const timeData = nearestPoint.data.find(d => d.time === closestTimestamp);
        
        if (timeData) {
          // Kontrollera om det faktiskt finns användbara parametervärden
          const hasTemperature = timeData.temperature != null;
          const hasSalinity = timeData.salinity != null;
          const hasCurrent = timeData.current?.u != null && timeData.current?.v != null;
          const hasAnyData = hasTemperature || hasSalinity || hasCurrent;
          
          setParameterData({
            temperature: timeData.temperature,
            salinity: timeData.salinity,
            current: timeData.current,
            hasData: hasAnyData,
            distance: minDistance,
            isInWater: true
          });
        } else {
          setParameterData({ hasData: false, distance: minDistance, isInWater: true });
        }
      } else {
        setParameterData({ hasData: false, distance: minDistance, isInWater: true });
      }
      
      setIsLoading(false);
    };

    checkParameters();
  }, [areaData, latitude, longitude, selectedHour, baseTime]);

  const handleConfirm = () => {
    try {
      if (typeof latitude !== 'number' || typeof longitude !== 'number' || isNaN(latitude) || isNaN(longitude)) {
        console.error('Invalid coordinates in ManualPointPopup:', { latitude, longitude });
        return;
      }
      
      onConfirm(latitude, longitude);
      onClose();
    } catch (error) {
      console.error('Error in handleConfirm:', error);
      // Always close the popup even if there's an error
      onClose();
    }
  };

  return (
    <Popup
      longitude={longitude}
      latitude={latitude}
      onClose={onClose}
      closeButton={false}
      closeOnClick={false}
      anchor="bottom"
      offset={[0, -10]}
      className="manual-point-popup"
    >
      <div 
        className="
          backdrop-blur-md bg-orange-900/90
          rounded-xl shadow-2xl 
          p-3
          text-white text-sm
          border border-orange-400/30
          min-w-[280px]
        "
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target size={16} className="text-orange-300" />
            <h3 className="font-semibold text-orange-100">Lägg till manuell punkt</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-orange-800/50 rounded transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Coordinates */}
        <div className="mb-3 bg-orange-800/30 rounded-lg p-2">
          <div className="text-xs text-orange-200 mb-1">Koordinater:</div>
          <div className="font-mono text-orange-100">
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </div>
        </div>

        {/* Parameter Status */}
        <div className="mb-4">
          <div className="text-xs text-orange-200 mb-2">Befintliga parametrar:</div>
          
          {isLoading ? (
            <div className="text-center py-2 text-orange-300">
              <div className="animate-spin inline-block w-4 h-4 border-2 border-orange-300 border-t-transparent rounded-full"></div>
              <span className="ml-2">Kontrollerar data...</span>
            </div>
          ) : parameterData.isInWater === false ? (
            <div className="text-center py-2 text-red-300 text-xs">
              🚫 Punkt är på land - ingen marindata tillgänglig
            </div>
          ) : parameterData.hasData ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <Thermometer size={12} className="text-red-300" />
                <span className="text-orange-200">Temperatur:</span>
                <span className="text-orange-100">
                  {parameterData.temperature != null 
                    ? `${parameterData.temperature.toFixed(1)}°C` 
                    : 'Ingen data'}
                </span>
              </div>
              
              <div className="flex items-center gap-2 text-xs">
                <Droplets size={12} className="text-blue-300" />
                <span className="text-orange-200">Salthalt:</span>
                <span className="text-orange-100">
                  {parameterData.salinity != null 
                    ? `${parameterData.salinity.toFixed(1)} g/kg` 
                    : 'Ingen data'}
                </span>
              </div>
              
              <div className="flex items-center gap-2 text-xs">
                <Waves size={12} className="text-cyan-300" />
                <span className="text-orange-200">Strömstyrka:</span>
                <span className="text-orange-100">
                  {parameterData.current?.u != null && parameterData.current?.v != null
                    ? `${Math.sqrt(parameterData.current.u ** 2 + parameterData.current.v ** 2).toFixed(2)} m/s`
                    : 'Ingen data'}
                </span>
              </div>
              
              <div className="text-xs text-green-300 mt-2">
                ✓ Data finns redan ({parameterData.distance != null ? (parameterData.distance * 111).toFixed(1) : '0'} km bort)
              </div>
            </div>
          ) : (
            <div className="text-center py-2 text-blue-300 text-xs">
              {parameterData.distance != null ? (
                <>
                  ⚠️ Data finns ej ({(parameterData.distance * 111).toFixed(1)} km till närmaste)
                  <br />
                  <span className="text-xs text-blue-200">Punkt kommer att hämta ny marindata</span>
                </>
              ) : (
                <>🌊 Punkt kommer att hämta ny marindata</>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={parameterData.isInWater === false}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              parameterData.isInWater === false 
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                : 'bg-orange-600 hover:bg-orange-700 text-white'
            }`}
          >
            <Plus size={14} />
            {parameterData.isInWater === false ? 'Kan ej lägga till på land' : 'Lägg till punkt'}
          </button>
          
          <button
            onClick={onClose}
            className="px-3 py-2 bg-orange-800/50 hover:bg-orange-800/70 text-orange-200 rounded-lg text-sm transition-colors"
          >
            Avbryt
          </button>
        </div>
      </div>
    </Popup>
  );
};

export default ManualPointPopup; 