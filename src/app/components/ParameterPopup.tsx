'use client';

import React, { useState, useEffect } from 'react';
import { formatCoordinates, formatParameterValue, msToKnots } from '../../lib/spatialInterpolation';

interface InterpolatedValues {
  coordinates: {
    lat: number;
    lon: number;
  };
  values: {
    current?: {
      magnitude: number;
      direction: number;
      u: number;
      v: number;
      unit: string;
    };
    temperature?: {
      value: number;
      unit: string;
    };
    salinity?: {
      value: number;
      unit: string;
    };
  };
  dataType: 'interpolated' | 'actual' | 'no_data';
  nearestPointDistance: number;
  timestamp: string;
}

interface ParameterPopupProps {
  data: InterpolatedValues | null;
  position: { x: number; y: number };
  visible: boolean;
  onClose?: () => void;
}

/**
 * Få kompassriktning från grader
 */
function getCompassDirection(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 
                     'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

/**
 * Formatera tid för visning
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('sv-SE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Vacker parameter popup-komponent
 */
const ParameterPopup = React.memo(function ParameterPopup({ data, position, visible, onClose }: ParameterPopupProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (visible) {
      setIsAnimating(true);
    } else {
      const timer = setTimeout(() => setIsAnimating(false), 300);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!data || (!visible && !isAnimating)) return null;

  // Beräkna popup-position för att undvika att gå utanför skärmen
  const popupWidth = isMobile ? 280 : 320;
  const popupHeight = 200;
  const margin = 16;
  
  let adjustedPosition = { ...position };
  
  if (typeof window !== 'undefined') {
    // Justera X-position
    if (position.x + popupWidth + margin > window.innerWidth) {
      adjustedPosition.x = position.x - popupWidth - margin;
    } else {
      adjustedPosition.x = position.x + margin;
    }
    
    // Justera Y-position
    if (position.y + popupHeight + margin > window.innerHeight) {
      adjustedPosition.y = position.y - popupHeight - margin;
    } else {
      adjustedPosition.y = position.y + margin;
    }
    
    // Säkerställ att popup inte går utanför vänster eller övre kant
    adjustedPosition.x = Math.max(margin, adjustedPosition.x);
    adjustedPosition.y = Math.max(margin, adjustedPosition.y);
  }

  const hasNoData = data.dataType === 'no_data';
  const isInterpolated = data.dataType === 'interpolated';

  return (
    <div
      className={`fixed pointer-events-none z-[100000] transition-all duration-300 ease-out ${
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
      }`}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        width: popupWidth,
      }}
    >
      {/* Glasmorfism-bakgrund */}
      <div className="relative backdrop-blur-md bg-white/10 border border-white/20 rounded-xl shadow-2xl overflow-hidden">
        {/* Gradient overlay för visuell djup */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
        
        {/* Innehåll */}
        <div className="relative p-4 space-y-3">
          {/* Header med koordinater och stäng-knapp */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-white text-sm font-medium">
                {formatCoordinates(data.coordinates.lat, data.coordinates.lon)}
              </span>
            </div>
            
            <div className="flex items-center space-x-2">
              {/* Data-typ indikator */}
              <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                hasNoData 
                  ? 'bg-red-500/20 text-red-200'
                  : isInterpolated 
                    ? 'bg-yellow-500/20 text-yellow-200'
                    : 'bg-green-500/20 text-green-200'
              }`}>
                {hasNoData ? 'Ingen data' : isInterpolated ? 'Interpolerat' : 'Faktisk data'}
              </div>
              
              {/* Stäng-knapp */}
              {onClose && (
                <button
                  onClick={onClose}
                  className="p-1 hover:bg-white/10 rounded-full transition-colors pointer-events-auto"
                  title="Stäng (ESC)"
                >
                  <svg className="w-4 h-4 text-white/60 hover:text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Parametrar */}
          {hasNoData ? (
            <div className="text-center py-4">
              <div className="text-white/60 text-sm">
                Ingen data tillgänglig för denna position
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Strömstyrka */}
              {data.values.current && (
                <div className="flex items-center space-x-3 bg-blue-500/10 rounded-lg p-2">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-300" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10.293 15.707a1 1 0 010-1.414L14.586 10l-4.293-4.293a1 1 0 111.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      <path fillRule="evenodd" d="M3 10a1 1 0 011-1h10a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-white text-sm font-medium">Strömstyrka</div>
                    <div className="text-blue-200 text-xs">
                      {data.values.current.magnitude.toFixed(3)} m/s ({msToKnots(data.values.current.magnitude).toFixed(1)} knop)
                    </div>
                    <div className="text-blue-200 text-xs">
                      {getCompassDirection(data.values.current.direction)} ({data.values.current.direction.toFixed(0)}°)
                    </div>
                  </div>
                </div>
              )}

              {/* Temperatur */}
              {data.values.temperature && (
                <div className="flex items-center space-x-3 bg-orange-500/10 rounded-lg p-2">
                  <div className="w-8 h-8 bg-orange-500/20 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-orange-300" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-white text-sm font-medium">Temperatur</div>
                    <div className="text-orange-200 text-xs">
                      {data.values.temperature.value.toFixed(1)}°C
                    </div>
                  </div>
                </div>
              )}

              {/* Salthalt */}
              {data.values.salinity && (
                <div className="flex items-center space-x-3 bg-teal-500/10 rounded-lg p-2">
                  <div className="w-8 h-8 bg-teal-500/20 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-teal-300" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732L14.146 12.8l-1.179 4.456a1 1 0 01-1.934 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732L9.854 7.2l1.179-4.456A1 1 0 0112 2z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-white text-sm font-medium">Salthalt</div>
                    <div className="text-teal-200 text-xs">
                      {data.values.salinity.value.toFixed(1)} g/kg
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer med tid och avstånd */}
          <div className="flex items-center justify-between pt-2 border-t border-white/10">
            <div className="text-white/60 text-xs">
              {formatTime(data.timestamp)}
            </div>
            
            {!hasNoData && (
              <div className="text-white/60 text-xs">
                {data.nearestPointDistance < 1 
                  ? `${(data.nearestPointDistance * 1000).toFixed(0)}m`
                  : `${data.nearestPointDistance.toFixed(1)}km`} från närmaste punkt
              </div>
            )}
          </div>
          
          {/* Instruktioner */}
          <div className="text-center text-white/40 text-xs pt-1">
            Klicka på kartan för att visa data • ESC för att stänga
          </div>
        </div>

        {/* Dekorativ accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-teal-500" />
      </div>
      
      {/* Pil som pekar mot kartan */}
      <div 
        className="absolute w-4 h-4 bg-white/10 border-l border-b border-white/20 transform rotate-45 backdrop-blur-md"
        style={{
          left: position.x < adjustedPosition.x ? '100%' : '-8px',
          top: '20px',
          marginLeft: position.x < adjustedPosition.x ? '-8px' : '0',
        }}
      />
    </div>
  );
});

export default ParameterPopup; 