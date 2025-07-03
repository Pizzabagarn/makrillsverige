'use client';

import { useMemo } from 'react';

// REVOLUTIONÄR FÄRGSKALA - Samma som Python-scriptet (0.000-1.526 m/s, 20 färgsteg)
const REVOLUTIONARY_CURRENT_COLORMAP = [
  { value: 0.000, color: '#000033', label: '0.0' },
  { value: 0.006, color: '#000066', label: '' },
  { value: 0.020, color: '#000099', label: '' },
  { value: 0.033, color: '#0033CC', label: '' },
  { value: 0.050, color: '#0066FF', label: '' },
  { value: 0.067, color: '#0099FF', label: '' },
  { value: 0.096, color: '#00CCFF', label: '' },
  { value: 0.125, color: '#00FFCC', label: '' },
  { value: 0.150, color: '#33FF99', label: '' },
  { value: 0.200, color: '#66FF66', label: '' },
  { value: 0.250, color: '#99FF33', label: '0.25' },
  { value: 0.299, color: '#CCFF00', label: '' },
  { value: 0.350, color: '#FFCC00', label: '' },
  { value: 0.400, color: '#FF9900', label: '' },
  { value: 0.500, color: '#FF6600', label: '0.5' },
  { value: 0.650, color: '#FF3300', label: '' },
  { value: 0.800, color: '#CC0000', label: '' },
  { value: 1.000, color: '#990000', label: '1.0' },
  { value: 1.300, color: '#660000', label: '' },
  { value: 1.526, color: '#330000', label: '1.5+' }
];

interface CurrentMagnitudeLegendProps {
  visible?: boolean;
  className?: string;
}

export default function CurrentMagnitudeLegend({ 
  visible = true, 
  className = "" 
}: CurrentMagnitudeLegendProps) {
  
  // Skapa gradient CSS från den revolutionära färgskalan
  const gradientStyle = useMemo(() => {
    const gradientStops = REVOLUTIONARY_CURRENT_COLORMAP.map((item, index) => {
      const position = (index / (REVOLUTIONARY_CURRENT_COLORMAP.length - 1)) * 100;
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
        <div className="w-2.5 h-2.5 mr-1.5 rounded-sm bg-gradient-to-r from-blue-900 via-cyan-400 via-green-400 via-yellow-400 via-orange-500 to-red-900"></div>
        <h3 className="text-xs md:text-sm font-semibold text-gray-800">Strömstyrka</h3>
      </div>
      
      {/* Revolutionär färgbar med 20 färgsteg */}
      <div className="space-y-1">
        {/* Gradient bar - högre upplösning */}
        <div 
          className="w-full h-3 rounded border border-gray-300"
          style={gradientStyle}
        />
        
        {/* FÖRENKLAD tick marks och labels - bara 4 viktiga värden */}
        <div className="relative mt-0.5">
          <div className="flex justify-between items-start text-xs">
            {/* Endast 4 viktiga värden för tydlighet */}
            {['0.0', '0.25', '0.5', '1.0', '1.5+'].map((label, index) => (
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
        
        {/* Enhet med verklig datarange */}
        <div className="text-center mt-1">
          <span className="text-xs text-gray-500">m/s</span>
        </div>
      </div>
    </div>
  );
} 