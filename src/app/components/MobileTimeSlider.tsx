//src/app/components/MobileTimeSlider.tsx

'use client';

import { useTimeSlider } from '../context/TimeSliderContext';
import { useRef, useState } from 'react';

export default function MobileTimeSlider({ className = "" }: { className?: string }) {
  const { selectedHour, setSelectedHour, minHour, maxHour } = useTimeSlider();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const clampedHour = Math.max(minHour, Math.min(selectedHour, maxHour));
  const totalRange = maxHour - minHour;

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    updateFromPointer(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    updateFromPointer(e);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const updateFromPointer = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.min(1, Math.max(0, x / rect.width));
    const newHour = Math.round(percent * totalRange + minHour);
    setSelectedHour(newHour);
  };

  const percent = (clampedHour - minHour) / totalRange;

  const date = new Date(Date.now() + clampedHour * 3600 * 1000);
  const time = date.toLocaleTimeString('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);

  const weekday =
    date.getDate() === today.getDate() ? 'Idag' :
    date.getDate() === tomorrow.getDate() ? 'Imorgon' :
    date.toLocaleDateString('sv-SE', { weekday: 'short' });

  return (
    <div
      className={`w-full h-full ${className}`}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="text-center mb-3 px-2">
        <p className="text-xs tracking-wide uppercase text-white/50">PROGNOSTID</p>
        <p className="text-lg font-bold tracking-tight drop-shadow-sm">{weekday}, {time}</p>
        <p className="text-xs text-white/70">{date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
      </div>

      {/* Knappar ovanför slidern */}
      <div className="flex flex-row items-center mb-3 w-full justify-between">
        <div className="flex flex-row gap-4">
          <button
            onClick={() => setSelectedHour(clampedHour - 1)}
            disabled={clampedHour <= minHour}
            className={`w-12 h-12 flex items-center justify-center rounded-full bg-white/10 text-white shadow-md text-base font-bold backdrop-blur-md transition-all ${clampedHour <= minHour ? 'opacity-30 cursor-default' : 'hover:bg-white/20'}`}
            aria-label="-1 timme"
          >
            <span>−1h</span>
          </button>
          <button
            onClick={() => setSelectedHour(clampedHour - 24)}
            disabled={clampedHour <= minHour}
            className={`w-12 h-12 flex items-center justify-center rounded-full bg-white/10 text-white shadow-md text-base font-bold backdrop-blur-md transition-all ${clampedHour <= minHour ? 'opacity-30 cursor-default' : 'hover:bg-white/20'}`}
            aria-label="-1 dag"
          >
            <span>−1d</span>
          </button>
        </div>
        <div className="flex-1" />
        <div className="flex flex-row gap-4">
          <button
            onClick={() => setSelectedHour(clampedHour + 1)}
            disabled={clampedHour >= maxHour}
            className={`w-12 h-12 flex items-center justify-center rounded-full bg-white/10 text-white shadow-md text-base font-bold backdrop-blur-md transition-all ${clampedHour >= maxHour ? 'opacity-30 cursor-default' : 'hover:bg-white/20'}`}
            aria-label="+1 timme"
          >
            <span>+1h</span>
          </button>
          <button
            onClick={() => setSelectedHour(clampedHour + 24)}
            disabled={clampedHour >= maxHour}
            className={`w-12 h-12 flex items-center justify-center rounded-full bg-white/10 text-white shadow-md text-base font-bold backdrop-blur-md transition-all ${clampedHour >= maxHour ? 'opacity-30 cursor-default' : 'hover:bg-white/20'}`}
            aria-label="+1 dag"
          >
            <span>+1d</span>
          </button>
        </div>
      </div>

      <div className="flex items-center w-full">
        {/* Slider och thumb */}
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          className="relative h-10 w-full max-w-full overflow-hidden rounded-full bg-white/15 touch-none select-none flex items-center cursor-pointer pl-5 pr-5"
        >
          {/* Progress bar */}
          <div
            className="absolute h-3 bg-gradient-to-r from-orange-400 via-yellow-300 to-orange-500 rounded-full transition-all duration-150 ease-out shadow-md"
            style={{ left: 0, right: 0, width: `calc(${percent * 100}% )`, top: '50%', transform: 'translateY(-50%)' }}
          />
          {/* Thumb (slider knob) */}
          <div
            className="absolute z-10 top-1/2 w-10 h-10 rounded-full bg-orange-400 shadow-2xl border-4 border-white/80 transition-all duration-100 ease-out glow-pulse"
            style={{ left: `calc(${percent * 100}% + 1.25rem)`, transform: 'translate(-50%, -50%)' }}
          >
            {/* Tooltip above thumb */}
            {isDragging && (
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md bg-black/90 text-xs font-semibold text-white shadow-lg border border-white/10 pointer-events-none animate-fade-in">
                {time}
              </div>
            )}
          </div>
          {/* Slider track border for better contrast */}
          <div className="absolute h-3 w-full rounded-full border border-white/20 pointer-events-none" style={{ left: 0, right: 0, top: '50%', transform: 'translateY(-50%)' }} />
        </div>
      </div>
    </div>
  );
}
