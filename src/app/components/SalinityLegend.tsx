'use client';

import { useMemo } from 'react';

// Salthalt färgskala - Enklare färgschema: mörkgrön → ljusgrön → gul → ljusblå → mörkblå
const SALINITY_COLORMAP = [
  { value: 0.0, color: '#004400', label: '0' },     // Mörkgrön
  { value: 8.0, color: '#00BB00', label: '8' },     // Ljusgrön
  { value: 16.0, color: '#FFFF00', label: '16' },   // Gul (mittenvärdet)
  { value: 24.0, color: '#66CCFF', label: '24' },   // Ljusblå
  { value: 36.0, color: '#000066', label: '36' }    // Mörkblå
];

interface SalinityLegendProps {
  visible?: boolean;
  className?: string;
}

export default function SalinityLegend({ 
  visible = true, 
  className = "" 
}: SalinityLegendProps) {
  
  // Skapa gradient CSS från färgskalan
  const gradientStyle = useMemo(() => {
    const gradientStops = SALINITY_COLORMAP.map((item, index) => {
      const position = (index / (SALINITY_COLORMAP.length - 1)) * 100;
      return `${item.color} ${position}%`;
    }).join(', ');
    
    return {
      background: `linear-gradient(to right, ${gradientStops})`
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={`bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border p-2.5 w-40 md:w-48 ${className}`}>
      {/* Kompakt titel */}
      <div className="flex items-center mb-2">
        <div className="w-2.5 h-2.5 mr-1.5 rounded-sm bg-gradient-to-r from-green-700 via-yellow-400 via-cyan-300 to-blue-700"></div>
        <h3 className="text-xs md:text-sm font-semibold text-gray-800">Salthalt</h3>
      </div>
      
      {/* Kompakt färgbar */}
      <div className="relative">
        {/* Gradient bar - smalare på mobil */}
        <div 
          className="w-full h-3 sm:h-3 h-2 rounded border border-gray-300"
          style={gradientStyle}
        />
        
        {/* Minimala tick marks och labels - bara viktiga värden */}
        <div className="relative mt-0.5 sm:mt-0.5 mt-0">
          <div className="flex justify-between items-start text-xs">
            {/* Salthalt på klara färger (inte mellan-färger) */}
            {[
              { label: '0' },
              { label: '8' },
              { label: '16' },
              { label: '24' },
              { label: '36' }
            ].map((item, index) => (
              <div key={item.label} className="flex flex-col items-center">
                {/* Mindre tick mark - extra små på mobil */}
                <div className="w-px h-1.5 sm:h-1.5 h-1 bg-gray-400 mb-0.5 sm:mb-0.5 mb-0" />
                {/* Kompakt label */}
                <span className="text-xs sm:text-xs text-[10px] text-gray-600 leading-none">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Kompakt enhet - mindre på mobil */}
        <div className="text-center mt-1 sm:mt-1 mt-0.5">
          <span className="text-xs sm:text-xs text-[10px] text-gray-500">g/kg</span>
        </div>
      </div>
    </div>
  );
} 