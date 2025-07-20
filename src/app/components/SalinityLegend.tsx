'use client';

import { useMemo } from 'react';

// REVOLUTIONÄR SALTHALT FÄRGSKALA - RdBu för naturliga övergångar (0.000-30.188 g/kg, 18 färgsteg)
const REVOLUTIONARY_SALINITY_COLORMAP = [
  { value: 0.000, color: '#67001F', label: '' },     // Sötvatten - mörk röd
  { value: 2.000, color: '#B2182B', label: '' },     // Mycket bräckt - röd
  { value: 4.000, color: '#D6604D', label: '' },     // Bräckt - ljusare röd
  { value: 6.000, color: '#F4A582', label: '' },     // Svagt bräckt - ljus röd/orange
  { value: 7.094, color: '#FDDBC7', label: '' },     // 5:e percentilen - mycket ljus röd
  { value: 7.250, color: '#F7F7F7', label: '' },     // 10:e percentilen - vit
  { value: 7.391, color: '#D1E5F0', label: '' },     // 25:e percentilen - mycket ljus blå
  { value: 10.000, color: '#92C5DE', label: '' },    // Låg salthalt - ljus blå
  { value: 12.375, color: '#4393C3', label: '' },    // Median area - blå
  { value: 15.000, color: '#2166AC', label: '' },    // Medel salthalt - mörkare blå
  { value: 17.359, color: '#053061', label: '' },    // Median - mörk blå
  { value: 20.000, color: '#042A50', label: '' },    // Hög salthalt - mycket mörk blå
  { value: 20.234, color: '#032441', label: '' },    // 75:e percentilen - extremt mörk blå
  { value: 23.109, color: '#021E32', label: '' },    // 90:e percentilen - nästan svart-blå
  { value: 25.000, color: '#011823', label: '' },    // Mycket hög salthalt - svart-blå
  { value: 28.312, color: '#001214', label: '' },    // 95:e percentilen - svart-blå
  { value: 29.094, color: '#000C0F', label: '' },    // 99:e percentilen - mycket mörk
  { value: 30.188, color: '#00060A', label: '' }     // Maximum - nästan svart
];

interface SalinityLegendProps {
  visible?: boolean;
  className?: string;
}

export default function SalinityLegend({ 
  visible = true, 
  className = "" 
}: SalinityLegendProps) {
  
  // Skapa gradient CSS från den revolutionära RdBu färgskalan
  const gradientStyle = useMemo(() => {
    const gradientStops = REVOLUTIONARY_SALINITY_COLORMAP.map((item, index) => {
      const position = (index / (REVOLUTIONARY_SALINITY_COLORMAP.length - 1)) * 100;
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
        <div className="max-[380px]:w-3 max-[380px]:h-3 w-4 h-4 sm:w-5 sm:h-5 bg-gradient-to-r from-red-800 via-white to-blue-800 rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold">🧂</span>
        </div>
        <h3 className="max-[380px]:text-[10px] text-xs sm:text-sm font-semibold absolute inset-0 flex items-center justify-center">Salthalt</h3>
      </div>
      
      {/* Revolutionär RdBu färgbar med 18 färgsteg */}
      <div className="space-y-1">
        {/* Gradient bar - naturliga övergångar */}
        <div 
          className="w-full max-[380px]:h-3 h-5 sm:h-6 rounded border border-gray-600 shadow-inner"
          style={gradientStyle}
        />
        
        {/* FÖRENKLAD tick marks och labels - bara 4 viktiga värden */}
        <div className="relative mt-1 sm:mt-2">
          <div className="flex justify-between items-start max-[380px]:text-[10px] text-xs">
            {/* Endast 4 viktiga salthalt-värden för tydlighet */}
            {['0', '10', '20', '30'].map((label, index) => (
              <div key={label} className="flex flex-col items-center">
                {/* Tick mark */}
                <div className="w-px max-[380px]:h-1 h-1.5 bg-gray-400 mb-0.5" />
                {/* Label */}
                <span className="max-[380px]:text-[10px] text-xs text-gray-300 leading-none">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Enhet */}
        <div className="text-center mt-1">
          <span className="max-[380px]:text-[9px] text-xs text-gray-300">g/kg</span>
        </div>
      </div>
    </div>
  );
} 