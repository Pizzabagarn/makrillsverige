'use client';

import { useMemo } from 'react';

// Färgskala för salthalt (0-36 PSU) - detaljerad skala som matchar Python-scriptet
const SALINITY_COLORMAP = [
  { value: 0.0, color: '#004000', label: '0' },    // Mycket mörkgrön för rent sötvatten
  { value: 2.0, color: '#006400', label: '2' },    // Mörkgrön för sötvatten
  { value: 4.0, color: '#008000', label: '4' },    // Grön
  { value: 6.0, color: '#228B22', label: '6' },    // Skoggrön
  { value: 8.0, color: '#32CD32', label: '8' },    // Ljusgrön
  { value: 10.0, color: '#7CFC00', label: '10' },  // Gräsgrön
  { value: 12.0, color: '#90EE90', label: '12' },  // Ljus mintgrön
  { value: 14.0, color: '#98FB98', label: '14' },  // Blekgrön
  { value: 16.0, color: '#F0E68C', label: '16' },  // Khaki
  { value: 18.0, color: '#FFFF00', label: '18' },  // Gul
  { value: 20.0, color: '#FFD700', label: '20' },  // Guldbrun
  { value: 22.0, color: '#FFA500', label: '22' },  // Orange
  { value: 24.0, color: '#FF8C00', label: '24' },  // Mörk orange
  { value: 26.0, color: '#87CEEB', label: '26' },  // Himmelblå
  { value: 28.0, color: '#4169E1', label: '28' },  // Kornblommblå
  { value: 30.0, color: '#0000FF', label: '30' },  // Blå
  { value: 32.0, color: '#0000CD', label: '32' },  // Mediumblå
  { value: 34.0, color: '#000080', label: '34' },  // Marinblå
  { value: 36.0, color: '#191970', label: '36' }   // Midnattsblå för extremt salt
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
        <div className="w-2.5 h-2.5 mr-1.5 rounded-sm bg-gradient-to-r from-green-800 via-yellow-400 via-sky-400 to-blue-800"></div>
        <h3 className="text-xs md:text-sm font-semibold text-gray-800">Salthalt</h3>
      </div>
      
      {/* Kompakt färgbar */}
      <div className="relative">
        {/* Gradient bar - smalare */}
        <div 
          className="w-full h-3 rounded border border-gray-300"
          style={gradientStyle}
        />
        
        {/* Minimala tick marks och labels - bara viktiga värden */}
        <div className="relative mt-0.5">
          <div className="flex justify-between items-start text-xs">
            {/* Bara 5 viktiga värden för att spara plats */}
            {[
              { label: '0' },
              { label: '10' },
              { label: '20' },
              { label: '30' },
              { label: '36' }
            ].map((item, index) => (
              <div key={item.label} className="flex flex-col items-center">
                {/* Mindre tick mark */}
                <div className="w-px h-1.5 bg-gray-400 mb-0.5" />
                {/* Kompakt label */}
                <span className="text-xs text-gray-600 leading-none">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Kompakt enhet */}
        <div className="text-center mt-1">
          <span className="text-xs text-gray-500">PSU</span>
        </div>
      </div>
    </div>
  );
} 