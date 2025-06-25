// src/app/components/TimeSlider.tsx
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import React from 'react';
import { useTimeSlider } from '../context/TimeSliderContext';

const TimeSlider = React.memo(() => {
  const { selectedHour, setSelectedHour, baseTime, minHour, maxHour } = useTimeSlider();

  // Memoize expensive date calculations
  const timeInfo = useMemo(() => {
    if (!baseTime) return { formatted: '', offsetString: '' };
    const date = new Date(baseTime + selectedHour * 3600 * 1000);
    const formatted = date.toLocaleString('sv-SE', {
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const days = Math.floor(selectedHour / 24);
    const hours = selectedHour % 24;

    const offsetString =
      days > 0
        ? `+${days} dag${days > 1 ? 'ar' : ''} ${hours}h`
        : `+${hours}h`;

    return { formatted, offsetString };
  }, [selectedHour, baseTime]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedHour(Number(e.target.value));
  }, [setSelectedHour]);

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[5000] w-full px-4 pointer-events-none">
      <div className="mx-auto w-full max-w-6xl bg-black/60 backdrop-blur-sm text-white rounded-md px-6 py-2 shadow-md pointer-events-auto">
        <input
          type="range"
          min={minHour}
          max={maxHour}
          value={selectedHour}
          onChange={handleSliderChange}
          className="w-full accent-blue-500"
        />
        <p className="text-center text-sm mt-1 font-light tracking-wide text-white/90">
          Prognos: {timeInfo.offsetString} ({timeInfo.formatted})
        </p>
      </div>
    </div>
  );
});

TimeSlider.displayName = 'TimeSlider';

export default TimeSlider;

// This component provides a time slider to select forecast hours.
// It uses the TimeSliderContext to manage the selected hour state.