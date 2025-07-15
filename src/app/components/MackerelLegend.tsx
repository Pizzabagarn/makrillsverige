'use client';

import React from 'react';

interface MackerelLegendProps {
  visible?: boolean;
  className?: string;
}

const MackerelLegend = ({ visible = true, className = "" }: MackerelLegendProps) => {
  // MJUKA FÄRGÖVERGÅNGAR: Svart → Grå → Blå → Orange med mjuka övergångar
  // Visar bara nyckelpunkter i legenden för läsbarhet
  const legendColors = [
    // Nyckelpunkter för svart → grå övergång
    { value: -39.0, color: '#000000', label: '-39%' },  // Absolut minimum - svart
    { value: -20.0, color: '#000000', label: '-20%' },  // Svart
    { value: 0.0, color: '#000000', label: '0%' },      // Svart vid neutral punkt
    { value: 5.0, color: '#070707', label: '5%' },      // Mycket mörk grå
    { value: 15.0, color: '#1A1A1A', label: '15%' },    // Grå
    { value: 25.0, color: '#363636', label: '25%' },    // Ljus grå
    
    // Nyckelpunkter för grå → blå övergång
    { value: 30.0, color: '#1E1E44', label: '30%' },    // Mörk grå-blå
    { value: 40.0, color: '#0A1B88', label: '40%' },    // Blå
    { value: 50.0, color: '#001FCC', label: '50%' },    // Ljus blå
    
    // Nyckelpunkter för blå → orange övergång
    { value: 60.0, color: '#8A7700', label: '60%' },    // Gul-brun
    { value: 70.0, color: '#EEBB00', label: '70%' },    // Gul-orange
    { value: 80.0, color: '#FFFF33', label: '80%' },    // Gul
    { value: 90.0, color: '#FFFF77', label: '90%' },    // Ljus gul
    { value: 100.0, color: '#FFFFCC', label: '100%' },  // Nästan vit
    { value: 102.2, color: '#FFFFFF', label: '102%' }   // Absolut maximum - vit
  ];

  if (!visible) {
    return null;
  }

  return (
    <div className={`bg-gray-900/90 backdrop-blur-sm rounded-lg p-4 text-white border border-gray-700 shadow-xl ${className}`}>
      <div className="flex items-center justify-center mb-3">
        <div className="w-5 h-5 bg-gradient-to-r from-black via-gray-600 via-blue-600 via-cyan-400 via-yellow-400 to-orange-500 rounded-full flex items-center justify-center mr-2">
          <span className="text-xs font-bold">🐟</span>
        </div>
        <h3 className="text-sm font-semibold">Makrillsannolikhet</h3>
      </div>
      
      <div className="space-y-2">
        {/* Inferno gradient bar */}
        <div className="relative h-6 rounded-md overflow-hidden border border-gray-600 shadow-inner">
          <div 
            className="h-full w-full"
            style={{
              background: `linear-gradient(to right, ${legendColors.map(c => c.color).join(', ')})`
            }}
          />
        </div>

        {/* Probability level labels */}
        <div className="flex justify-between text-xs text-gray-300">
          <span>Låg</span>
          <span>Medel</span>
          <span>Hög</span>
        </div>
      </div>
    </div>
  );
};

export default MackerelLegend; 