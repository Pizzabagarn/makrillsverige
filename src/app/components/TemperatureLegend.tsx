'use client';

import { useMemo } from 'react';

// REVOLUTIONÄR TEMPERATUR FÄRGSKALA - Samma som Python-scriptet (6.974-20.980°C, 19 färgsteg)
const REVOLUTIONARY_TEMPERATURE_COLORMAP = [
  { value: 6.974, color: '#000066', label: '' },
  { value: 8.000, color: '#000099', label: '' },
  { value: 10.000, color: '#0033CC', label: '' },
  { value: 11.031, color: '#0066FF', label: '' },
  { value: 12.000, color: '#0099FF', label: '' },
  { value: 12.676, color: '#00CCFF', label: '' },
  { value: 13.500, color: '#00FFCC', label: '' },
  { value: 14.500, color: '#33FF99', label: '' },
  { value: 15.330, color: '#66FF66', label: '' },
  { value: 15.805, color: '#99FF33', label: '' },
  { value: 16.281, color: '#CCFF00', label: '' },
  { value: 16.699, color: '#FFFF00', label: '' },
  { value: 17.117, color: '#FFCC00', label: '' },
  { value: 17.500, color: '#FF9900', label: '' },
  { value: 17.883, color: '#FF6600', label: '' },
  { value: 18.328, color: '#FF3300', label: '' },
  { value: 19.000, color: '#CC0000', label: '' },
  { value: 20.000, color: '#990000', label: '' },
  { value: 20.980, color: '#660000', label: '' }
];

interface TemperatureLegendProps {
  visible?: boolean;
  className?: string;
}

export default function TemperatureLegend({ 
  visible = true, 
  className = "" 
}: TemperatureLegendProps) {
  
  // Skapa gradient CSS från den revolutionära färgskalan
  const gradientStyle = useMemo(() => {
    const gradientStops = REVOLUTIONARY_TEMPERATURE_COLORMAP.map((item, index) => {
      const position = (index / (REVOLUTIONARY_TEMPERATURE_COLORMAP.length - 1)) * 100;
      return `${item.color} ${position}%`;
    }).join(', ');
    
    return {
      background: `linear-gradient(to right, ${gradientStops})`
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={`bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border p-2.5 w-40 md:w-48 ${className}`}>
      {/* Revolutionär titel */}
      <div className="flex items-center mb-2">
        <div className="w-2.5 h-2.5 mr-1.5 rounded-sm bg-gradient-to-r from-blue-800 via-cyan-400 via-green-400 via-yellow-400 via-orange-500 to-red-800"></div>
        <h3 className="text-xs md:text-sm font-semibold text-gray-800">Vattentemperatur</h3>
      </div>
      
      {/* Revolutionär färgbar med 19 färgsteg */}
      <div className="space-y-1">
        {/* Gradient bar - högre upplösning */}
        <div 
          className="w-full h-3 rounded border border-gray-300"
          style={gradientStyle}
        />
        
        {/* FÖRENKLAD tick marks och labels - bara 4 viktiga värden */}
        <div className="relative mt-0.5">
          <div className="flex justify-between items-start text-xs">
            {/* Endast 4 viktiga temperatur-värden för tydlighet */}
            {['7°C', '12°C', '16°C', '21°C'].map((label, index) => (
              <div key={label} className="flex flex-col items-center">
                {/* Tick mark */}
                <div className="w-px h-1.5 bg-gray-400 mb-0.5" />
                {/* Label */}
                <span className="text-xs text-gray-600 leading-none">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Enhet */}
        <div className="text-center mt-1">
          <span className="text-xs text-gray-500">°C</span>
        </div>
      </div>
    </div>
  );
} 