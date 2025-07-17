'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTimeSlider } from '../context/TimeSliderContext';
import { useImageLayer, type ImageLayerType } from '../context/ImageLayerContext';
import { Play, Pause, Square, ChevronDown, ChevronUp, Move } from 'lucide-react';

type SimulationSpeed = 0.5 | 0.75 | 1 | 1.5 | 2;

interface SimulationPlayerProps {
  simulationLayer: ImageLayerType | null;
  onLayerChange: (layer: ImageLayerType | null) => void;
}

export default function SimulationPlayer({ simulationLayer, onLayerChange }: SimulationPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<SimulationSpeed>(1);
  const [isSpeedDropdownOpen, setIsSpeedDropdownOpen] = useState(false);
  
  // Draggable state with responsive initial position
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, startX: 0, startY: 0 });
  
  const { selectedHour, setSelectedHour, minHour, maxHour, baseTime, availableHours } = useTimeSlider();
  const { setActiveLayer } = useImageLayer();
  
  const animationRef = useRef<number | undefined>(undefined);
  const frameCountRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Set initial position based on screen size
  useEffect(() => {
    if (position === null) {
      const setInitialPosition = () => {
        const isMobile = window.innerWidth < 640; // sm breakpoint
        if (isMobile) {
          // Mobile: top-left with margin to avoid legend
          setPosition({ x: 16, y: 16 });
        } else {
          // Desktop: centered horizontally, top with margin
          const centerX = (window.innerWidth - 400) / 2; // Approximate player width
          setPosition({ x: Math.max(16, centerX), y: 16 });
        }
      };

      setInitialPosition();
      window.addEventListener('resize', setInitialPosition);
      
      return () => {
        window.removeEventListener('resize', setInitialPosition);
      };
    }
  }, [position]);

  // Update active layer when simulation layer changes (but don't affect playback)
  useEffect(() => {
    if (simulationLayer) {
      setActiveLayer(simulationLayer);
    }
  }, [simulationLayer, setActiveLayer]);

  // Current time calculation
  const currentTime = React.useMemo(() => {
    if (!baseTime) return null;
    return new Date(baseTime + selectedHour * 3600 * 1000);
  }, [baseTime, selectedHour]);

  // Get current frame and total frames
  const currentFrame = React.useMemo(() => {
    if (availableHours.length > 0) {
      const frameIndex = availableHours.indexOf(selectedHour);
      return frameIndex >= 0 ? frameIndex + 1 : 1;
    }
    return Math.max(1, selectedHour - minHour + 1);
  }, [selectedHour, minHour, availableHours]);

  const totalFrames = React.useMemo(() => {
    return availableHours.length > 0 ? availableHours.length : Math.max(1, maxHour - minHour + 1);
  }, [availableHours, minHour, maxHour]);

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
          nextHour = availableHours[currentIndex + 1] ?? 0;
        } else {
          // Loop back to beginning
          nextHour = availableHours[0] ?? 0;
        }
      } else {
        if (nextHour > maxHour) {
          nextHour = minHour ?? 0;
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
      // Don't change the active layer here - it's already set by useEffect above
      setIsPlaying(true);
    }
  }, [simulationLayer]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const stop = useCallback(() => {
    setIsPlaying(false);
    // Reset to first frame
    const firstHour = availableHours.length > 0 ? (availableHours[0] ?? 0) : (minHour ?? 0);
    setSelectedHour(firstHour);
  }, [availableHours, minHour, setSelectedHour]);

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Allow dragging from main container or drag handle, but not from buttons
    const target = e.target as HTMLElement;
    const isButton = target.tagName === 'BUTTON' || target.closest('button');
    const isDropdown = target.closest('[role="menu"]') || target.closest('.absolute');
    
    if (isButton || isDropdown) {
      return; // Don't start drag on interactive elements
    }
    
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      startX: position?.x || 0,
      startY: position?.y || 0
    });
    
    // Prevent text selection while dragging
    e.preventDefault();
  }, [position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    const newX = Math.max(0, Math.min(window.innerWidth - 300, dragStart.startX + deltaX));
    const newY = Math.max(0, Math.min(window.innerHeight - 100, dragStart.startY + deltaY));
    
    setPosition({ x: newX, y: newY });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Set up global mouse events for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Touch handlers for mobile drag
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    const isButton = target.tagName === 'BUTTON' || target.closest('button');
    const isDropdown = target.closest('[role="menu"]') || target.closest('.absolute');
    
    if (isButton || isDropdown) {
      return; // Don't start drag on interactive elements
    }
    
    const touch = e.touches[0];
    if (!touch) return;
    
    setIsDragging(true);
    setDragStart({
      x: touch.clientX,
      y: touch.clientY,
      startX: position?.x || 0,
      startY: position?.y || 0
    });
    
    // Prevent scrolling while dragging
    e.preventDefault();
  }, [position]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging) return;
    e.preventDefault();

    const touch = e.touches[0];
    if (!touch) return;

    const deltaX = touch.clientX - dragStart.x;
    const deltaY = touch.clientY - dragStart.y;
    
    const newX = Math.max(0, Math.min(window.innerWidth - 300, dragStart.startX + deltaX));
    const newY = Math.max(0, Math.min(window.innerHeight - 100, dragStart.startY + deltaY));
    
    setPosition({ x: newX, y: newY });
  }, [isDragging, dragStart]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Set up global touch events for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
      
      return () => {
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, handleTouchMove, handleTouchEnd]);

  // Format time display
  const formatTime = (time: Date | null) => {
    if (!time) return '--:--';
    return time.toLocaleString('sv-SE', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const speedOptions: { value: SimulationSpeed; label: string }[] = [
    { value: 0.5, label: '0.5x' },
    { value: 0.75, label: '0.75x' },
    { value: 1, label: '1x' },
    { value: 1.5, label: '1.5x' },
    { value: 2, label: '2x' },
  ];

  if (!simulationLayer) {
    return null;
  }

  // Don't render until position is set
  if (position === null) {
    return null;
  }

  return (
    <div 
      ref={containerRef}
      className={`fixed z-[5000] backdrop-blur-md bg-black/80 border border-white/20 rounded-lg shadow-xl text-white 
                  p-2 sm:p-4 max-w-[95vw] sm:max-w-none select-none
                  ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        userSelect: 'none'
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      
      {/* Mobile Layout (stacked) */}
      <div className="block sm:hidden space-y-2">
        {/* Header with drag handle and layer name */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1">
            <Move size={12} className="text-gray-400" />
            <span className="text-xs font-semibold truncate">
              {simulationLayer === 'current' ? 'Strömstyrka' : 
               simulationLayer === 'temperature' ? 'Vattentemperatur' :
               simulationLayer === 'salinity' ? 'Salthalt' :
               simulationLayer === 'mackerel' ? 'Makrill' : 'Okänt'}
            </span>
          </div>
          
          {/* Close Button */}
                     <button
             onClick={() => onLayerChange(null)}
             className="p-1 hover:bg-white/20 rounded-full transition-colors"
           >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between">
          {/* Media Controls */}
          <div className="flex items-center space-x-1">
            <button
              onClick={play}
              disabled={isPlaying}
              className="p-1.5 rounded-full bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Play size={14} />
            </button>
            
            <button
              onClick={pause}
              disabled={!isPlaying}
              className="p-1.5 rounded-full bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"


            >
              <Pause size={14} />
            </button>
            
            <button
              onClick={stop}
              className="p-1.5 rounded-full bg-red-600 hover:bg-red-500 transition-colors"


            >
              <Square size={14} />
            </button>
          </div>

          {/* Speed Control - Compact */}
          <div className="relative">
            <button
              onClick={() => setIsSpeedDropdownOpen(!isSpeedDropdownOpen)}
              className="flex items-center space-x-1 px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors"


            >
              <span>{speed}x</span>
              {isSpeedDropdownOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            
            {isSpeedDropdownOpen && (
              <div className="absolute top-full right-0 mt-1 bg-black/90 border border-white/20 rounded shadow-xl min-w-16 z-10">
                {speedOptions.map(option => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setSpeed(option.value);
                      setIsSpeedDropdownOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1 text-xs hover:bg-white/10 transition-colors first:rounded-t last:rounded-b ${
                      speed === option.value ? 'bg-white/20' : ''
                    }`}


                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Time Display - Compact */}
        <div className="text-xs text-center">
          <div className="flex items-center justify-center space-x-2">
            <span className="truncate">{formatTime(currentTime)}</span>
            <span className="text-white/60">|</span>
            <span className="text-white/80">
              {currentFrame}/{totalFrames}
            </span>
          </div>
        </div>
      </div>

      {/* Desktop Layout (horizontal) */}
      <div className="hidden sm:flex items-center space-x-4">
        {/* Drag handle */}
        <Move size={16} className="text-gray-400 flex-shrink-0" />
        
        {/* Layer Name */}
        <div className="text-sm font-semibold">
          Simulering: {simulationLayer === 'current' ? 'Strömstyrka' : 
                      simulationLayer === 'temperature' ? 'Vattentemperatur' :
                      simulationLayer === 'salinity' ? 'Salthalt' :
                      simulationLayer === 'mackerel' ? 'Makrill-sannolikhet' : 'Okänt'}
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={play}
            disabled={isPlaying}
            className="p-2 rounded-full bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"


          >
            <Play size={16} />
          </button>
          
          <button
            onClick={pause}
            disabled={!isPlaying}
            className="p-2 rounded-full bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"


          >
            <Pause size={16} />
          </button>
          
          <button
            onClick={stop}
            className="p-2 rounded-full bg-red-600 hover:bg-red-500 transition-colors"


          >
            <Square size={16} />
          </button>
        </div>

        {/* Speed Control */}
        <div className="relative">
          <button
            onClick={() => setIsSpeedDropdownOpen(!isSpeedDropdownOpen)}
            className="flex items-center space-x-1 px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"


          >
            <span className="text-sm">{speed}x</span>
            {isSpeedDropdownOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          
          {isSpeedDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-black/90 border border-white/20 rounded-lg shadow-xl min-w-20 z-10">
              {speedOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => {
                    setSpeed(option.value);
                    setIsSpeedDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                    speed === option.value ? 'bg-white/20' : ''
                  }`}


                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Time Display */}
        <div className="text-sm">
          <div className="flex items-center space-x-2">
            <span>{formatTime(currentTime)}</span>
            <span className="text-white/60">|</span>
            <span className="text-white/80">
              {currentFrame}/{totalFrames}
            </span>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={() => onLayerChange(null)}
          className="p-1 hover:bg-white/20 rounded-full transition-colors"


        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
} 
