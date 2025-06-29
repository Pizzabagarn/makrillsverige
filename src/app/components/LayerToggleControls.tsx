'use client';

import { useState } from 'react';

interface LayerToggleControlsProps {
  showCurrentMagnitude: boolean;
  showCurrentVectors: boolean;
  onToggleCurrentMagnitude: (show: boolean) => void;
  onToggleCurrentVectors: (show: boolean) => void;
  currentMagnitudeOpacity: number;
  onOpacityChange: (opacity: number) => void;
  className?: string;
}

export default function LayerToggleControls({
  showCurrentMagnitude,
  showCurrentVectors,
  onToggleCurrentMagnitude,
  onToggleCurrentVectors,
  currentMagnitudeOpacity,
  onOpacityChange,
  className = ""
}: LayerToggleControlsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={`backdrop-blur-md bg-white/90 border border-white/20 rounded-lg shadow-lg p-3 ${className}`}>
      {/* Header med toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
      >
        <span className="flex items-center">
          <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
          Lager
        </span>
        <svg 
          className={`w-4 h-4 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
          fill="currentColor" 
          viewBox="0 0 20 20"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Expanderat innehåll */}
      {isExpanded && (
        <div className="mt-3 space-y-3 border-t border-gray-200 pt-3">
          {/* Strömstyrka toggle */}
          <div className="backdrop-blur-sm bg-white/60 border border-gray-200/50 rounded-lg p-2.5 shadow-sm">
            <label className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700 flex items-center">
                <div className="w-2.5 h-2.5 mr-2 rounded-sm bg-gradient-to-r from-blue-500 via-green-500 via-yellow-500 to-red-500"></div>
                Strömstyrka
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCurrentMagnitude(!showCurrentMagnitude);
                }}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-300 ease-in-out shadow-md hover:shadow-lg ${
                  showCurrentMagnitude 
                    ? 'bg-blue-600 shadow-blue-500/30' 
                    : 'bg-gray-600 shadow-gray-600/20'
                } hover:scale-105 active:scale-95`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-all duration-300 ease-in-out shadow-sm ${
                    showCurrentMagnitude ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
                {/* Glowing effect when active */}
                {showCurrentMagnitude && (
                  <div className="absolute inset-0 rounded-full bg-blue-400/20 animate-pulse"></div>
                )}
              </button>
            </label>
            
            {/* Opacity slider när strömstyrka är synlig */}
            {showCurrentMagnitude && (
              <div className="mt-2">
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-600">Transparens</span>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.1"
                    value={currentMagnitudeOpacity}
                    onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
                    className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <span className="text-xs text-gray-600 w-8 text-right">
                    {Math.round(currentMagnitudeOpacity * 100)}%
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Strömpilar toggle */}
          <div className="backdrop-blur-sm bg-white/60 border border-gray-200/50 rounded-lg p-2.5 shadow-sm">
            <label className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700 flex items-center">
                <svg className="w-2.5 h-2.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10.293 15.707a1 1 0 010-1.414L14.586 10l-4.293-4.293a1 1 0 111.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  <path fillRule="evenodd" d="M3 10a1 1 0 011-1h10a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
                Strömpilar
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCurrentVectors(!showCurrentVectors);
                }}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-300 ease-in-out shadow-md hover:shadow-lg ${
                  showCurrentVectors 
                    ? 'bg-blue-600 shadow-blue-500/30' 
                    : 'bg-gray-600 shadow-gray-600/20'
                } hover:scale-105 active:scale-95`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-all duration-300 ease-in-out shadow-sm ${
                    showCurrentVectors ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
                {/* Glowing effect when active */}
                {showCurrentVectors && (
                  <div className="absolute inset-0 rounded-full bg-blue-400/20 animate-pulse"></div>
                )}
              </button>
            </label>
          </div>

          {/* Info text med inglasad design */}
          <div className="text-xs text-gray-600 backdrop-blur-sm bg-gray-50/80 border border-gray-200/50 rounded-lg p-2 shadow-sm">
            <strong>Strömstyrka</strong> visas som färgade zoner, <strong>pilarna</strong> visar strömriktning.
          </div>
        </div>
      )}
    </div>
  );
} 