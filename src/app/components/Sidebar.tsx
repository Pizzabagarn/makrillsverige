// src/components/Sidebar.tsx

'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ClockKnob from './ClockKnob';
import { getLayoutType, type LayoutType } from '../../lib/layoutUtils';

interface SidebarProps {
  isHamburgerMenu?: boolean;
  // Layer control props
  showCurrentMagnitude?: boolean;
  showCurrentVectors?: boolean;
  onToggleCurrentMagnitude?: (show: boolean) => void;
  onToggleCurrentVectors?: (show: boolean) => void;
}

export default function Sidebar({ 
  isHamburgerMenu = false,
  showCurrentMagnitude = true,
  showCurrentVectors = true,
  onToggleCurrentMagnitude,
  onToggleCurrentVectors
}: SidebarProps) {
  const [layoutType, setLayoutType] = useState<LayoutType>('desktop');
  const [showMagnitudeInfo, setShowMagnitudeInfo] = useState(false);
  const [showVectorsInfo, setShowVectorsInfo] = useState(false);
  const [hoveredTooltip, setHoveredTooltip] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

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

  const isMobileLandscape = layoutType === 'mobileLandscape';
  const isMobilePortrait = layoutType === 'mobilePortrait';
  const isTabletLandscape = layoutType === 'tabletLandscape';
  const isMobile = isMobilePortrait || isMobileLandscape; // Only small mobile orientations
  const isTablet = layoutType === 'tablet';
  const isMobileOrTablet = isMobile || isTablet;
  
  // Responsiv styling baserat på om det är hamburgermenyn eller vanlig sidebar
  const getResponsiveStyles = () => {
    if (isHamburgerMenu) {
      // Specifik styling för hamburgermenyn - mycket kompakt
      return {
        padding: '0',
        titleSize: 'text-lg',
        titleMargin: 'mb-4',
        showDescription: false,
        showClock: false,
        titleText: 'Makrill'
      };
    } else if (isMobileLandscape || isTabletLandscape) {
      return {
        padding: 'clamp(0.25rem, 1vh, 0.75rem)',
        titleSize: 'text-sm',
        titleMargin: 'mb-2',
        showDescription: false,
        showClock: true,
        titleText: 'Makrill'
      };
    } else {
      return {
        padding: '1.5rem',
        titleSize: 'text-2xl',
        titleMargin: 'mb-3',
        showDescription: true,
        showClock: true,
        titleText: 'Makrill-Sverige'
      };
    }
  };

  const styles = getResponsiveStyles();

  // Handler för att toggla info på mobil
  const handleMagnitudeInfoClick = () => {
    if (isMobileOrTablet) {
      setShowMagnitudeInfo(!showMagnitudeInfo);
      setShowVectorsInfo(false); // Stäng andra
    }
  };

  const handleVectorsInfoClick = () => {
    if (isMobileOrTablet) {
      setShowVectorsInfo(!showVectorsInfo);
      setShowMagnitudeInfo(false); // Stäng andra
    }
  };

  // Handler för tooltips på desktop
  const handleTooltipMouseEnter = (type: string, event: React.MouseEvent) => {
    if (!isMobileOrTablet) {
      const rect = event.currentTarget.getBoundingClientRect();
      setTooltipPosition({
        x: rect.right + 16, // 16px margin från högerkanten
        y: rect.top
      });
      setHoveredTooltip(type);
    }
  };

  const handleTooltipMouseLeave = () => {
    if (!isMobileOrTablet) {
      setHoveredTooltip(null);
    }
  };
  
  return (
    <>
    <div 
      className={`h-full w-full ${!isHamburgerMenu ? 'backdrop-blur-sm bg-black/30 border-r border-white/10' : ''} text-white flex flex-col justify-between`} 
      style={{ padding: styles.padding }}
    >
      <div>
        {/* RUBRIK & TEXT */}
        <h1 className={`font-bold bg-gradient-to-r from-orange-200 via-yellow-300 to-pink-300 bg-clip-text text-transparent drop-shadow ${styles.titleSize} ${styles.titleMargin}`}>
          {styles.titleText}
        </h1>
        
        {styles.showDescription && (
            <p className="text-sm text-white/90 leading-snug mb-6">
            Utforska väder, havsdata och makrillens rörelser längs Sveriges västkust och Öresund.
          </p>
        )}

          {/* KARTLAGER - nu huvudinnehållet istället för meny */}
          {onToggleCurrentMagnitude && onToggleCurrentVectors && (
            <div className="space-y-4">
              <h2 className={`font-semibold text-white/95 ${isHamburgerMenu ? 'text-sm' : 'text-base'}`}>
                Kartlager
              </h2>
              
              {/* Strömstyrka toggle */}
              <div className="space-y-3">
                <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-lg p-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {/* Info-ikon på vänster sida för mobil */}
                      {isMobileOrTablet && (
                        <button
                          onClick={handleMagnitudeInfoClick}
                          className="mr-2 p-1 hover:bg-white/20 rounded-full transition-all duration-200"
                        >
                          <svg className="w-3 h-3 text-white/70" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                      
                      <span 
                        className={`text-white/90 flex items-center ${isHamburgerMenu ? 'text-xs' : 'text-sm'} ${!isMobileOrTablet ? 'cursor-help' : ''}`}
                        onMouseEnter={!isMobileOrTablet ? (e) => handleTooltipMouseEnter('magnitude', e) : undefined}
                        onMouseLeave={!isMobileOrTablet ? handleTooltipMouseLeave : undefined}
                      >
                        <div className="w-2.5 h-2.5 mr-2 rounded-sm bg-gradient-to-r from-blue-500 via-green-500 via-yellow-500 to-red-500"></div>
                        Strömstyrka
                      </span>
                    </div>
                    
                    <button
                      onClick={(e) => {
                        console.log('🔘 Magnitude toggle clicked, current state:', showCurrentMagnitude);
                        e.stopPropagation();
                        onToggleCurrentMagnitude(!showCurrentMagnitude);
                        console.log('🔘 Magnitude toggle should be:', !showCurrentMagnitude);
                      }}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-300 ease-in-out shadow-md hover:shadow-lg ${
                        showCurrentMagnitude 
                          ? 'bg-blue-600 shadow-blue-500/30' 
                          : 'bg-gray-600 shadow-gray-600/20'
                      } hover:scale-105 active:scale-95`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-all duration-300 ease-in-out shadow-sm ${
                          showCurrentMagnitude ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                      {/* Glowing effect when active */}
                      {showCurrentMagnitude && (
                        <div className="absolute inset-0 rounded-full bg-blue-400/20 animate-pulse"></div>
                      )}
                    </button>
                  </div>
                </div>

                {/* Strömpilar toggle */}
                <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-lg p-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {/* Info-ikon på vänster sida för mobil */}
                      {isMobileOrTablet && (
                        <button
                          onClick={handleVectorsInfoClick}
                          className="mr-2 p-1 hover:bg-white/20 rounded-full transition-all duration-200"
                        >
                          <svg className="w-3 h-3 text-white/70" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                      
                      <span 
                        className={`text-white/90 flex items-center ${isHamburgerMenu ? 'text-xs' : 'text-sm'} ${!isMobileOrTablet ? 'cursor-help' : ''}`}
                        onMouseEnter={!isMobileOrTablet ? (e) => handleTooltipMouseEnter('vectors', e) : undefined}
                        onMouseLeave={!isMobileOrTablet ? handleTooltipMouseLeave : undefined}
                      >
                        <svg className="w-2.5 h-2.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10.293 15.707a1 1 0 010-1.414L14.586 10l-4.293-4.293a1 1 0 111.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          <path fillRule="evenodd" d="M3 10a1 1 0 011-1h10a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                        </svg>         
                        Strömpilar
                      </span>
                    </div>
                    
                    <button
                      onClick={(e) => {
                        console.log('🔘 Vectors toggle clicked, current state:', showCurrentVectors);
                        e.stopPropagation();
                        onToggleCurrentVectors(!showCurrentVectors);
                        console.log('🔘 Vectors toggle should be:', !showCurrentVectors);
                      }}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-300 ease-in-out shadow-md hover:shadow-lg ${
                        showCurrentVectors 
                          ? 'bg-blue-600 shadow-blue-500/30' 
                          : 'bg-gray-600 shadow-gray-600/20'
                      } hover:scale-105 active:scale-95`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-all duration-300 ease-in-out shadow-sm ${
                          showCurrentVectors ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                      {/* Glowing effect when active */}
                      {showCurrentVectors && (
                        <div className="absolute inset-0 rounded-full bg-blue-400/20 animate-pulse"></div>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
      </div>

      {/* Clock - dölj för små mobila lägen och hamburgermenyn */}
      {styles.showClock && !isMobile && (
          <div className={`${(isMobileLandscape || isTabletLandscape) ? 'mt-2' : 'mt-6'}`}>
          <ClockKnob />
        </div>
      )}
        
        {/* Mobile Toast Notifications - fixed positioned */}
        {isMobileOrTablet && (showMagnitudeInfo || showVectorsInfo) && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] max-w-sm mx-4">
            <div className="bg-black/90 text-white text-sm rounded-lg p-4 shadow-2xl border border-white/20 backdrop-blur-sm">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {showMagnitudeInfo && (
                    <div className="flex items-start space-x-2">
                      <div className="w-3 h-3 mt-0.5 rounded-sm bg-gradient-to-r from-blue-500 via-green-500 via-yellow-500 to-red-500 flex-shrink-0"></div>
                      <div>
                        <p className="font-medium mb-1">Strömstyrka</p>
                        <p className="text-xs text-white/80 leading-relaxed">
                          Visas som färgade zoner från blå (lugnt) till röd (starkt). Baserat på DMI oceandata.
                        </p>
                      </div>
                    </div>
                  )}
                  {showVectorsInfo && (
                    <div className="flex items-start space-x-2">
                      <svg className="w-3 h-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10.293 15.707a1 1 0 010-1.414L14.586 10l-4.293-4.293a1 1 0 111.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        <path fillRule="evenodd" d="M3 10a1 1 0 011-1h10a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                      </svg>
                      <div>
                        <p className="font-medium mb-1">Strömpilar</p>
                        <p className="text-xs text-white/80 leading-relaxed">
                          Visar riktning och styrka för vattenströmmar. Pilarna pekar i strömriktningen.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowMagnitudeInfo(false);
                    setShowVectorsInfo(false);
                  }}
                  className="ml-3 text-white/60 hover:text-white/80 transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Fixed Tooltips - rendered to body via portal */}
      {typeof window !== 'undefined' && !isMobileOrTablet && hoveredTooltip && createPortal(
        <>
          {hoveredTooltip === 'magnitude' && (
            <div 
              className="fixed w-64 bg-black/95 text-white text-xs rounded-lg p-3 shadow-2xl border border-white/30 backdrop-blur-md pointer-events-none"
              style={{
                left: `${tooltipPosition.x}px`,
                top: `${tooltipPosition.y}px`,
                zIndex: 999999,
              }}
            >
              <p className="leading-relaxed">
                <strong>Strömstyrka</strong> visas som färgade zoner från blå (lugnt) till röd (starkt). Baserat på DMI oceandata.
              </p>
            </div>
          )}
          {hoveredTooltip === 'vectors' && (
            <div 
              className="fixed w-64 bg-black/95 text-white text-xs rounded-lg p-3 shadow-2xl border border-white/30 backdrop-blur-md pointer-events-none"
              style={{
                left: `${tooltipPosition.x}px`,
                top: `${tooltipPosition.y}px`,
                zIndex: 999999,
              }}
            >
              <p className="leading-relaxed">
                <strong>Strömpilar</strong> visar riktning och styrka för vattenströmmar. Pilarna pekar i strömriktningen.
              </p>
            </div>
          )}
        </>,
        document.body
      )}
    </>
  );
}