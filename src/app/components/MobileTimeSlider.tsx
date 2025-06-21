//src/app/components/MobileTimeSlider.tsx

'use client';

import { useTimeSlider } from '../context/TimeSliderContext';
import { useRef, useState } from 'react';

export default function MobileTimeSlider() {
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
      className="w-full h-[100px] px-4 py-3 bg-black/70 backdrop-blur-lg text-white select-none"
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="text-center mb-2">
        <p className="text-xs tracking-wide uppercase text-white/60">PROGNOSTID</p>
        <p className="text-sm font-semibold">{weekday}, {time}</p>
        <p className="text-xs">{date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
      </div>

      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        className="relative h-6 rounded-full bg-white/20 touch-none"
      >
        <div
          className="absolute h-full bg-orange-400 rounded-full transition-all duration-150 ease-out"
          style={{ width: `${percent * 100}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-orange-400 shadow-xl transition-all"
          style={{ left: `${percent * 100}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>
    </div>
  );
}
