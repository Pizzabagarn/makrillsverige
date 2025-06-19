// src/app/components/TimeSlider.tsx
'use client';

import { useEffect, useState } from 'react';
import { useTimeSlider } from '../context/TimeSliderContext';

export default function TimeSlider({ totalHours = 121 }: { totalHours?: number }) {
  const { selectedHour, setSelectedHour } = useTimeSlider();
  const [formattedTime, setFormattedTime] = useState('');
  const [displayOffset, setDisplayOffset] = useState('');

  useEffect(() => {
    const date = new Date(Date.now() + selectedHour * 3600 * 1000);
    const formatted = date.toLocaleString('sv-SE', {
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    setFormattedTime(formatted);

    const days = Math.floor(selectedHour / 24);
    const hours = selectedHour % 24;

    const offsetString =
      days > 0
        ? `+${days} dag${days > 1 ? 'ar' : ''} ${hours}h`
        : `+${hours}h`;

    setDisplayOffset(offsetString);
  }, [selectedHour]);

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[5000] w-full px-4 pointer-events-none">
      <div className="mx-auto w-full max-w-6xl bg-black/60 backdrop-blur-sm text-white rounded-md px-6 py-2 shadow-md pointer-events-auto">
        <input
          type="range"
          min={0}
          max={totalHours - 1}
          value={selectedHour}
          onChange={(e) => setSelectedHour(Number(e.target.value))}
          className="w-full accent-blue-500"
        />
        <p className="text-center text-sm mt-1 font-light tracking-wide text-white/90">
          Prognos: {displayOffset} ({formattedTime})
        </p>
      </div>
    </div>
  );
}


// This component provides a time slider to select forecast hours.
// It uses the TimeSliderContext to manage the selected hour state.