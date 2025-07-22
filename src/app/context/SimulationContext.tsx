'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { type ImageLayerType } from './ImageLayerContext';

// Simulation Context
const SimulationContext = createContext<{
  simulationLayer: ImageLayerType | null;
  setSimulationLayer: (layer: ImageLayerType | null) => void;
}>({
  simulationLayer: null,
  setSimulationLayer: () => {},
});

export const useSimulationLayer = () => useContext(SimulationContext);

interface SimulationProviderProps {
  children: ReactNode;
}

export const SimulationProvider = ({ children }: SimulationProviderProps) => {
  const [simulationLayer, setSimulationLayer] = useState<ImageLayerType | null>(null);

  return (
    <SimulationContext.Provider value={{ simulationLayer, setSimulationLayer }}>
      {children}
    </SimulationContext.Provider>
  );
}; 