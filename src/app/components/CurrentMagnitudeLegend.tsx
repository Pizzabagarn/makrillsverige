'use client';

import { useMemo } from 'react';

// Samma färgskala som i Python-scriptet
const CURRENT_COLORMAP = [
  { value: 0.0, color: '#000080', label: '0' },
  { value: 0.25, color: '#0080FF', label: '0.25' },
  { value: 0.5, color: '#00FF80', label: '0.5' },
  { value: 0.75, color: '#80FF00', label: '0.75' },
  { value: 1.0, color: '#FFFF00', label: '1.0' },
  { value: 1.25, color: '#FF8000', label: '1.25' },
  { value: 1.5, color: '#FF4000', label: '1.5' },
  { value: 1.75, color: '#FF0000', label: '1.75' },
  { value: 2.0, color: '#800000', label: '2.0' },
  { value: 2.5, color: '#400000', label: '2.5+' }
];

interface CurrentMagnitudeLegendProps {
  visible?: boolean;
  className?: string;
}

export default function CurrentMagnitudeLegend({ 
  visible = true, 
  className = "" 
}: CurrentMagnitudeLegendProps) {
  
  // Skapa gradient CSS från färgskalan
  const gradientStyle = useMemo(() => {
    const gradientStops = CURRENT_COLORMAP.map((item, index) => {
      const position = (index / (CURRENT_COLORMAP.length - 1)) * 100;
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
        <div className="w-2.5 h-2.5 mr-1.5 rounded-sm bg-gradient-to-r from-blue-500 via-green-500 via-yellow-500 to-red-500"></div>
        <h3 className="text-xs md:text-sm font-semibold text-gray-800">Strömstyrka</h3>
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
            {/* Bara 4 viktiga värden för att spara plats */}
            {[
              { label: '0' },
              { label: '1.0' },
              { label: '2.0' },
              { label: '2.5+' }
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
          <span className="text-xs text-gray-500">knop</span>
        </div>
      </div>
    </div>
  );
} 