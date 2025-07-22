'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface LayerContextType {
  showCurrentVectors: boolean;
  setShowCurrentVectors: (show: boolean) => void;
}

const LayerContext = createContext<LayerContextType | undefined>(undefined);

export function LayerProvider({ children }: { children: React.ReactNode }) {
  const [showCurrentVectors, setShowCurrentVectorsState] = useState(true);

  const setShowCurrentVectors = (show: boolean) => {
    // console.log('🔄 LayerContext: setShowCurrentVectors called with:', show);
    setShowCurrentVectorsState(show);
  };

  const value = {
    showCurrentVectors, 
    setShowCurrentVectors,
  };

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