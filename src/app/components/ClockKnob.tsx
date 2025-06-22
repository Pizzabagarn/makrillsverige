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
  const lastValue = useRef(value);

  const date = new Date(Date.now() + clampedHour * 3600 * 1000);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  const weekday = isToday
    ? 'Idag'
    : isTomorrow
      ? 'Imorgon'
      : date.toLocaleString('sv-SE', { weekday: 'short' });

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
      ? `-${days} dag${days !== 1 ? 'ar' : ''} ${hours}h`
      : `+${days} dag${days !== 1 ? 'ar' : ''} ${hours}h`;

  const getColor = (v: number) => {
    const r = Math.round(250 + v * 5);
    const g = Math.round(200 - v * 200);
    const b = Math.round(50 - v * 50);
    return `rgb(${r},${Math.max(g, 0)},${Math.max(b, 0)})`;
  };

  const progressColor = getColor(value);
  const safeId = progressColor.replace(/[^\w]/g, '');
  const glowId = `clock-glow-${safeId}`;

  const glowStyle = {
    '--glow-color': progressColor,
  } as React.CSSProperties;

  const buttonStyle =
    'px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white shadow-sm backdrop-blur-md transition disabled:opacity-30 disabled:cursor-not-allowed';

  return (
    <div className="w-full h-full px-4 py-3 bg-black/40 backdrop-blur-xl text-white flex flex-col items-center justify-start md:justify-center rounded-t-2xl md:rounded-2xl">
      <h3 className="text-sm font-semibold tracking-widest text-white/70 uppercase mb-3">
        Välj prognostid
      </h3>

      {/* 🔆 SVG-glow för desktop */}
      <svg width="0" height="0">
        <defs>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor={progressColor} />
          </filter>
        </defs>
      </svg>

      {/* 📱 Mobilvy med CSS-glow */}
      <div className="md:hidden w-full flex justify-center">
        <div className="w-[390px] grid grid-cols-[116px_130px_144px] items-center gap-4">
          <div className="grid grid-cols-2 gap-2 pr-4 justify-self-end">
            <button onClick={() => setSelectedHour(clampedHour - 24)} disabled={clampedHour <= minHour} className={buttonStyle}>
              « -1 dag
            </button>
            <button onClick={() => setSelectedHour(clampedHour + 24)} disabled={clampedHour >= maxHour} className={buttonStyle}>
              +1 dag »
            </button>
            <button onClick={() => setSelectedHour(clampedHour - 1)} disabled={clampedHour <= minHour} className={buttonStyle}>
              − 1 tim
            </button>
            <button onClick={() => setSelectedHour(clampedHour + 1)} disabled={clampedHour >= maxHour} className={buttonStyle}>
              +1 tim
            </button>
          </div>

          {/* Cirkeln */}
          <div className="w-[130px] h-[130px] flex items-center justify-center">
            <CircularInput
              value={value}
              onChange={(v) => {
                const delta = Math.abs(v - lastValue.current);
                if (delta > 0.5) return;
                const scaled = Math.round(v * (maxHour - minHour) + minHour);
                if (scaled < minHour || scaled > maxHour) return;
                if (scaled !== clampedHour) setSelectedHour(scaled);
                lastValue.current = v;
              }}
              radius={65}
            >
              <CircularTrack stroke="#ffffff10" strokeWidth={8} />
              <CircularProgress
                stroke={progressColor}
                strokeWidth={8}
                className="glow-ring"
                style={glowStyle}
              />
              <CircularThumb r={6} fill={progressColor} />
            </CircularInput>
          </div>

          <div className="flex flex-col text-left pl-4 justify-self-start text-white text-sm space-y-0.5">
            <p className="text-lg font-semibold">{weekday}</p>
            <p className="text-xs text-white/70">{fullDate}</p>
            <p className="text-base font-bold">{time}</p>
            <p className="text-xs text-white/50 mt-1 leading-tight">Prognos:<br />{offsetString}</p>
          </div>
        </div>
      </div>

      {/* 💻 Desktopvy med SVG-filter */}
      <div className="hidden md:flex flex-col items-center gap-4 mt-3">
        <CircularInput
          value={value}
          onChange={(v) => {
            const delta = Math.abs(v - lastValue.current);
            if (delta > 0.5) return;
            const scaled = Math.round(v * (maxHour - minHour) + minHour);
            if (scaled < minHour || scaled > maxHour) return;
            if (scaled !== clampedHour) setSelectedHour(scaled);
            lastValue.current = v;
          }}
          radius={80}
        >
          <CircularTrack stroke="#ffffff10" strokeWidth={8} />
          <CircularProgress stroke={progressColor} strokeWidth={8} filter={`url(#${glowId})`} />
          <CircularThumb r={6} fill={progressColor} />
        </CircularInput>

        <div className="text-center text-white space-y-0.5">
          <p className="text-lg font-semibold">{weekday}</p>
          <p className="text-sm text-white/70">{fullDate}</p>
          <p className="text-base font-bold">{time}</p>
          <p className="text-xs text-white/50 leading-tight mt-1">
            Prognos:<br />{offsetString}
          </p>
        </div>

        <div className="flex flex-col gap-2 mt-3">
          <div className="flex gap-2 justify-center">
            <button onClick={() => setSelectedHour(clampedHour - 24)} disabled={clampedHour <= minHour} className={buttonStyle}>
              « -1 dag
            </button>
            <button onClick={() => setSelectedHour(clampedHour + 24)} disabled={clampedHour >= maxHour} className={buttonStyle}>
              +1 dag »
            </button>
          </div>
          <div className="flex gap-2 justify-center">
            <button onClick={() => setSelectedHour(clampedHour - 1)} disabled={clampedHour <= minHour} className={buttonStyle}>
              − 1 tim
            </button>
            <button onClick={() => setSelectedHour(clampedHour + 1)} disabled={clampedHour >= maxHour} className={buttonStyle}>
              +1 tim
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
