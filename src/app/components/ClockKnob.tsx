//src/app/components/ClockKnob.tsx

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
      ? `-${days} dag${days > 1 ? 'ar' : ''} ${hours}h`
      : `+${days} dag${days > 1 ? 'ar' : ''} ${hours}h`;

  const getColor = (v: number) => {
    const r = Math.round(250 + v * 5);
    const g = Math.round(200 - v * 200);
    const b = Math.round(50 - v * 50);
    return `rgb(${r},${Math.max(g, 0)},${Math.max(b, 0)})`;
  };
  const progressColor = getColor(value);

  return (
    <div className="w-full h-full px-4 py-2 bg-black/40 backdrop-blur-xl text-white overflow-hidden flex flex-col items-center justify-start md:justify-center portrait:rounded-t-2xl md:rounded-2xl">
      {/* Header */}
      <div className="flex-none pb-4">
        <h3 className="text-center text-sm font-semibold tracking-wider text-white/90 uppercase">
          Välj prognostid
        </h3>
      </div>

      {/* Mobilvy */}
      <div className="md:hidden w-full flex justify-center">
        <div className="w-[390px] grid grid-cols-[116px_130px_144px] items-center gap-6">
          {/* Vänster: Knappar */}
          <div className="grid grid-cols-2 gap-2 pr-[16px] justify-self-end">
            <button
              onClick={() => setSelectedHour(clampedHour - 24)}
              disabled={clampedHour <= minHour}
              className="text-[10px] w-[52px] px-1 py-[3px] rounded bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:text-white/30"
            >
              « -1 dag
            </button>
            <button
              onClick={() => setSelectedHour(clampedHour + 24)}
              disabled={clampedHour >= maxHour}
              className="text-[10px] w-[52px] px-1 py-[3px] rounded bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:text-white/30"
            >
              +1 dag »
            </button>
            <button
              onClick={() => setSelectedHour(clampedHour - 1)}
              disabled={clampedHour <= minHour}
              className="text-[10px] w-[52px] px-1 py-[3px] rounded bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:text-white/30"
            >
              − 1 tim
            </button>
            <button
              onClick={() => setSelectedHour(clampedHour + 1)}
              disabled={clampedHour >= maxHour}
              className="text-[10px] w-[52px] px-1 py-[3px] rounded bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:text-white/30"
            >
              +1 tim
            </button>
          </div>

          {/* Mitten: Cirkeln */}
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
              <CircularTrack stroke="#ffffff12" strokeWidth={10} />
              <CircularProgress
                stroke={progressColor}
                strokeWidth={10}
                style={{
                  transition: 'stroke 0.3s ease',
                  filter: `drop-shadow(0 0 8px ${progressColor})`,
                }}
              />
              <CircularThumb
                r={7}
                fill={progressColor}
                style={{
                  transition: 'fill 0.3s ease',
                  filter: `drop-shadow(0 0 5px ${progressColor})`,
                }}
              />
            </CircularInput>
          </div>

          {/* Höger: Text */}
          <div className="flex flex-col text-left space-y-0.5 pl-[24px] justify-self-start">
            <p className="text-xl font-semibold text-white">{weekday}</p>
            <p className="text-sm tracking-tight text-white/80">{fullDate}</p>
            <p className="text-base font-bold text-white">{time}</p>
            <div className="text-xs text-white/50 leading-tight mt-1">
              <span className="block">Prognos:</span>
              <span className="block">{offsetString}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:flex flex-col items-center mt-3">
        <div>
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
            radius={75}
          >
            <CircularTrack stroke="#ffffff12" strokeWidth={10} />
            <CircularProgress
              stroke={progressColor}
              strokeWidth={10}
              style={{
                transition: 'stroke 0.3s ease',
                filter: `drop-shadow(0 0 8px ${progressColor})`,
              }}
            />
            <CircularThumb
              r={7}
              fill={progressColor}
              style={{
                transition: 'fill 0.3s ease',
                filter: `drop-shadow(0 0 5px ${progressColor})`,
              }}
            />
          </CircularInput>
        </div>

        <div className="mt-2 text-center text-white space-y-1">
          <p className="text-xl font-semibold">{weekday}</p>
          <p className="text-sm tracking-tight text-white/80">{fullDate}</p>
          <p className="text-base font-bold text-white">{time}</p>
          <p className="text-xs text-white/50 mt-1 leading-tight">
            Prognos:<br />
            {offsetString}
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mt-4">
          <button
            onClick={() => setSelectedHour(clampedHour - 24)}
            disabled={clampedHour <= minHour}
            className="text-xs px-3 py-1 rounded-md backdrop-blur-md shadow bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:text-white/30"
          >
            « -1 dag
          </button>
          <button
            onClick={() => setSelectedHour(clampedHour + 24)}
            disabled={clampedHour >= maxHour}
            className="text-xs px-3 py-1 rounded-md backdrop-blur-md shadow bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:text-white/30"
          >
            +1 dag »
          </button>
          <button
            onClick={() => setSelectedHour(clampedHour - 1)}
            disabled={clampedHour <= minHour}
            className="text-xs px-3 py-1 rounded-md backdrop-blur-md shadow bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:text-white/30"
          >
            − 1 tim
          </button>
          <button
            onClick={() => setSelectedHour(clampedHour + 1)}
            disabled={clampedHour >= maxHour}
            className="text-xs px-3 py-1 rounded-md backdrop-blur-md shadow bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:text-white/30"
          >
            +1 tim
          </button>
        </div>
      </div>
    </div>
  );
}
