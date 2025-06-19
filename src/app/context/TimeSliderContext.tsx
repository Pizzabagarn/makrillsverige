// src/app/context/TimeSliderContext.tsx
'use client';
import { createContext, useContext, useState } from 'react';

const TimeSliderContext = createContext<{
  selectedHour: number;
  setSelectedHour: (h: number) => void;
  minHour: number;
  maxHour: number;
  setBounds: (min: number, max: number) => void;
}>({
  selectedHour: 0,
  setSelectedHour: () => {},
  minHour: 0,
  maxHour: 116, // 4 dagar + 20 timmar
  setBounds: () => {},
});

export const TimeSliderProvider = ({ children }: { children: React.ReactNode }) => {
  const [selectedHour, setSelectedHour] = useState(0);
  const [minHour, setMinHour] = useState(0);
  const [maxHour, setMaxHour] = useState(116); // exakt 4 dagar + 20 timmar

  const setBounds = (min: number, max: number) => {
    setMinHour(min);
    setMaxHour(max);
    setSelectedHour((h) => Math.min(Math.max(h, min), max));
  };

  return (
    <TimeSliderContext.Provider
      value={{ selectedHour, setSelectedHour, minHour, maxHour, setBounds }}
    >
      {children}
    </TimeSliderContext.Provider>
  );
};

export const useTimeSlider = () => useContext(TimeSliderContext);
