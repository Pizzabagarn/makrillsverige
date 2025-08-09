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
    <div className={`backdrop-blur-md bg-black/80 border border-white/20 rounded-lg shadow-xl text-white max-[380px]:p-2 p-3 sm:p-4 max-[380px]:w-32 w-44 lg:w-56 ${className}`}>
      {/* Revolutionär titel */}
              <div className="flex items-center mb-2 sm:mb-3 w-full relative">
        <div className="max-[380px]:w-3 max-[380px]:h-3 w-4 h-4 sm:w-5 sm:h-5 bg-gradient-to-r from-blue-800 via-cyan-400 via-green-400 via-yellow-400 via-orange-500 to-red-800 rounded-full flex items-center justify-center flex-shrink-0">
        </div>
        <h3 className="max-[380px]:text-[9px] text-xs sm:text-sm font-semibold absolute inset-0 flex items-center justify-center">Vattentemperatur</h3>
      </div>
      
      {/* Revolutionär färgbar med 19 färgsteg */}
      <div className="space-y-1">
        {/* Gradient bar - högre upplösning */}
        <div 
          className="w-full max-[380px]:h-3 h-5 sm:h-6 rounded border border-gray-600 shadow-inner"
          style={gradientStyle}
        />
        
        {/* FÖRENKLAD tick marks och labels - bara 4 viktiga värden */}
        <div className="relative mt-1 sm:mt-2">
                      <div className="flex justify-between items-start max-[380px]:text-[10px] text-xs">
              {/* Endast 4 viktiga temperatur-värden för tydlighet */}
              {['7°C', '12°C', '16°C', '21°C'].map((label, index) => (
                <div key={label} className="flex flex-col items-center">
                  {/* Tick mark */}
                  <div className="w-px max-[380px]:h-1 h-1.5 bg-gray-400 mb-0.5" />
                  {/* Label */}
                  <span className="max-[380px]:text-[9px] text-xs text-gray-300 leading-none">
                    {label}
                  </span>
                </div>
              ))}
          </div>
        </div>
        
        {/* Enhet */}
        <div className="text-center mt-1">
          <span className="max-[380px]:text-[9px] text-xs text-gray-300">°C</span>
        </div>
      </div>
    </div>
  );
} 