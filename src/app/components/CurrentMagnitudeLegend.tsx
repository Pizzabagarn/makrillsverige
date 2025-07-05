'use client';

import { useMemo } from 'react';

// UPPDATERAD LOGISK FÄRGSKALA - Matchar Python-scriptets nya färgskala
// Mörk blå → Ljus blå (0-0.4) → Cyan (0.4-0.5) → Gul (0.5-0.65) → Orange (0.65-0.9) → Röd (0.9-1.3+)
const REVOLUTIONARY_CURRENT_COLORMAP = [
  { value: 0.000, color: '#000066', label: '0.0' },     // Mörk blå - stillastående
  { value: 0.100, color: '#0033CC', label: '' },        // Ljusare blå
  { value: 0.200, color: '#3399FF', label: '' },        // Mycket ljus blå
  { value: 0.300, color: '#99DDFF', label: '' },        // Övergång till cyan
  { value: 0.400, color: '#00FFFF', label: '0.4' },     // Ren cyan - viktigt brytpunkt
  { value: 0.450, color: '#00CCCC', label: '' },        // Mörkare cyan
  { value: 0.500, color: '#FFFF00', label: '0.5' },     // Ren gul - viktigt brytpunkt
  { value: 0.550, color: '#FFCC00', label: '' },        // Orange-gul
  { value: 0.600, color: '#FF9900', label: '' },        // Orange
  { value: 0.650, color: '#FF6600', label: '0.65' },    // Orange - viktigt brytpunkt
  { value: 0.750, color: '#FF2200', label: '' },        // Mörkare orange
  { value: 0.850, color: '#DD0000', label: '' },        // Början av röd
  { value: 0.900, color: '#CC0000', label: '0.9' },     // Röd - viktigt brytpunkt
  { value: 1.000, color: '#990000', label: '' },        // Mörkare röd
  { value: 1.200, color: '#550000', label: '' },        // Extremt mörk röd
  { value: 1.300, color: '#330000', label: '1.3+' },    // Nästan svart röd - viktigt brytpunkt
];

interface CurrentMagnitudeLegendProps {
  visible?: boolean;
  className?: string;
}

export default function CurrentMagnitudeLegend({ 
  visible = true, 
  className = "" 
}: CurrentMagnitudeLegendProps) {
  
  // Skapa gradient CSS från den nya revolutionära färgskalan - FIXAD för korrekt värdepositionering
  const gradientStyle = useMemo(() => {
    const minValue = REVOLUTIONARY_CURRENT_COLORMAP[0].value;
    const maxValue = REVOLUTIONARY_CURRENT_COLORMAP[REVOLUTIONARY_CURRENT_COLORMAP.length - 1].value;
    
    const gradientStops = REVOLUTIONARY_CURRENT_COLORMAP.map((item) => {
      // Beräkna position baserat på faktiska värden, inte jämn fördelning
      const position = ((item.value - minValue) / (maxValue - minValue)) * 100;
      return `${item.color} ${position.toFixed(1)}%`;
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
        
        {/* FÖRENKLAD tick marks och labels - bara viktiga värden */}
        <div className="relative mt-0.5">
          <div className="flex justify-between items-start text-xs">
            {/* Endast viktiga värden från den nya skalan */}
            {REVOLUTIONARY_CURRENT_COLORMAP.filter(item => item.label !== '').map((item, index, filteredArray) => (
              <div key={item.label} className="flex flex-col items-center">
                {/* Tick mark */}
                <div className="w-px h-1.5 bg-gray-400 mb-0.5" />
                {/* Label */}
                <span className="text-xs text-gray-600 leading-none">
                  {item.label}
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