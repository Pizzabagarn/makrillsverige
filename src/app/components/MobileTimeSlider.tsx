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

  // Calculate responsive sizes based on viewport height
  const buttonSize = `clamp(2.5rem, 5vh, 6rem)`;
  const fontSize = `clamp(0.875rem, 2.2vh, 1.8rem)`;
  const titleFontSize = `clamp(0.75rem, 1.2vh, 0.9rem)`;
  const mainFontSize = `clamp(1rem, 1.8vh, 1.4rem)`;
  const dateFontSize = `clamp(0.75rem, 1.2vh, 0.9rem)`;
  const sliderHeight = `clamp(2.2rem, 4vh, 4rem)`;
  const centerGap = `clamp(0.1rem, 0.5vh, 0.4rem)`;

  return (
    <div
      className={`w-full h-full overflow-hidden flex flex-col justify-between min-h-0 ${className}`}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="flex-1 flex flex-col justify-between h-full min-h-0">
        <div className="flex flex-row items-center justify-between w-full mb-1 min-h-0 gap-2 px-4" style={{ marginTop: 'clamp(-1rem, 3vh - 1.5rem, 2rem)' }}>
          {/* Vänster knappar: -1h och +1h */}
          <div className="flex flex-row gap-2 flex-shrink-0">
            <button
              onClick={() => setSelectedHour(clampedHour - 1)}
              disabled={clampedHour <= minHour}
              className={`flex items-center justify-center rounded-full bg-white/10 text-white shadow-md font-bold backdrop-blur-md transition-all flex-shrink-0 ${clampedHour <= minHour ? 'opacity-30 cursor-default' : 'hover:bg-white/20'}`}
              style={{ 
                width: buttonSize, 
                height: buttonSize,
                fontSize: fontSize 
              }}
              aria-label="-1 timme"
            >
              <span>−1h</span>
            </button>
            <button
              onClick={() => setSelectedHour(clampedHour + 1)}
              disabled={clampedHour >= maxHour}
              className={`flex items-center justify-center rounded-full bg-white/10 text-white shadow-md font-bold backdrop-blur-md transition-all flex-shrink-0 ${clampedHour >= maxHour ? 'opacity-30 cursor-default' : 'hover:bg-white/20'}`}
              style={{ 
                width: buttonSize, 
                height: buttonSize,
                fontSize: fontSize 
              }}
              aria-label="+1 timme"
            >
              <span>+1h</span>
            </button>
          </div>
          {/* Texten centrerad */}
          <div className="flex flex-col items-center flex-1 min-w-0 px-1" style={{ lineHeight: 1.1 }}>
            <p 
              className="tracking-wide uppercase text-white/50"
              style={{ fontSize: titleFontSize, marginBottom: centerGap }}
            >
              PROGNOSTID
            </p>
            <p 
              className="font-bold tracking-tight drop-shadow-sm truncate"
              style={{ fontSize: mainFontSize, marginBottom: centerGap }}
            >
              {weekday}, {time}
            </p>
            <p 
              className="text-white/70"
              style={{ fontSize: dateFontSize }}
            >
              {date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
          {/* Höger knappar: -1d och +1d */}
          <div className="flex flex-row gap-2 flex-shrink-0">
            <button
              onClick={() => setSelectedHour(clampedHour - 24)}
              disabled={clampedHour <= minHour}
              className={`flex items-center justify-center rounded-full bg-white/10 text-white shadow-md font-bold backdrop-blur-md transition-all flex-shrink-0 ${clampedHour <= minHour ? 'opacity-30 cursor-default' : 'hover:bg-white/20'}`}
              style={{ 
                width: buttonSize, 
                height: buttonSize,
                fontSize: fontSize 
              }}
              aria-label="-1 dag"
            >
              <span>−1d</span>
            </button>
            <button
              onClick={() => setSelectedHour(clampedHour + 24)}
              disabled={clampedHour >= maxHour}
              className={`flex items-center justify-center rounded-full bg-white/10 text-white shadow-md font-bold backdrop-blur-md transition-all flex-shrink-0 ${clampedHour >= maxHour ? 'opacity-30 cursor-default' : 'hover:bg-white/20'}`}
              style={{ 
                width: buttonSize, 
                height: buttonSize,
                fontSize: fontSize 
              }}
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
            className="relative w-full max-w-full overflow-hidden rounded-full bg-white/15 touch-none select-none flex items-center cursor-pointer min-h-0 flex-shrink"
            style={{ height: sliderHeight, paddingLeft: '1rem', paddingRight: '1rem' }}
          >
            {/* Progress bar */}
            <div
              className="absolute bg-gradient-to-r from-orange-400 via-yellow-300 to-orange-500 rounded-full transition-all duration-150 ease-out shadow-md"
              style={{ left: 0, width: `calc(1rem + (100% - 2rem) * ${percent})`, top: '50%', transform: 'translateY(-50%)', height: '0.7rem' }}
            />
            {/* Thumb (slider knob) */}
            <div
              className="absolute z-10 top-1/2 rounded-full bg-orange-400 shadow-2xl border-4 border-white/80 transition-all duration-100 ease-out glow-pulse"
              style={{ left: `calc(1rem + (100% - 2rem) * ${percent})`, transform: 'translate(-50%, -50%)', width: '2.2rem', height: '2.2rem' }}
            >
              {/* Tooltip above thumb */}
              {isDragging && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md bg-black/90 text-xs font-semibold text-white shadow-lg border border-white/10 pointer-events-none animate-fade-in">
                  {time}
                </div>
              )}
            </div>
            {/* Slider track border for better contrast */}
            <div className="absolute w-full rounded-full border border-white/20 pointer-events-none" style={{ left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: '0.7rem' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
