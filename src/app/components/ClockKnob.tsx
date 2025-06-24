'use client';

import {
  CircularInput,
  CircularTrack,
  CircularProgress,
  CircularThumb,
} from 'react-circular-input';
import { useTimeSlider } from '../context/TimeSliderContext';
import { useRef, useState, useEffect } from 'react';
import { getLayoutType, type LayoutType } from '../../lib/layoutUtils';

export default function ClockKnob() {
  const { selectedHour, setSelectedHour, minHour, maxHour } = useTimeSlider();
  const clampedHour = Math.max(minHour, Math.min(selectedHour, maxHour));
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

  const isMobileLandscape = layoutType === 'mobileLandscape';
  const buttonStyle =
    'px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white shadow-sm backdrop-blur-md transition disabled:opacity-30 disabled:cursor-not-allowed';

  return (
    <div className="w-full h-full bg-black/40 backdrop-blur-xl text-white flex flex-col items-center justify-center rounded-2xl" style={{ padding: isMobileLandscape ? '0.25rem' : '0.5rem' }}>
      <h3 className="text-xs font-semibold tracking-widest text-white/70 uppercase mb-4 hidden md:block">
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

      {/* Kompakt layout för mobil landscape */}
      {isMobileLandscape ? (
        <div className="flex flex-col items-center gap-1">
          <h3 className="text-xs font-medium text-white/80 mb-0.5">Välj prognostid</h3>
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
            radius={30}
          >
            <CircularTrack stroke="#ffffff10" strokeWidth={3} />
            <CircularProgress
              stroke={progressColor}
              strokeWidth={3}
              className="glow-ring"
              style={glowStyle}
            />
            <CircularThumb r={2} fill={progressColor} />
          </CircularInput>

          <div className="text-center text-white space-y-0" style={{ fontSize: '11px' }}>
            <p className="font-semibold">{weekday}</p>
            <p className="font-bold">{time}</p>
            <p className="text-white/50 leading-tight">
              {offsetString}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex gap-1 justify-center">
              <button onClick={() => setSelectedHour(clampedHour - 24)} disabled={clampedHour <= minHour} className="px-1 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white shadow-sm backdrop-blur-md transition disabled:opacity-30 disabled:cursor-not-allowed" style={{ fontSize: '9px' }}>
                -1d
              </button>
              <button onClick={() => setSelectedHour(clampedHour + 24)} disabled={clampedHour >= maxHour} className="px-1 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white shadow-sm backdrop-blur-md transition disabled:opacity-30 disabled:cursor-not-allowed" style={{ fontSize: '9px' }}>
                +1d
              </button>
            </div>
            <div className="flex gap-1 justify-center">
              <button onClick={() => setSelectedHour(clampedHour - 1)} disabled={clampedHour <= minHour} className="px-1 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white shadow-sm backdrop-blur-md transition disabled:opacity-30 disabled:cursor-not-allowed" style={{ fontSize: '9px' }}>
                -1h
              </button>
              <button onClick={() => setSelectedHour(clampedHour + 1)} disabled={clampedHour >= maxHour} className="px-1 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white shadow-sm backdrop-blur-md transition disabled:opacity-30 disabled:cursor-not-allowed" style={{ fontSize: '9px' }}>
                +1h
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* 💻 Desktop layout med SVG-filter */
        <div className="flex flex-col items-center gap-4">
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
      )}
    </div>
  );
}
