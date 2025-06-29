'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

export type ImageLayerType = 'current' | 'temperature' | 'salinity' | null;

interface ImageLayerContextType {
  activeLayer: ImageLayerType;
  setActiveLayer: (layer: ImageLayerType) => void;
  isLayerActive: (layer: ImageLayerType) => boolean;
}

const ImageLayerContext = createContext<ImageLayerContextType | undefined>(undefined);

interface ImageLayerProviderProps {
  children: ReactNode;
}

export function ImageLayerProvider({ children }: ImageLayerProviderProps) {
  const [activeLayer, setActiveLayer] = useState<ImageLayerType>('current'); // Default to current

  const isLayerActive = (layer: ImageLayerType) => activeLayer === layer;

  return (
    <ImageLayerContext.Provider
      value={{
        activeLayer,
        setActiveLayer,
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