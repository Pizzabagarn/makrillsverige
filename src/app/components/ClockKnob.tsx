'use client';

import {
  CircularInput,
  CircularTrack,
  CircularProgress,
  CircularThumb,
} from 'react-circular-input';
import { useTimeSlider, getDateText } from '../context/TimeSliderContext';
import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import React from 'react';
import { getLayoutType, type LayoutType } from '../../lib/layoutUtils';

const ClockKnob = React.memo(() => {
  const { selectedHour, displayHour, setSelectedHour, setDisplayHour, minHour, maxHour, baseTime, isLoadingBounds } = useTimeSlider();
  const clampedHour = Math.max(minHour, Math.min(displayHour, maxHour)); // Use displayHour for immediate feedback
  const value = (clampedHour - minHour) / (maxHour - minHour);
  const lastValue = useRef(value);
  
  const [layoutType, setLayoutType] = useState<LayoutType>('desktop');

  useEffect(() => {
    const checkLayout = () => {
      setLayoutType(getLayoutType());
    };
    
    checkLayout();
    window.addEventListener('resize', checkLayout);
    window.addEventListener('orientationchange', checkLayout);
    
    return () => {
      window.removeEventListener('resize', checkLayout);
      window.removeEventListener('orientationchange', checkLayout);
    };
  }, []);

  // Memoize date calculations
  const dateInfo = useMemo(() => {
    if (!baseTime) return { date: new Date(), weekday: '', fullDate: '', time: '', offsetString: '' };
    const date = new Date(baseTime + clampedHour * 3600 * 1000);
    
    const { weekday, fullDate } = getDateText(clampedHour, baseTime);
    
    const time = date.toLocaleTimeString('sv-SE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const days = Math.floor(Math.abs(clampedHour) / 24);
    const hours = Math.abs(clampedHour) % 24;

    const offsetString = clampedHour === 0
      ? 'Nu'
      : clampedHour > 0
        ? days > 0
          ? `+${days}d ${hours}h`
          : `+${hours}h`
        : days > 0
          ? `-${days}d ${hours}h`
          : `-${hours}h`;

    return { date, weekday, fullDate, time, offsetString };
  }, [clampedHour, baseTime]);

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

  // Use static glow effect ID to prevent hydration mismatch
  const glowId = 'clock-knob-glow';

  const handleCircularInputChange = useCallback((v: number) => {
    const delta = Math.abs(v - lastValue.current);
    if (delta > 0.5) return;
    const scaled = Math.round(v * (maxHour - minHour) + minHour);
    if (scaled < minHour || scaled > maxHour) return;
    if (scaled !== clampedHour) setSelectedHour(scaled);
    lastValue.current = v;
  }, [maxHour, minHour, clampedHour, setSelectedHour]);

  const isTabletLandscape = layoutType === 'tabletLandscape';

  // Memoize responsive dimensions
  const responsiveDimensions = useMemo(() => ({
    radius: isTabletLandscape ? 65 : 80,
    strokeWidth: isTabletLandscape ? 6 : 8,
    thumbRadius: isTabletLandscape ? 5 : 6,
  }), [isTabletLandscape]);

  if (layoutType === 'desktop' || layoutType === 'tabletLandscape') {
    // Show loading state while bounds are being calculated
    if (isLoadingBounds) {
      return (
        <div className="flex flex-col items-center space-y-4">
          <div className="w-32 h-32 rounded-full bg-white/10 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          </div>
          <p className="text-xs text-white/70 text-center">Laddar tillgänglig data...</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center space-y-4">
        <svg width="0" height="0">
          <defs>
            <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        </svg>

        <div className="flex flex-col items-center gap-4">
          <CircularInput
            value={value}
            onChange={handleCircularInputChange}
            radius={responsiveDimensions.radius}
          >
            <CircularTrack stroke="#ffffff10" strokeWidth={responsiveDimensions.strokeWidth} />
            <CircularProgress stroke={progressColor} strokeWidth={responsiveDimensions.strokeWidth} filter={`url(#${glowId})`} />
            <CircularThumb r={responsiveDimensions.thumbRadius} fill={progressColor} />
          </CircularInput>

          <div className="text-center text-white space-y-0.5">
            <p className="text-lg font-semibold">{dateInfo.weekday}</p>
            <p className="text-sm text-white/70">{dateInfo.fullDate}</p>
            <p className="text-base font-bold">{dateInfo.time}</p>
            <p className="text-xs text-white/50 leading-tight mt-1">
              Prognos:<br />{dateInfo.offsetString}
            </p>
          </div>

          <div className="flex flex-col gap-2 mt-3">
            <div className="flex gap-2 justify-center">
              <button 
                onClick={() => setDisplayHour(Math.max(clampedHour - 24, minHour))} 
                disabled={clampedHour === minHour} 
                className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white shadow-sm backdrop-blur-md transition-all duration-75 disabled:opacity-30 disabled:cursor-not-allowed active:bg-white/30 active:scale-95"
              >
                « -1 dag
              </button>
              <button 
                onClick={() => setDisplayHour(Math.min(clampedHour + 24, maxHour))} 
                disabled={clampedHour === maxHour} 
                className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white shadow-sm backdrop-blur-md transition-all duration-75 disabled:opacity-30 disabled:cursor-not-allowed active:bg-white/30 active:scale-95"
              >
                +1 dag »
              </button>
            </div>
            <div className="flex gap-2 justify-center">
              <button 
                onClick={() => setDisplayHour(Math.max(clampedHour - 1, minHour))} 
                disabled={clampedHour === minHour} 
                className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white shadow-sm backdrop-blur-md transition-all duration-75 disabled:opacity-30 disabled:cursor-not-allowed active:bg-white/30 active:scale-95"
              >
                − 1 tim
              </button>
              <button 
                onClick={() => setDisplayHour(Math.min(clampedHour + 1, maxHour))} 
                disabled={clampedHour === maxHour} 
                className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white shadow-sm backdrop-blur-md transition-all duration-75 disabled:opacity-30 disabled:cursor-not-allowed active:bg-white/30 active:scale-95"
              >
                +1 tim
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Kompakt tablet layout
  if (layoutType === 'tablet') {
    return (
      <div className="flex items-center justify-center space-x-3">
        <div className="flex-shrink-0">
          <CircularInput
            value={value}
            onChange={handleCircularInputChange}
            radius={50}
          >
            <CircularTrack stroke="#ffffff10" strokeWidth={5} />
            <CircularProgress stroke={progressColor} strokeWidth={5} />
            <CircularThumb r={4} fill={progressColor} />
          </CircularInput>
        </div>
        <div className="text-center text-white">
          <p className="text-sm font-semibold">{dateInfo.weekday}</p>
          <p className="text-xs text-white/70">{dateInfo.fullDate}</p>
          <p className="text-sm font-bold">{dateInfo.time}</p>
          <p className="text-xs text-white/50">
            {dateInfo.offsetString}
          </p>
        </div>
      </div>
    );
  }

  // Mobil layout - bara text, ingen knapp
  return (
    <div className="flex flex-col items-center text-center text-white space-y-1">
      <p className="text-base font-semibold">{dateInfo.weekday}</p>
      <p className="text-xs text-white/70">{dateInfo.fullDate}</p>
      <p className="text-sm font-bold">{dateInfo.time}</p>
      <p className="text-xs text-white/50">
        Prognos: {dateInfo.offsetString}
      </p>
    </div>
  );
});

ClockKnob.displayName = 'ClockKnob';

export default ClockKnob;
