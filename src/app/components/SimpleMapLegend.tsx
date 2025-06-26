'use client';

import React from 'react';

interface SimpleMapLegendProps {
  activeLayer: 'none' | 'temperature' | 'salinity' | 'current' | 'wind' | 'mackerel';
  showCurrentVectors: boolean;
  showWindVectors: boolean;
}

export default function SimpleMapLegend({ 
  activeLayer, 
  showCurrentVectors, 
  showWindVectors 
}: SimpleMapLegendProps) {
  
  // Visa endast om det finns något aktivt lager
  if (activeLayer === 'none' && !showCurrentVectors && !showWindVectors) {
    return null;
  }

  return (
    <div className="absolute bottom-4 left-4 space-y-2 z-10 pointer-events-none">
      
      {/* Temperatur legend */}
      {activeLayer === 'temperature' && (
        <div className="bg-white bg-opacity-80 p-2 rounded text-xs">
          <div className="font-semibold">Havstemperatur (°C)</div>
          <div className="flex items-center mt-1">
            <span className="mr-1">-2°</span>
            <div className="h-2 w-32 bg-gradient-to-r from-blue-500 via-green-300 to-red-600"></div>
            <span className="ml-1">25°</span>
          </div>
        </div>
      )}

      {/* Salthalt legend */}
      {activeLayer === 'salinity' && (
        <div className="bg-white bg-opacity-80 p-2 rounded text-xs">
          <div className="font-semibold">Salthalt (psu)</div>
          <div className="flex items-center mt-1">
            <span className="mr-1">20</span>
            <div className="h-2 w-32 bg-gradient-to-r from-red-500 via-yellow-400 to-green-500"></div>
            <span className="ml-1">35</span>
          </div>
        </div>
      )}

      {/* Strömhastighet legend */}
      {activeLayer === 'current' && (
        <div className="bg-white bg-opacity-80 p-2 rounded text-xs">
          <div className="font-semibold">Strömhastighet (m/s)</div>
          <div className="flex items-center mt-1">
            <span className="mr-1">0</span>
            <div className="h-2 w-32 bg-gradient-to-r from-blue-800 via-blue-400 via-green-400 via-yellow-400 to-red-500"></div>
            <span className="ml-1">2</span>
          </div>
        </div>
      )}

      {/* Strömpilar legend */}
      {showCurrentVectors && (
        <div className="bg-white bg-opacity-80 p-2 rounded text-xs">
          <div className="font-semibold">Havsströmmar</div>
          <div className="flex items-center mt-1 space-x-2">
            <img src="/images/arrow.png" alt="Pil" className="w-3 h-3 transform rotate-45" />
            <span>Riktning & hastighet</span>
          </div>
          <div className="text-xs text-gray-600 mt-1">
            Färg: Blå (svag) → Grön → Gul → Röd (stark)
          </div>
        </div>
      )}

      {/* Vindpilar legend */}
      {showWindVectors && (
        <div className="bg-white bg-opacity-80 p-2 rounded text-xs">
          <div className="font-semibold">Vindvektorer</div>
          <div className="flex items-center mt-1 space-x-2">
            <img src="/images/arrow.png" alt="Pil" className="w-3 h-3 transform rotate-12" />
            <span>Vindriktning & styrka</span>
          </div>
          <div className="text-xs text-gray-600 mt-1">
            Färg visar vindstyrka: Blå → Grön → Gul → Röd
          </div>
        </div>
      )}

      {/* Makrill legend */}
      {activeLayer === 'mackerel' && (
        <div className="bg-white bg-opacity-80 p-2 rounded text-xs">
          <div className="font-semibold">Makrill-hotspots</div>
          <div className="space-y-1 mt-1">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>Hög sannolikhet (&gt;80%)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
              <span>Medel sannolikhet (50-80%)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
              <span>Låg sannolikhet (&lt;50%)</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
} 