'use client';

import { useMemo } from 'react';

// Temperatur färgskala - Enklare färgschema: mörkblå → ljusblå → grön → gul → orange → röd
const TEMPERATURE_COLORMAP = [
  { value: -1.0, color: '#000080', label: '-1°C' },   // Mörkblå
  { value: 2.0, color: '#0066FF', label: '2°C' },     // Ljusblå
  { value: 8.0, color: '#00AA00', label: '8°C' },     // Grön
  { value: 12.0, color: '#FFFF00', label: '12°C' },   // Gul
  { value: 16.0, color: '#FF8800', label: '16°C' },   // Orange
  { value: 24.0, color: '#FF0000', label: '24°C' }    // Röd
];

interface TemperatureLegendProps {
  visible?: boolean;
  className?: string;
}

export default function TemperatureLegend({ 
  visible = true, 
  className = "" 
}: TemperatureLegendProps) {
  
  // Skapa gradient CSS från färgskalan
  const gradientStyle = useMemo(() => {
    const gradientStops = TEMPERATURE_COLORMAP.map((item, index) => {
      const position = (index / (TEMPERATURE_COLORMAP.length - 1)) * 100;
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
        <div className="w-2.5 h-2.5 mr-1.5 rounded-sm bg-gradient-to-r from-blue-800 via-green-500 via-yellow-400 via-orange-500 to-red-600"></div>
        <h3 className="text-xs md:text-sm font-semibold text-gray-800">Vattentemperatur</h3>
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
            {/* Temperaturer på klara färger (inte mellan-färger) */}
            {[
              { label: '-1°C' },
              { label: '8°C' },
              { label: '12°C' },
              { label: '16°C' },
              { label: '24°C' }
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
          <span className="text-xs text-gray-500">°C</span>
        </div>
      </div>
    </div>
  );
} 