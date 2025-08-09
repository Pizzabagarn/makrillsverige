//src/app/components/MobileTopbar.tsx

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { type LayoutType } from '../../lib/layoutUtils';
import { type ImageLayerType } from '../context/ImageLayerContext';
import ModernDropdown from './ModernDropdown';
import UserMenu from './UserMenu';

interface MobileTopbarProps {
  layoutType: LayoutType;
  activeLayer: ImageLayerType | null;
  setActiveLayer: (layer: ImageLayerType | null) => void;
  showCurrentVectors: boolean;
  setShowCurrentVectors: (show: boolean) => void;
  simulationLayer: ImageLayerType | null;
  setSimulationLayer: (layer: ImageLayerType | null) => void;
}

const MobileTopbar = React.memo(({ 
  layoutType, 
  activeLayer, 
  setActiveLayer, 
  showCurrentVectors, 
  setShowCurrentVectors,
  simulationLayer,
  setSimulationLayer 
}: MobileTopbarProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartYRef = useRef<number | null>(null);
  const lastDeltaRef = useRef(0);
  const didDragRef = useRef(false);
  const DRAG_THRESHOLD_PX = 16;

  // Isolated drag handling for topbar only
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientY = (e as TouchEvent).touches
        ? (e as TouchEvent).touches[0].clientY
        : (e as MouseEvent).clientY;
      if (dragStartYRef.current == null) return;
      lastDeltaRef.current = clientY - dragStartYRef.current;
      if (Math.abs(lastDeltaRef.current) > DRAG_THRESHOLD_PX) {
        didDragRef.current = true;
        // Only preventDefault when actually dragging
        e.preventDefault();
      }
    };

    const handleUp = () => {
      const delta = lastDeltaRef.current;
      // Thresholds: drag down (>16) opens, drag up (<-16) closes
      if (delta > DRAG_THRESHOLD_PX) setIsOpen(true);
      if (delta < -DRAG_THRESHOLD_PX) setIsOpen(false);
      setIsDragging(false);
      dragStartYRef.current = null;
      lastDeltaRef.current = 0;
    };

    // Use passive where possible for better performance
    window.addEventListener('mousemove', handleMove as any, { passive: false });
    window.addEventListener('touchmove', handleMove as any, { passive: false });
    window.addEventListener('mouseup', handleUp, { passive: true });
    window.addEventListener('touchend', handleUp, { passive: true });
    window.addEventListener('touchcancel', handleUp, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleMove as any);
      window.removeEventListener('touchmove', handleMove as any);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchend', handleUp);
      window.removeEventListener('touchcancel', handleUp);
    };
  }, [isDragging]);

  const handleToggleClick = useCallback((e: React.MouseEvent) => {
    if (didDragRef.current) {
      // If a drag occurred, consume the click to avoid flicker
      e.preventDefault();
      e.stopPropagation();
      didDragRef.current = false;
      return;
    }
    // Isolated state update
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(prev => !prev);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    dragStartYRef.current = e.clientY;
    setIsDragging(true);
    didDragRef.current = false;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    dragStartYRef.current = e.touches[0].clientY;
    setIsDragging(true);
    didDragRef.current = false;
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartYRef.current = clientY;
    setIsDragging(true);
    didDragRef.current = false;
  }, []);

  // Don't render on desktop
  if (layoutType !== 'mobilePortrait' && layoutType !== 'mobileLandscape') {
    return null;
  }

  return (
    <>
      {/* Smart topbar handle centered - tap or drag to toggle */}
      <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[1001] pointer-events-auto">
        <button
          onClick={handleToggleClick}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          className={`px-3 py-2 rounded-full backdrop-blur-xl border text-white shadow-xl transition-colors duration-200 ${
            isOpen ? 'bg-blue-900/70 border-blue-300/30' : 'bg-blue-900/40 border-blue-300/20'
          }`}
          aria-label="Visa meny"
        >
          <div className="w-12 h-1.5 bg-white/85 rounded-full mx-auto" />
        </button>
      </div>

      {/* Ultra-modern Meta/Apple inspired collapsible top bar */}
      <div className={`fixed top-0 left-0 right-0 z-[1000] backdrop-blur-2xl bg-blue-950/70 border-b border-blue-300/20 shadow-[0_1px_24px_rgba(0,0,0,0.3)] transition-transform duration-300 ease-out ${
        isOpen ? 'translate-y-0' : '-translate-y-full'
      }`}>
        <div
          className="flex items-center h-[72px] px-4 select-none"
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
        >
          {/* Left: Title (mobile), no back button inside topbar */}
          <div className="flex items-center space-x-4 flex-1">
            <div className="text-left">
              <h1 className="text-lg font-semibold text-white tracking-tight">Havskarta</h1>
              <p className="text-white/70 text-xs font-medium">Marindata & väder</p>
            </div>
          </div>

          {/* Right: Profile only (no close X) */}
          <div className="flex items-center space-x-2">
            <UserMenu />
          </div>
        </div>
        
        {/* Controls section - below header */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-3">
            {/* Modern Kartlager dropdown */}
            <ModernDropdown
              label="Kartlager"
              value={showCurrentVectors ? 'vectors' : (activeLayer || 'temperature')}
              selectedValues={[
                activeLayer || 'temperature',
                ...(showCurrentVectors ? ['vectors'] : [])
              ]}
              onChange={(value) => {
                // När man väljer kartlager, stäng av simulering
                if (simulationLayer) {
                  setSimulationLayer(null);
                }
                
                if (value === 'current') {
                  setActiveLayer('current');
                  setShowCurrentVectors(true);
                } else if (value === 'vectors') {
                  setShowCurrentVectors(!showCurrentVectors);
                } else {
                  setShowCurrentVectors(false);
                  setActiveLayer(value as ImageLayerType);
                }
              }}
              options={[
                { value: 'current', label: 'Strömstyrka' },
                { value: 'vectors', label: 'Strömriktning' },
                { value: 'temperature', label: 'Temperatur' },
                { value: 'salinity', label: 'Salthalt' },
                { value: 'mackerel', label: 'Makrill' }
              ]}
              size="compact"
              maxWidth="140px"
            />
            
            {/* Modern Simulering dropdown */}
            <ModernDropdown
              label="Simulering"
              value={simulationLayer || ''}
              onChange={(value) => setSimulationLayer((value || null) as ImageLayerType | null)}
              options={[
                { value: '', label: 'Av' },
                { value: 'current', label: 'Strömstyrka' },
                { value: 'temperature', label: 'Temperatur' },
                { value: 'salinity', label: 'Salthalt' },
                { value: 'mackerel', label: 'Makrill' }
              ]}
              size="compact"
              maxWidth="130px"
            />
          </div>
        </div>
      </div>
    </>
  );
});

MobileTopbar.displayName = 'MobileTopbar';

export default MobileTopbar;