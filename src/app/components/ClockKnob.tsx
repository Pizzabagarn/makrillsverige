// src/components/ClockKnob.tsx

'use client';

import {
  CircularInput,
  CircularTrack,
  CircularProgress,
  CircularThumb,
} from 'react-circular-input';

import { useTimeSlider } from '../context/TimeSliderContext';
import { useRef } from 'react';

export default function ClockKnob() {
  const { selectedHour, setSelectedHour, minHour, maxHour } = useTimeSlider();

  const clampedHour = Math.max(minHour, Math.min(selectedHour, maxHour));
  const value = (clampedHour - minHour) / (maxHour - minHour);
  const lastValue = useRef(value); // 🧠 Spara för att undvika wrap

  const date = new Date(Date.now() + clampedHour * 3600 * 1000);
  const weekday = date.toLocaleString('sv-SE', { weekday: 'short' });
  const fullDate = date.toLocaleDateString('sv-SE');
  const time = date.toLocaleTimeString('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const days = Math.floor(Math.abs(clampedHour) / 24);
  const hours = Math.abs(clampedHour) % 24;
  const offsetString =
    clampedHour < 0
      ? `-${days} dag${days > 1 ? 'ar' : ''} ${hours}h`
      : `+${days} dag${days > 1 ? 'ar' : ''} ${hours}h`;

  const getColor = (v: number): string => {
    const r = Math.round(250 + v * 5);
    const g = Math.round(200 - v * 200);
    const b = Math.round(50 - v * 50);
    return `rgb(${r},${Math.max(g, 0)},${Math.max(b, 0)})`;
  };

  const progressColor = getColor(value);

  return (
    <div className="w-full px-4 py-5 bg-black/40 backdrop-blur-xl rounded-2xl shadow-xl text-white relative">
      <svg width="0" height="0">
        <filter id="glow">
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={progressColor} floodOpacity="0.6" />
        </filter>
      </svg>

      {/* Dag och tim-knappar */}
      <div className="flex justify-between mb-2 px-4">
        <button
          onClick={() => setSelectedHour(Math.max(minHour, clampedHour - 24))}
          disabled={clampedHour <= minHour}
          className={`text-xs px-3 py-1 rounded-md backdrop-blur-md shadow ${clampedHour <= minHour ? 'bg-white/5 text-white/30 cursor-default' : 'bg-white/10 text-white hover:bg-white/20'}`}
        >
          « -1 dag
        </button>
        <button
          onClick={() => setSelectedHour(Math.min(maxHour, clampedHour + 24))}
          disabled={clampedHour >= maxHour}
          className={`text-xs px-3 py-1 rounded-md backdrop-blur-md shadow ${clampedHour >= maxHour ? 'bg-white/5 text-white/30 cursor-default' : 'bg-white/10 text-white hover:bg-white/20'}`}
        >
          +1 dag »
        </button>
      </div>

      <div className="flex justify-between mb-4 px-4">
        <button
          onClick={() => setSelectedHour(Math.max(minHour, clampedHour - 1))}
          disabled={clampedHour <= minHour}
          className={`text-xs px-3 py-1 rounded-md backdrop-blur-md shadow ${clampedHour <= minHour ? 'bg-white/5 text-white/30 cursor-default' : 'bg-white/10 text-white hover:bg-white/20'}`}
        >
          − 1 tim
        </button>
        <button
          onClick={() => setSelectedHour(Math.min(maxHour, clampedHour + 1))}
          disabled={clampedHour >= maxHour}
          className={`text-xs px-3 py-1 rounded-md backdrop-blur-md shadow ${clampedHour >= maxHour ? 'bg-white/5 text-white/30 cursor-default' : 'bg-white/10 text-white hover:bg-white/20'}`}
        >
          +1 tim
        </button>
      </div>

      <h3 className="text-center text-sm font-semibold mb-4 tracking-wider text-white/90 uppercase">
        Välj prognostid
      </h3>

      <div className="flex justify-center relative">
        <CircularInput
          value={value}
          onChange={(v) => {
            const delta = Math.abs(v - lastValue.current);

            // Förhindra hopp över kanten (t.ex. 0.95 → 0.02)
            if (delta > 0.5) return;

            const scaled = Math.round(v * (maxHour - minHour) + minHour);
            if (scaled < minHour || scaled > maxHour) return;

            if (scaled !== clampedHour) {
              setSelectedHour(scaled);
            }

            lastValue.current = v;
          }}
          radius={80}
        >
          <CircularTrack stroke="#ffffff10" strokeWidth={8} />
          <CircularProgress stroke={progressColor} strokeWidth={8} style={{ filter: 'url(#glow)' }} />
          <CircularThumb r={6} fill={progressColor} />

          <text
            x={80}
            y={62}
            textAnchor="middle"
            fontSize="18"
            fontWeight="600"
            fill="#ffffff"
            style={{ filter: 'drop-shadow(0 0 2px #fff)' }}
          >
            {weekday}
          </text>
          <text
            x={80}
            y={82}
            textAnchor="middle"
            fontSize="16"
            fontWeight="bold"
            fill="#ffffff"
            style={{ filter: 'drop-shadow(0 0 2px #fff)' }}
          >
            {fullDate}
          </text>
          <text
            x={80}
            y={102}
            textAnchor="middle"
            fontSize="18"
            fontWeight="bold"
            fill="#ffffff"
            style={{ filter: 'drop-shadow(0 0 3px #fff)' }}
          >
            {time}
          </text>
          <text
            x={80}
            y={120}
            textAnchor="middle"
            fontSize="11"
            fill="#e0e0e0"
            style={{ filter: 'drop-shadow(0 0 1px #aaa)' }}
          >
            Prognos: {offsetString}
          </text>
        </CircularInput>
      </div>
    </div>
  );
}

// This component provides a circular knob for selecting forecast hours.
// It uses the CircularInput library for a smooth circular slider experience.