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
    <div className={`bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border p-2.5 w-40 md:w-48 ${className}`}>
      {/* Revolutionär titel */}
      <div className="flex items-center mb-2">
        <div className="w-2.5 h-2.5 mr-1.5 rounded-sm bg-gradient-to-r from-red-800 via-white to-blue-800"></div>
        <h3 className="text-xs md:text-sm font-semibold text-gray-800">Salthalt</h3>
      </div>
      
      {/* Revolutionär RdBu färgbar med 18 färgsteg */}
      <div className="space-y-1">
        {/* Gradient bar - naturliga övergångar */}
        <div 
          className="w-full h-3 rounded border border-gray-300"
          style={gradientStyle}
        />
        
        {/* FÖRENKLAD tick marks och labels - bara 4 viktiga värden */}
        <div className="relative mt-0.5">
          <div className="flex justify-between items-start text-xs">
            {/* Endast 4 viktiga salthalt-värden för tydlighet */}
            {['0', '10', '20', '30'].map((label, index) => (
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
          <span className="text-xs text-gray-500">g/kg</span>
        </div>
      </div>
    </div>
  );
} 