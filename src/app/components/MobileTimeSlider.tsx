//src/app/components/MobileTimeSlider.tsx

'use client';

import { useTimeSlider, getDateText } from '../context/TimeSliderContext';
import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import React from 'react';

const MobileTimeSlider = React.memo(({ className = "" }: { className?: string }) => {
  const { selectedHour, displayHour, setSelectedHour, setDisplayHour, minHour, maxHour, baseTime, isLoadingBounds } = useTimeSlider();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [screenSize, setScreenSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [isLandscape, setIsLandscape] = useState(false);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastValueRef = useRef<number>(0);

  // Use the same pattern as ClockKnob - displayHour for immediate feedback
  const clampedHour = Math.max(minHour, Math.min(displayHour, maxHour));

  useEffect(() => {
    const checkSizeAndOrientation = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isLandscapeNow = width > height;
      
      setIsLandscape(isLandscapeNow);
      
      // Determine screen size based on smaller dimension (height in portrait, width in landscape)
      const relevantDimension = isLandscapeNow ? height : width;
      
      if (relevantDimension <= 375) {
        setScreenSize('small'); // iPhone SE, small phones
      } else if (relevantDimension <= 414) {
        setScreenSize('medium'); // iPhone XR, standard phones
      } else {
        setScreenSize('large'); // Larger phones, tablets
      }
    };
    
    checkSizeAndOrientation();
    window.addEventListener('resize', checkSizeAndOrientation);
    window.addEventListener('orientationchange', () => {
      setTimeout(checkSizeAndOrientation, 150);
    });
    
    return () => {
      window.removeEventListener('resize', checkSizeAndOrientation);
      window.removeEventListener('orientationchange', checkSizeAndOrientation);
    };
  }, []);

  const totalRange = maxHour - minHour;

  // Ultra-optimized pointer handling using RAF and minimal state updates
  const updateSliderValue = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.min(1, Math.max(0, x / rect.width));
    const newHour = Math.round(percent * totalRange + minHour);
    
    // Only update if value actually changed
    if (newHour !== lastValueRef.current) {
      lastValueRef.current = newHour;
      // Use requestAnimationFrame for super smooth updates - same as CircularInput does
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(() => {
        setSelectedHour(newHour);
      });
    }
  }, [totalRange, minHour, setSelectedHour]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    updateSliderValue(e.clientX);
    
    // Global move and up handlers for better performance
    const handleMove = (e: PointerEvent) => {
      e.preventDefault();
      updateSliderValue(e.clientX);
    };
    
    const handleUp = () => {
      setIsDragging(false);
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      document.removeEventListener('pointercancel', handleUp);
    };
    
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    document.addEventListener('pointercancel', handleUp);
  }, [updateSliderValue]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const percent = (clampedHour - minHour) / totalRange;

  // Memoize progress color calculation - blue for past, golden to red for future
  const progressColor = useMemo(() => {
    if (clampedHour < 0) {
      // Going back in time: blue scale, deeper blue the further back
      const backProgress = Math.abs(clampedHour) / Math.abs(minHour);
      const intensity = Math.min(backProgress, 1);
      const r = Math.round(50 * (1 - intensity * 0.8)); // Less red as we go back
      const g = Math.round(150 * (1 - intensity * 0.3)); // Keep some green for blend
      const b = Math.round(200 + intensity * 55); // More blue as we go back
      return `rgb(${Math.max(r, 0)},${Math.max(g, 0)},${Math.min(b, 255)})`;
    } else if (clampedHour === 0) {
      // Present time: neutral blend color
      return `rgb(150, 170, 200)`;
    } else {
      // Going forward in time: golden to red scale (original behavior)
      const progress = Math.min(clampedHour / maxHour, 1);
      const r = Math.round(250 + progress * 5);
      const g = Math.round(200 - progress * 200);
      const b = Math.round(50 - progress * 50);
      return `rgb(${r},${Math.max(g, 0)},${Math.max(b, 0)})`;
    }
  }, [clampedHour, maxHour, minHour]);

  // Memoize date calculations - same as ClockKnob
  const dateInfo = useMemo(() => {
    if (!baseTime) return { date: new Date(), time: '', weekday: '', fullDate: '' };
    const date = new Date(baseTime + clampedHour * 3600 * 1000);
    const time = date.toLocaleTimeString('sv-SE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const { weekday, fullDate } = getDateText(clampedHour, baseTime);

    return { date, time, weekday, fullDate };
  }, [clampedHour, baseTime]);

  // Responsive styles for beautiful appearance
  const styles = useMemo(() => {
    if (isLandscape) {
      return {
        titleText: 'text-[10px]',
        mainText: 'text-xs',
        dateText: 'text-[10px]',
        sliderHeight: 'h-6',
        thumbSize: 'w-4 h-4',
        gap: 'gap-2',
        marginTop: 'mt-1',
        buttonSize: 'px-2 py-1 text-xs',
        buttonGap: 'gap-1'
      };
    }
    
    switch (screenSize) {
      case 'small':
        return {
          titleText: 'text-[10px]',
          mainText: 'text-sm',
          dateText: 'text-[10px]',
          sliderHeight: 'h-8',
          thumbSize: 'w-5 h-5',
          gap: 'gap-2',
          marginTop: 'mt-2',
          buttonSize: 'px-3 py-2 text-sm',
          buttonGap: 'gap-2'
        };
      case 'medium':
        return {
          titleText: 'text-xs',
          mainText: 'text-base',
          dateText: 'text-xs',
          sliderHeight: 'h-10',
          thumbSize: 'w-6 h-6',
          gap: 'gap-3',
          marginTop: 'mt-3',
          buttonSize: 'px-4 py-2 text-sm',
          buttonGap: 'gap-2'
        };
      default: // large
        return {
          titleText: 'text-sm',
          mainText: 'text-lg',
          dateText: 'text-sm',
          sliderHeight: 'h-12',
          thumbSize: 'w-7 h-7',
          gap: 'gap-3',
          marginTop: 'mt-4',
          buttonSize: 'px-4 py-3 text-base',
          buttonGap: 'gap-3'
        };
    }
  }, [isLandscape, screenSize]);

  // Show loading state while bounds are being calculated
  if (isLoadingBounds) {
    return (
      <div className={`w-full h-full overflow-hidden flex flex-col justify-center items-center min-h-0 ${className}`}>
        <div className="flex items-center space-x-3">
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          <p className="text-sm text-white/70">Laddar tillgänglig data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full h-full overflow-hidden flex flex-col justify-between min-h-0 ${className}`}>
      <div className="flex-1 flex flex-col justify-between h-full min-h-0">
        <div className={`flex flex-row items-center justify-between w-full mb-1 min-h-0 px-4 ${styles.gap} ${styles.marginTop}`}>
          {/* Left buttons - Beautiful responsive design with instant response */}
          <div className={`flex flex-row flex-shrink-0 ${styles.buttonGap}`}>
            <button
              onClick={() => setDisplayHour(Math.max(clampedHour - 1, minHour))}
              disabled={clampedHour === minHour}
              className={`${styles.buttonSize} rounded-xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 hover:from-blue-500/30 hover:to-purple-500/30 text-white font-semibold shadow-lg backdrop-blur-md transition-all duration-75 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 border border-white/10 hover:border-white/20`}
            >
              −1h
            </button>
            <button
              onClick={() => setDisplayHour(Math.min(clampedHour + 1, maxHour))}
              disabled={clampedHour === maxHour}
              className={`${styles.buttonSize} rounded-xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 hover:from-blue-500/30 hover:to-purple-500/30 text-white font-semibold shadow-lg backdrop-blur-md transition-all duration-75 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 border border-white/10 hover:border-white/20`}
            >
              +1h
            </button>
          </div>
          
          {/* Center text */}
          <div className="flex flex-col items-center flex-1 min-w-0 px-2">
            <p className={`tracking-wide uppercase text-white/50 ${styles.titleText} mb-0`}>
              PROGNOSTID
            </p>
            <p className={`font-bold tracking-tight drop-shadow-sm truncate ${styles.mainText} mb-0`}>
              {dateInfo.weekday}, {dateInfo.time}
            </p>
            <p className={`text-white/70 ${styles.dateText}`}>
              {dateInfo.fullDate}
            </p>
          </div>
          
          {/* Right buttons - Beautiful responsive design with instant response */}
          <div className={`flex flex-row flex-shrink-0 ${styles.buttonGap}`}>
            <button
              onClick={() => setDisplayHour(Math.max(clampedHour - 24, minHour))}
              disabled={clampedHour === minHour}
              className={`${styles.buttonSize} rounded-xl bg-gradient-to-r from-orange-500/20 to-red-500/20 hover:from-orange-500/30 hover:to-red-500/30 text-white font-semibold shadow-lg backdrop-blur-md transition-all duration-75 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 border border-white/10 hover:border-white/20`}
            >
              −1d
            </button>
            <button
              onClick={() => setDisplayHour(Math.min(clampedHour + 24, maxHour))}
              disabled={clampedHour === maxHour}
              className={`${styles.buttonSize} rounded-xl bg-gradient-to-r from-orange-500/20 to-red-500/20 hover:from-orange-500/30 hover:to-red-500/30 text-white font-semibold shadow-lg backdrop-blur-md transition-all duration-75 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 border border-white/10 hover:border-white/20`}
            >
              +1d
            </button>
          </div>
        </div>

        {/* Ultra-optimized slider with beautiful design */}
        <div className="flex items-center w-full px-4">
          <div
            ref={containerRef}
            onPointerDown={handlePointerDown}
            className={`relative w-full rounded-full bg-white/15 touch-none select-none cursor-pointer ${styles.sliderHeight}`}
          >
            {/* Progress bar - dynamic color based on time direction */}
            <div
              className={`absolute left-0 top-1/2 -translate-y-1/2 h-3 rounded-full shadow-md ${isDragging ? '' : 'transition-all duration-75 ease-out'}`}
              style={{ 
                width: `${percent * 100}%`,
                backgroundColor: progressColor,
                boxShadow: `0 0 10px ${progressColor}40, 0 0 20px ${progressColor}20`
              }}
            />
            
            {/* Thumb - dynamic color based on time direction */}
            <div
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 ${styles.thumbSize} rounded-full shadow-2xl border-2 border-white/80 ${isDragging ? '' : 'transition-all duration-75'}`}
              style={{ 
                left: `${percent * 100}%`,
                backgroundColor: progressColor,
                boxShadow: `0 0 15px ${progressColor}60, 0 0 30px ${progressColor}30`
              }}
            >
              {/* Simplified tooltip */}
              {isDragging && (
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-black/90 text-xs font-semibold text-white shadow-lg whitespace-nowrap">
                  {dateInfo.time}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

MobileTimeSlider.displayName = 'MobileTimeSlider';

export default MobileTimeSlider;
