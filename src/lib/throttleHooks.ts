import { useState, useEffect, useRef } from 'react';

// Throttle function för att hantera dragging-prestanda
export function useHeavyThrottle<T>(value: T, delay: number): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastExecuted = useRef<number>(0);

  useEffect(() => {
    const now = Date.now();
    if (now >= lastExecuted.current + delay) {
      lastExecuted.current = now;
      setThrottledValue(value);
    } else {
      const timer = setTimeout(() => {
        lastExecuted.current = Date.now();
        setThrottledValue(value);
      }, delay - (now - lastExecuted.current));

      return () => clearTimeout(timer);
    }
  }, [value, delay]);

  return throttledValue;
}

// Dragging detection hook
export function useDraggingDetection(selectedHour: number): boolean {
  const [isDragging, setIsDragging] = useState(false);
  const lastChangeTime = useRef<number>(0);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setIsDragging(true);
    lastChangeTime.current = Date.now();
    
    if (dragTimer.current) {
      clearTimeout(dragTimer.current);
    }
    
    // Shorter timeout for more responsive simulation
    dragTimer.current = setTimeout(() => {
      setIsDragging(false);
    }, 150) as any; // Reduced from 300ms to 150ms

    return () => {
      if (dragTimer.current) {
        clearTimeout(dragTimer.current);
      }
    };
  }, [selectedHour]);

  return isDragging;
} 