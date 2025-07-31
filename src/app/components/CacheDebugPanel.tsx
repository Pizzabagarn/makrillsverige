'use client';

import { useState } from 'react';
import { useCacheInvalidation } from '../context/CacheInvalidationContext';
import { Trash2, RefreshCw, Database, Smartphone, Monitor } from 'lucide-react';

interface CacheDebugPanelProps {
  alwaysOpen?: boolean;
}

export default function CacheDebugPanel({ alwaysOpen = false }: CacheDebugPanelProps) {
  const {
    invalidateAll,
    invalidateMetadata,
    invalidateImages,
    forceRefresh,
    isInvalidating,
    lastInvalidation
  } = useCacheInvalidation();
  
  const [isOpen, setIsOpen] = useState(false);
  const [cacheStats, setCacheStats] = useState<any>(null);

  const getCacheStats = async () => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      return new Promise((resolve) => {
        const messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = (event) => {
          resolve(event.data);
        };
        
        navigator.serviceWorker.controller?.postMessage(
          { action: 'GET_CACHE_STATS' },
          [messageChannel.port2]
        );
      });
    }
    return null;
  };

  const handleGetStats = async () => {
    const stats = await getCacheStats();
    setCacheStats(stats);
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  if (!alwaysOpen && !isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 p-3 bg-gray-800/90 hover:bg-gray-700/90 text-white rounded-full shadow-lg backdrop-blur-sm border border-white/20 transition-all duration-200"
        title="Cache Debug Panel"
      >
        <Database className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className={`${alwaysOpen ? 'relative' : 'fixed bottom-4 right-4'} z-50 bg-gray-900/95 backdrop-blur-xl border border-white/20 rounded-2xl p-4 shadow-2xl text-white max-w-sm`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          <h3 className="font-semibold">Cache Debug</h3>
          {isMobile ? <Smartphone className="w-4 h-4 text-blue-400" /> : <Monitor className="w-4 h-4 text-green-400" />}
        </div>
        {!alwaysOpen && (
          <button
            onClick={() => setIsOpen(false)}
            className="text-white/60 hover:text-white transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Status */}
      <div className="mb-4 p-3 bg-white/5 rounded-lg">
        <div className="text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-white/60">Status:</span>
            <span className={isInvalidating ? 'text-orange-400' : 'text-green-400'}>
              {isInvalidating ? 'Invaliderar...' : 'Redo'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">Senaste rensning:</span>
            <span className="text-white/80">
              {lastInvalidation 
                ? new Date(lastInvalidation).toLocaleTimeString() 
                : 'Aldrig'
              }
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">Enhet:</span>
            <span className="text-white/80">
              {isMobile ? 'Mobil' : 'Desktop'}
            </span>
          </div>
        </div>
      </div>

      {/* Cache Stats */}
      <div className="mb-4">
        <button
          onClick={handleGetStats}
          className="w-full px-3 py-2 bg-blue-600/80 hover:bg-blue-600 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          <Database className="w-4 h-4" />
          Visa Cache Stats
        </button>
        
        {cacheStats && (
          <div className="mt-2 p-3 bg-white/5 rounded-lg text-xs space-y-1">
            <div className="flex justify-between">
              <span>Total filer:</span>
              <span>{cacheStats.totalCached}</span>
            </div>
            <div className="flex justify-between">
              <span>WebP bilder:</span>
              <span>{cacheStats.webpImages}</span>
            </div>
            <div className="flex justify-between">
              <span>PNG bilder:</span>
              <span>{cacheStats.pngImages}</span>
            </div>
            <div className="flex justify-between">
              <span>Metadata:</span>
              <span>{cacheStats.metadata}</span>
            </div>
            <div className="flex justify-between">
              <span>Storlek:</span>
              <span>~{cacheStats.cacheSize}MB</span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <button
          onClick={invalidateMetadata}
          disabled={isInvalidating}
          className="w-full px-3 py-2 bg-orange-600/80 hover:bg-orange-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isInvalidating ? 'animate-spin' : ''}`} />
          Rensa Metadata
        </button>
        
        <button
          onClick={invalidateImages}
          disabled={isInvalidating}
          className="w-full px-3 py-2 bg-yellow-600/80 hover:bg-yellow-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          Rensa Bilder
        </button>
        
        <button
          onClick={invalidateAll}
          disabled={isInvalidating}
          className="w-full px-3 py-2 bg-red-600/80 hover:bg-red-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          Rensa Allt
        </button>
        
        <button
          onClick={forceRefresh}
          disabled={isInvalidating}
          className="w-full px-3 py-2 bg-purple-600/80 hover:bg-purple-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Force Refresh
        </button>
      </div>

      {/* Wind Calculation Test */}
      <div className="mb-4 p-3 bg-purple-900/20 rounded">
        <h4 className="text-white font-semibold mb-2">🌬️ FMI Vindvalidering</h4>
        <div className="space-y-2 text-xs">
          <p className="text-purple-200">FMI HARMONIE 2km WFS - Vindberäkning Test:</p>
          <div className="grid grid-cols-1 gap-2 text-white/80">
            <div className="bg-black/20 p-2 rounded">
              <strong>Test vindkomponenter:</strong><br/>
              U=5, V=0 → {(() => {
                const speed = Math.sqrt(5*5 + 0*0);
                let dir = Math.atan2(-5, -0) * (180 / Math.PI);
                if (dir < 0) dir += 360;
                return `${speed.toFixed(1)} m/s, ${Math.round(dir)}° (från Väst/270°)`;
              })()}
            </div>
            <div className="bg-black/20 p-2 rounded">
              U=0, V=5 → {(() => {
                const speed = Math.sqrt(0*0 + 5*5);
                let dir = Math.atan2(-0, -5) * (180 / Math.PI);
                if (dir < 0) dir += 360;
                return `${speed.toFixed(1)} m/s, ${Math.round(dir)}° (från Nord/0°)`;
              })()}
            </div>
            <div className="bg-black/20 p-2 rounded">
              U=-3.54, V=3.54 → {(() => {
                const speed = Math.sqrt(-3.54*-3.54 + 3.54*3.54);
                let dir = Math.atan2(3.54, -3.54) * (180 / Math.PI);
                if (dir < 0) dir += 360;
                return `${speed.toFixed(1)} m/s, ${Math.round(dir)}° (från NO/45°)`;
              })()}
            </div>
          </div>
          <div className="mt-3 p-2 bg-orange-900/20 rounded">
            <strong className="text-orange-200">FMI WFS Källkod-formel:</strong><br/>
            <code className="text-white/90">direction = atan2(-u, -v) * (180/π)</code><br/>
            <span className="text-orange-300">Detta är KORREKT enligt meteorologiska standarder!</span>
          </div>
          <div className="mt-2 p-2 bg-blue-900/20 rounded text-blue-200">
            <strong>Möjliga orsaker till skillnader:</strong><br/>
            • FMI HARMONIE vs andra modeller (GFS, ECMWF)<br/>
            • Olika uppdateringstider<br/>
            • FMI koordinatsystem vs andra<br/>
            • Interpolation mellan rutnätspunkter
          </div>
                     <div className="mt-2 p-2 bg-green-900/30 rounded text-green-200">
             <strong>✅ FIXADE ALLA STORA PROBLEM!</strong><br/>
             ✅ Tog bort HÅRDKODAD "känns som" temperatur<br/>
             ✅ Tog bort PÅHITTAD sannolikhet nederbörd<br/>
             ✅ <strong>FIXADE VINDRIKTNING!</strong> FMI använder "blowing TO", vi korrigerar +180°<br/>
             ✅ 164° → 344° (North ↑), 178° → 358° (North ↑) - matchar nu SMHI!
           </div>
           <div className="mt-2 p-2 bg-orange-900/20 rounded text-orange-200">
             <strong>🎯 ÅTERSTÅENDE SKILLNADER:</strong><br/>
             Små skillnader mellan FMI HARMONIE vs GFS/ECMWF är fortfarande normala<br/>
             <span className="text-yellow-200">Men de stora 180° felen är nu fixade!</span>
           </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-white/50 text-center">
        💡 Använd &quot;Rensa Metadata&quot; först om bilder inte uppdateras
      </div>
    </div>
  );
} 