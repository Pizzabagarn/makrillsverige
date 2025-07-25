//src/app/map/page.tsx

'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { getLayoutType, shouldShowMobileSlider, type LayoutType } from '../../lib/layoutUtils';
import { useLayer } from '../context/LayerContext';
import { useImageLayer, type ImageLayerType } from '../context/ImageLayerContext';
import { useSimulationLayer } from '../context/SimulationContext';
import LayerPreloadingManager, { type PreloadStatus } from '@/lib/layerPreloadingManager';
import PopupPreloadManager from '@/lib/popupPreloadManager';
import { useCacheOptimization } from '@/lib/throttleHooks';
import { Loader2 } from 'lucide-react';
import ValidationDashboard from '../components/FishingValidationDashboard';

const MapView = dynamic(() => import('../components/Map'), { ssr: false });
const ClockKnob = dynamic(() => import('../components/ClockKnob'), { ssr: false });
const SimulationPlayer = dynamic(() => import('../components/SimulationPlayer'), { ssr: false });

export default function MapPage() {
  const [layoutType, setLayoutType] = useState<LayoutType>('desktop');
  const { simulationLayer, setSimulationLayer } = useSimulationLayer();
  
  // Layer state från LayerContext - kontrolleras nu från sidebaren
  const { showCurrentVectors } = useLayer();
  
  // NYTT: Global cache-optimering
  const { isLowEndDevice, optimizeForDevice, clearApiCache } = useCacheOptimization();

  // Loading states för karta - BARA ÄNDRING: Visa kartan direkt
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('Laddar marindata...');
  


  useEffect(() => {
    const checkLayout = () => {
      setLayoutType(getLayoutType());
    };
    
    checkLayout();
    window.addEventListener('resize', checkLayout);
    window.addEventListener('orientationchange', checkLayout);
    
    // FÖRBÄTTRAD: Anpassa global preloading baserat på enhet
    const startPreloading = () => {
      const preloadingManager = LayerPreloadingManager.getInstance();
      
      // Lyssna på preloading progress för critical layers
      let startTime = Date.now();
      const checkProgress = () => {
        // Kontrollera critical layer (current-magnitude)
        const currentMagnitudeStatus = preloadingManager.getPreloadingStatus('current-magnitude');
        const elapsed = Date.now() - startTime;
        
        // Uppdatera meddelande baserat på tid
        if (elapsed > 10000) {
          setLoadingMessage('Laddar fortfarande... Detta kan ta tid på svag anslutning');
        } else if (elapsed > 5000) {
          setLoadingMessage('Laddar strömdata...');
        }
        
        if (currentMagnitudeStatus) {
          const progress = currentMagnitudeStatus.progress;
          setLoadingProgress(progress);
          
          // INGEN BLOCKERING: Kartan visas ändå medan data laddar
          if (currentMagnitudeStatus.status === 'loaded' || progress > 0.2) {
            // Data laddat men kartan visas redan
            clearInterval(progressInterval);
            clearTimeout(timeoutId);
          }
        } else {
          // Om ingen status finns än, öka progress gradvis (fallback)
          setLoadingProgress(prev => Math.min(prev + 3, 85));
        }
      };

      // Starta progress-checking
      const progressInterval = setInterval(checkProgress, 500);
      
      // Cleanup interval efter 15 sekunder (kortare för bättre UX)
      const timeoutId = setTimeout(() => {
        clearInterval(progressInterval);
        setLoadingProgress(100);
      }, 15000);
      
      if (isLowEndDevice) {
        console.log('📱 Svag enhet - begränsar preloading');
        // Vänta lite innan preloading startar
        setTimeout(() => {
          preloadingManager.startPreloading();
          // För mobila enheter, kortare tid men kartan visas ändå
          setTimeout(() => {
            clearInterval(progressInterval);
            clearTimeout(timeoutId);
          }, 3000);
        }, 500);
      } else {
        preloadingManager.startPreloading();
        // För desktop, data laddar i bakgrunden
        setTimeout(() => {
          clearInterval(progressInterval);
          clearTimeout(timeoutId);
        }, 5000); // Fallback
      }

      // Returnera cleanup funktion
      return () => {
        clearInterval(progressInterval);
        clearTimeout(timeoutId);
      };
    };
    
    // Starta preloading
    const preloadingCleanup = startPreloading();
    
    // FÖRBÄTTRAD: Popup preloading endast för starka enheter
    if (!isLowEndDevice) {
      const popupPreloadManager = PopupPreloadManager.getInstance();
      popupPreloadManager.startPreloading().catch(error => {
        console.error('❌ Fel vid popup preloading:', error);
      });
    }
    
    // NYTT: Rensa API-cache periodiskt - MINSKAT för bättre stabilitet
    const cacheCleanupInterval = setInterval(() => {
      clearApiCache();
    }, 30 * 60 * 1000); // Ändrat från 10 minuter till 30 minuter för färre re-renders // Var 10:e minut
    
    return () => {
      window.removeEventListener('resize', checkLayout);
      window.removeEventListener('orientationchange', checkLayout);
      clearInterval(cacheCleanupInterval);
      // Cleanup preloading progress tracking
      if (preloadingCleanup) preloadingCleanup();
    };
  }, [isLowEndDevice, clearApiCache]);

  // NYTT: Optimera för enheten efter initial laddning
  useEffect(() => {
    if (isLowEndDevice) {
      // Optimera efter att appen har laddat
      const timer = setTimeout(optimizeForDevice, 5000);
      return () => clearTimeout(timer);
    }
  }, [isLowEndDevice, optimizeForDevice]);



  return (
    <div className="map-page max-h-dvh h-full w-full flex flex-col lg:flex-row overflow-hidden">
      {/* Map Loading Overlay - inte används längre */}
      {isMapLoading && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center">
          <div className="text-center max-w-md px-4">
            <Loader2 className="w-12 h-12 animate-spin text-white mx-auto mb-4" />
            <p className="text-white font-light text-lg mb-2">{loadingMessage}</p>
            <div className="w-64 bg-white/20 rounded-full h-2 mx-auto">
              <div 
                className="bg-blue-400 h-2 rounded-full transition-all duration-300"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <p className="text-white/60 text-sm mt-2">{Math.round(loadingProgress)}% laddat</p>
            <p className="text-white/40 text-xs mt-3">Strömdata laddar i bakgrunden från startsidan</p>
          </div>
        </div>
              )}

      {/* KARTA - VISAS ALLTID DIREKT MED ORIGINALSTRUKTUR */}
      <div 
        className="flex-1 relative overflow-hidden"
        style={{
          paddingBottom: layoutType === 'mobileLandscape' ? '25vh' : '0'
        }}
      >
        <MapView 
          showZoom={false}
          showCurrentVectors={showCurrentVectors}
        />
        
        {/* Lager-kontroller flyttade till sidebaren - ingen overlay längre */}
        
        {/* Simulation Player */}
        <SimulationPlayer 
          simulationLayer={simulationLayer}
          onLayerChange={setSimulationLayer}
        />
        
        {/* NYTT: Visa optimering-status för debugging */}
        {isLowEndDevice && (
          <div className="absolute bottom-4 left-4 bg-yellow-500/20 text-yellow-100 px-2 py-1 rounded text-xs">
            📱 Mobil-optimering aktiv
          </div>
        )}
      </div>

      {/* MOBIL (PORTRAIT & SMALL LANDSCAPE): ClockKnob under/över kartan */}
      {(layoutType === 'mobilePortrait' || layoutType === 'mobileLandscape') && (
        <div
          className={`w-full px-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.45)] border-x border-b border-white/10 ring-1 ring-white/10 flex flex-col justify-center ${
            layoutType === 'mobileLandscape' 
              ? 'h-[25vh] fixed bottom-0 left-0 right-0 z-[1001]' 
              : 'h-[18vh] z-10'
          }`}
          style={{ ['--mtscale' as any]: `calc(${layoutType === 'mobileLandscape' ? '25vh' : '18vh'} / 120px)` } as React.CSSProperties}
        >
          <ClockKnob />
        </div>
      )}
      
      {/* Cache Debug Panel - endast synlig på utveckling eller vid behov */}
    </div>
  );
} 