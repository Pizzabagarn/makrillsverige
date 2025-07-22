'use client';

import { createContext, useContext, useState, ReactNode, useRef, useCallback } from 'react';

export type ImageLayerType = 'current' | 'temperature' | 'salinity' | 'mackerel' | 'vectors' | null;

interface ImageLayerContextType {
  activeLayer: ImageLayerType;
  setActiveLayer: (layer: ImageLayerType) => void;
  setActiveLayerFromSimulation: (layer: ImageLayerType) => void;
  isLayerActive: (layer: ImageLayerType) => boolean;
}

const ImageLayerContext = createContext<ImageLayerContextType | undefined>(undefined);

interface ImageLayerProviderProps {
  children: ReactNode;
}

export function ImageLayerProvider({ children }: ImageLayerProviderProps) {
  const [activeLayer, setActiveLayerState] = useState<ImageLayerType>('temperature'); // Default to temperature
  const lastSimulationLayer = useRef<ImageLayerType>(null);

  // Manuell lagerbyte (från sidebar) - hantera simulering automatiskt
  const setActiveLayer = useCallback((layer: ImageLayerType) => {
    // Rensa simuleringslager-spårning eftersom detta är manuell switch
    lastSimulationLayer.current = null;
    setActiveLayerState(layer);
  }, []);

  // Lagerbyte från simulering - registrera simuleringslager
  const setActiveLayerFromSimulation = useCallback((layer: ImageLayerType) => {
    lastSimulationLayer.current = layer;
    setActiveLayerState(layer);
  }, []);

  const isLayerActive = (layer: ImageLayerType) => activeLayer === layer;

  return (
    <ImageLayerContext.Provider
      value={{
        activeLayer,
        setActiveLayer,
        setActiveLayerFromSimulation,
        isLayerActive,
      }}
    >
      {children}
    </ImageLayerContext.Provider>
  );
}

export function useImageLayer() {
  const context = useContext(ImageLayerContext);
  if (context === undefined) {
    throw new Error('useImageLayer must be used within a ImageLayerProvider');
  }
  return context;
} 