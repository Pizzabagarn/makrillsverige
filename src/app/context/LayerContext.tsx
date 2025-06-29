'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface LayerContextType {
  showCurrentMagnitude: boolean;
  showCurrentVectors: boolean;
  setShowCurrentMagnitude: (show: boolean) => void;
  setShowCurrentVectors: (show: boolean) => void;
}

const LayerContext = createContext<LayerContextType | undefined>(undefined);

export function LayerProvider({ children }: { children: React.ReactNode }) {
  const [showCurrentMagnitude, setShowCurrentMagnitudeState] = useState(true);
  const [showCurrentVectors, setShowCurrentVectorsState] = useState(true);

  const setShowCurrentMagnitude = (show: boolean) => {
    // console.log('🔄 LayerContext: setShowCurrentMagnitude called with:', show);
    setShowCurrentMagnitudeState(show);
  };

  const setShowCurrentVectors = (show: boolean) => {
    // console.log('🔄 LayerContext: setShowCurrentVectors called with:', show);
    setShowCurrentVectorsState(show);
  };

  const value = {
    showCurrentMagnitude,
    showCurrentVectors,
    setShowCurrentMagnitude,
    setShowCurrentVectors,
  };

  // console.log('🔍 LayerContext render:', { showCurrentMagnitude, showCurrentVectors });

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

export function useLayerVisibility() {
  const context = useContext(LayerContext);
  if (context === undefined) {
    throw new Error('useLayerVisibility must be used within a LayerProvider');
  }
  return context;
} 