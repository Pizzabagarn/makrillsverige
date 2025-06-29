'use client';

import { useMemo } from 'react';

// Temperatur färgskala (mörkblå till röd) - -1 till 25°C
// Detaljerad färgskala som matchar Python-scriptet
const TEMPERATURE_COLORMAP = [
  { value: -1.0, color: '#000040', label: '-1°C' },
  { value: -0.5, color: '#000060', label: '-0.5°C' },
  { value: 0.0, color: '#000080', label: '0°C' },
  { value: 1.0, color: '#0000A0', label: '1°C' },
  { value: 2.0, color: '#0000FF', label: '2°C' },
  { value: 3.0, color: '#0040FF', label: '3°C' },
  { value: 4.0, color: '#0080FF', label: '4°C' },
  { value: 5.0, color: '#00A0FF', label: '5°C' },
  { value: 6.0, color: '#00C0FF', label: '6°C' },
  { value: 7.0, color: '#00E0FF', label: '7°C' },
  { value: 8.0, color: '#00FFFF', label: '8°C' },
  { value: 9.0, color: '#00FFE0', label: '9°C' },
  { value: 10.0, color: '#00FFC0', label: '10°C' },
  { value: 11.0, color: '#00FFA0', label: '11°C' },
  { value: 12.0, color: '#40FF80', label: '12°C' },
  { value: 13.0, color: '#80FF60', label: '13°C' },
  { value: 14.0, color: '#A0FF40', label: '14°C' },
  { value: 15.0, color: '#C0FF20', label: '15°C' },
  { value: 16.0, color: '#E0FF00', label: '16°C' },
  { value: 17.0, color: '#FFFF00', label: '17°C' },
  { value: 18.0, color: '#FFE000', label: '18°C' },
  { value: 19.0, color: '#FFC000', label: '19°C' },
  { value: 20.0, color: '#FFA000', label: '20°C' },
  { value: 21.0, color: '#FF8000', label: '21°C' },
  { value: 22.0, color: '#FF6000', label: '22°C' },
  { value: 23.0, color: '#FF4000', label: '23°C' },
  { value: 24.0, color: '#FF2000', label: '24°C' },
  { value: 25.0, color: '#FF0000', label: '25°C' }
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
        <div className="w-2.5 h-2.5 mr-1.5 rounded-sm bg-gradient-to-r from-blue-800 via-cyan-400 via-yellow-400 to-red-500"></div>
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
            {/* Bara 5 viktiga värden för att spara plats */}
            {[
              { label: '-1°C' },
              { label: '5°C' },
              { label: '12°C' },
              { label: '20°C' },
              { label: '25°C' }
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