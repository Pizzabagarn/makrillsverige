'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface LayerContextType {
  showCurrentMagnitude: boolean;
  showCurrentVectors: boolean;
  setShowCurrentMagnitude: (show: boolean) => void;
  setShowCurrentVectors: (show: boolean) => void;
}

const LayerContext = createContext<LayerContextType | undefined>(undefined);

export function LayerProvider({ children }: { children: ReactNode }) {
  const [showCurrentMagnitude, setShowCurrentMagnitude] = useState(true);
  const [showCurrentVectors, setShowCurrentVectors] = useState(true);

  const setShowCurrentMagnitudeWithDebug = (show: boolean) => {
    console.log('🔄 LayerContext: setShowCurrentMagnitude called with:', show);
    setShowCurrentMagnitude(show);
  };

  const setShowCurrentVectorsWithDebug = (show: boolean) => {
    console.log('🔄 LayerContext: setShowCurrentVectors called with:', show);
    setShowCurrentVectors(show);
  };

  const value = {
    showCurrentMagnitude,
    showCurrentVectors,
    setShowCurrentMagnitude: setShowCurrentMagnitudeWithDebug,
    setShowCurrentVectors: setShowCurrentVectorsWithDebug,
  };

  console.log('🔍 LayerContext render:', { showCurrentMagnitude, showCurrentVectors });

  return (
    <LayerContext.Provider value={value}>
      {children}
    </LayerContext.Provider>
  );
}

export function useLayer() {
  const context = useContext(LayerContext);
  if (context === undefined) {
    throw new Error('useLayer must be used within a LayerProvider');
  }
  return context;
} 