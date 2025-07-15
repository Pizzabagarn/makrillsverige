'use client';

import React from 'react';

interface MackerelLegendProps {
  visible?: boolean;
  className?: string;
}

const MackerelLegend = ({ visible = true, className = "" }: MackerelLegendProps) => {
  // Colorcet.fire colormap för legend - perceptuellt uniform hotspot-visualisering
  // Värdeintervall: -39% till +102.2% (från verklig dataanalys)
  // Design: Svart → Rött → Orange → Gult → Vitt för optimal hotspot-visualisering
  const legendColors = [
    { value: -39.0, color: '#000000', label: '-39%' },  // Absolut minimum - svart
    { value: -30.0, color: '#320000', label: '-30%' },  // Mycket mörk röd
    { value: -20.0, color: '#4d0000', label: '-20%' },  // Mörk röd
    { value: -10.0, color: '#690100', label: '-10%' },  // Röd
    { value: 0.0, color: '#870200', label: '0%' },      // Neutral punkt - röd
    { value: 10.0, color: '#a60400', label: '10%' },    // Ljusare röd
    { value: 20.0, color: '#c60800', label: '20%' },    // Stark röd
    { value: 30.0, color: '#e81000', label: '30%' },    // Rund medelvärde - röd-orange
    { value: 40.0, color: '#fb3d00', label: '40%' },    // Orange
    { value: 50.0, color: '#fe6b00', label: '50%' },    // Stark orange
    { value: 60.0, color: '#ff8f00', label: '60%' },    // Ljus orange
    { value: 70.0, color: '#ffaf01', label: '70%' },    // Gul-orange
    { value: 80.0, color: '#ffcc05', label: '80%' },    // Ljus gul-orange
    { value: 90.0, color: '#ffe810', label: '90%' },    // Gul
    { value: 95.0, color: '#fff532', label: '95%' },    // Ljus gul
    { value: 100.0, color: '#fffecc', label: '100%' },  // Nästan vit
    { value: 102.2, color: '#ffffff', label: '102%' }   // Absolut maximum - vit
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