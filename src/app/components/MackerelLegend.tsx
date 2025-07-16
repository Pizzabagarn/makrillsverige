'use client';

import React from 'react';

interface MackerelLegendProps {
  visible?: boolean;
  className?: string;
}

const MackerelLegend = ({ visible = true, className = "" }: MackerelLegendProps) => {
  // Mjuk övergång: Svart → Mörkbrun → Gyllene färger
  const legendColors = [
    // Svart bas för låga värden
    { value: -39.0, color: '#000000', label: '-39%' },  // Absolut minimum - svart
    { value: -20.0, color: '#000000', label: '-20%' },  // Svart
    { value: 0.0, color: '#000000', label: '0%' },      // Svart vid neutral punkt
    
    // Verkligt smidig progression - många små steg från svart till guld
    { value: 20.0, color: '#0A0800', label: '20%' },    // Mycket mörk brun
    { value: 25.0, color: '#151000', label: '25%' },    // Mörk brun
    { value: 30.0, color: '#201800', label: '30%' },    // Mörkbrun
    { value: 35.0, color: '#2B2000', label: '35%' },    // Mörkbrun
    { value: 40.0, color: '#362800', label: '40%' },    // Mörkbrun
    { value: 45.0, color: '#413000', label: '45%' },    // Mörkbrun
    { value: 50.0, color: '#4C3800', label: '50%' },    // Mörkbrun
    { value: 52.0, color: '#574000', label: '52%' },    // Brun
    { value: 55.0, color: '#624800', label: '55%' },    // Brun
    { value: 58.0, color: '#6D5000', label: '58%' },    // Brun
    { value: 60.0, color: '#785800', label: '60%' },    // Brun
    { value: 62.0, color: '#836000', label: '62%' },    // Brun-gul
    { value: 65.0, color: '#8E6800', label: '65%' },    // Brun-gul
    { value: 67.0, color: '#997000', label: '67%' },    // Brun-gul
    { value: 69.0, color: '#A47800', label: '69%' },    // Gul-brun
    { value: 70.0, color: '#BB8800', label: '70%' },    // Guld-brun
    { value: 72.0, color: '#CC9900', label: '72%' },    // Orange-guld
    { value: 75.0, color: '#DDAA00', label: '75%' },    // Ljus orange
    { value: 77.0, color: '#EEBB00', label: '77%' },    // Gul-orange
    { value: 80.0, color: '#FFCC00', label: '80%' },    // Gul-orange
    { value: 82.0, color: '#FFDD11', label: '82%' },    // Gul
    { value: 85.0, color: '#FFEE22', label: '85%' },    // Ljus gul
    { value: 87.0, color: '#FFFF33', label: '87%' },    // Gul
    { value: 90.0, color: '#FFFF55', label: '90%' },    // Ljus gul
    { value: 92.0, color: '#FFFF77', label: '92%' },    // Mycket ljus gul
    { value: 95.0, color: '#FFFF99', label: '95%' },    // Nästan vit-gul
    { value: 97.0, color: '#FFFFAA', label: '97%' },    // Ljus vit-gul
    { value: 100.0, color: '#FFFFCC', label: '100%' },  // Nästan vit
    { value: 102.2, color: '#FFFFFF', label: '102%' }   // Absolut maximum - vit
  ];

  if (!visible) {
    return null;
  }

  return (
    <div className={`bg-gray-900/90 backdrop-blur-sm rounded-lg p-4 text-white border border-gray-700 shadow-xl ${className}`}>
      <div className="flex items-center justify-center mb-3">
        <div className="w-5 h-5 bg-gradient-to-r from-black via-amber-800 via-yellow-600 to-yellow-400 rounded-full flex items-center justify-center mr-2">
          <span className="text-xs font-bold">🐟</span>
        </div>
        <h3 className="text-sm font-semibold">Makrillsannolikhet</h3>
      </div>
      
      <div className="space-y-2">
        {/* Gradient bar with original golden colors but brown instead of blue */}
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
          <span>Topp</span>
        </div>
      </div>
    </div>
  );
};

export default MackerelLegend; 