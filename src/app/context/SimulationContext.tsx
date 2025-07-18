'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useTimeSlider } from './TimeSliderContext';
import { useImageLayer, type ImageLayerType } from './ImageLayerContext';

type SimulationSpeed = 0.5 | 0.75 | 1 | 1.5 | 2;

interface SimulationContextType {
  // Simulation state
  isPlaying: boolean;
  simulationLayer: ImageLayerType | null;
  speed: SimulationSpeed;
  
  // Controls
  play: () => void;
  pause: () => void;
  stop: () => void;
  setSpeed: (speed: SimulationSpeed) => void;
  setSimulationLayer: (layer: ImageLayerType | null) => void;
  
  // Status
  currentTime: Date | null;
  totalFrames: number;
  currentFrame: number;
}

const SimulationContext = createContext<SimulationContextType | undefined>(undefined);

export function SimulationProvider({ children }: { children: React.ReactNode }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [simulationLayer, setSimulationLayer] = useState<ImageLayerType | null>(null);
  const [speed, setSpeed] = useState<SimulationSpeed>(1);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  
  const { selectedHour, setSelectedHour, minHour, maxHour, baseTime, availableHours } = useTimeSlider();
  const { setActiveLayerFromSimulation } = useImageLayer();
  
  const animationRef = useRef<number | undefined>(undefined);
  const frameCountRef = useRef<number>(0);

  // Calculate total frames from available hours
  useEffect(() => {
    const frames = availableHours.length > 0 ? availableHours.length : Math.max(0, (maxHour ?? 0) - (minHour ?? 0) + 1);
    setTotalFrames(frames);
  }, [availableHours, minHour, maxHour]);

  // Calculate current frame index
  useEffect(() => {
    if (availableHours.length > 0) {
      const frameIndex = availableHours.indexOf(selectedHour);
      setCurrentFrame(frameIndex >= 0 ? frameIndex : 0);
    } else {
      setCurrentFrame(Math.max(0, selectedHour - (minHour ?? 0)));
    }
  }, [selectedHour, minHour, availableHours]);

  // Current time calculation
  const currentTime = React.useMemo(() => {
    if (!baseTime) return null;
    return new Date(baseTime + selectedHour * 3600 * 1000);
  }, [baseTime, selectedHour]);

  // Animation loop
  const animate = useCallback(() => {
    if (!isPlaying || !simulationLayer) return;

    frameCountRef.current++;
    
    // Calculate frame duration based on speed (base: 10 frames per second)
    const framesToSkip = Math.floor(10 / speed);
    
    if (frameCountRef.current % framesToSkip === 0) {
      // Move to next frame
      let nextHour = selectedHour + 1;
      
      if (availableHours.length > 0) {
        const currentIndex = availableHours.indexOf(selectedHour);
        if (currentIndex >= 0 && currentIndex < availableHours.length - 1) {
          const nextAvailableHour = availableHours[currentIndex + 1];
          nextHour = nextAvailableHour !== undefined ? nextAvailableHour : minHour;
        } else {
          // Loop back to beginning
          const firstAvailableHour = availableHours[0];
          nextHour = firstAvailableHour !== undefined ? firstAvailableHour : minHour;
        }
      } else {
        if (nextHour > maxHour) {
          nextHour = minHour;
        }
      }
      
      setSelectedHour(nextHour);
    }

    animationRef.current = requestAnimationFrame(animate);
  }, [isPlaying, simulationLayer, speed, selectedHour, availableHours, maxHour, minHour, setSelectedHour]);

  // Start/stop animation
  useEffect(() => {
    if (isPlaying && simulationLayer) {
      frameCountRef.current = 0;
      animationRef.current = requestAnimationFrame(animate);
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = undefined;
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, simulationLayer, animate]);

  // Control functions
  const play = useCallback(() => {
    if (simulationLayer) {
      setActiveLayerFromSimulation(simulationLayer);
      setIsPlaying(true);
    }
  }, [simulationLayer, setActiveLayerFromSimulation]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const stop = useCallback(() => {
    setIsPlaying(false);
    // Reset to first frame
    const firstHour = availableHours.length > 0 ? (availableHours[0] ?? minHour) : minHour;
    setSelectedHour(firstHour);
  }, [availableHours, minHour, setSelectedHour]);

  const handleSetSimulationLayer = useCallback((layer: ImageLayerType | null) => {
    setSimulationLayer(layer);
    if (layer) {
      setActiveLayerFromSimulation(layer);
    } else {
      // Reset all simulation states when layer becomes null
      setIsPlaying(false);
      setSpeed(1);
      setCurrentFrame(0);
      // Cancel any running animation
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
      frameCountRef.current = 0;
    }
    // Stop any running simulation when changing layers
    setIsPlaying(false);
  }, [setActiveLayerFromSimulation]);

  const handleSetSpeed = useCallback((newSpeed: SimulationSpeed) => {
    setSpeed(newSpeed);
  }, []);

  const value = {
    isPlaying,
    simulationLayer,
    speed,
    play,
    pause,
    stop,
    setSpeed: handleSetSpeed,
    setSimulationLayer: handleSetSimulationLayer,
    currentTime,
    totalFrames,
    currentFrame
  };

  return (
    <SimulationContext.Provider value={value}>
      {children}
    </SimulationContext.Provider>
  );
}

export function useSimulation() {
  const context = useContext(SimulationContext);
  if (context === undefined) {
    throw new Error('useSimulation must be used within a SimulationProvider');
  }
  return context;
} 