'use client';

import { useState } from 'react';
import { X, Navigation, Car, Bike, User, ChevronDown, ChevronUp } from 'lucide-react';
import { 
  Route, 
  TransportMode, 
  formatDistance, 
  formatDuration,
  getTransportLabel 
} from '@/lib/routingService';
import { LayoutType } from '@/lib/layoutUtils';

interface NavigationPanelProps {
  route: Route | null;
  destinationName: string;
  loading: boolean;
  onClose: () => void;
  onTransportChange: (mode: TransportMode) => void;
  currentMode: TransportMode;
  layoutType: LayoutType;
}

export default function NavigationPanel({
  route,
  destinationName,
  loading,
  onClose,
  onTransportChange,
  currentMode,
  layoutType
}: NavigationPanelProps) {
  const [showInstructions, setShowInstructions] = useState(false);

  // Keep panel visible even before route is ready

  const isMobile = layoutType === 'mobilePortrait' || layoutType === 'mobileLandscape';

  // Mini höjdprofil (sparkline)
  const ElevationSparkline = ({ profile }: { profile: { d: number; z: number; g?: number }[] }) => {
    if (!profile || profile.length < 2) return null;
    const width = 240;
    const height = 40;
    const pad = 2;
    const maxD = Math.max(profile[profile.length - 1].d, 1);
    let minZ = Infinity, maxZ = -Infinity;
    for (const p of profile) { if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z; }
    const spanZ = Math.max(maxZ - minZ, 1);
    const toX = (d: number) => pad + (d / maxD) * (width - 2 * pad);
    const toY = (z: number) => pad + (1 - (z - minZ) / spanZ) * (height - 2 * pad);
    const points = profile.map(p => `${toX(p.d)},${toY(p.z)}`).join(' ');
    return (
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="40" className="block">
        <defs>
          <linearGradient id="elevStroke" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22d3ee"/>
            <stop offset="100%" stopColor="#38bdf8"/>
          </linearGradient>
        </defs>
        <polyline points={points} fill="none" stroke="url(#elevStroke)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  // Mobile: Compact bottom panel
  if (isMobile) {
    return (
      <div className={`absolute ${layoutType === 'mobileLandscape' ? 'bottom-2 left-2 right-2' : 'bottom-4 left-4 right-4'} z-[1000]`}>
        <div className="bg-gradient-to-br from-slate-900/98 to-slate-800/98 backdrop-blur-xl rounded-2xl border border-slate-600/50 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-slate-600/50">
            <div className="flex items-center space-x-2 flex-1 min-w-0">
              <Navigation className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white truncate">{destinationName}</h3>
                {route && (
                  <div>
                    {/* Total restid som primärt värde */}
                    <p className="text-base font-semibold text-white leading-tight">
                      {formatDuration(route.summary.duration)}
                    </p>
                    {/* Chips för bil/gång */}
                    {currentMode !== 'foot-walking' && (
                      <div className="mt-0.5 flex items-center gap-1">
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-700/60 text-slate-200 border border-slate-600/50">
                          Bil {route?.partialGeometries?.vehicle ? '' : '(n/a)'}{route?.partialGeometries?.vehicle && route?.segments?.length ? ` ${formatDuration((route.summary.duration - (route.walkDurationSeconds||0)) || 0)}` : ''}
                        </span>
                        {typeof route.walkDurationSeconds === 'number' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-700/60 text-slate-200 border border-slate-600/50">
                            Gång {formatDuration(route.walkDurationSeconds)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-600/50 transition-all flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Loading eller ingen rutt än */}
          {(loading || !route) && (
            <div className="p-4 flex items-center justify-center">
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-cyan-400 border-t-transparent"></div>
                  <span className="ml-2 text-sm text-slate-300">Beräknar rutt...</span>
                </>
              ) : (
                <span className="text-sm text-slate-400">Välj färdmedel för att se rutt</span>
              )}
            </div>
          )}

          {/* Content */}
          {route && !loading && (
            <div className="p-3 space-y-2">
              {/* Transport mode selector */}
              <div className="flex space-x-2">
                <button
                  onClick={() => onTransportChange('driving-car')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                    currentMode === 'driving-car'
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Car className="w-4 h-4 mx-auto mb-1" />
                  Bil
                </button>
                <button
                  onClick={() => onTransportChange('cycling-regular')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                    currentMode === 'cycling-regular'
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Bike className="w-4 h-4 mx-auto mb-1" />
                  Cykel
                </button>
                <button
                  onClick={() => onTransportChange('foot-walking')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                    currentMode === 'foot-walking'
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <User className="w-4 h-4 mx-auto mb-1" />
                  Gång
                </button>
              </div>

              {/* Varning för direkt linje utan vägar */}
              {route.isDirectPath && (
                <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-2">
                  <p className="text-xs text-yellow-200">
                    ⚠️ Ingen gångväg hittades. Visa direkt linje med höjdprofil.
                  </p>
                </div>
              )}

              {/* Gång till vattnet - sammanfattning */}
              {currentMode !== 'foot-walking' && typeof route.distanceRoadToWaterMeters === 'number' && route.distanceRoadToWaterMeters > 0 && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-2">
                  <div className="text-[11px] text-slate-200 font-medium mb-1">Gång till vattnet</div>
                  <div className="text-[11px] text-slate-300">
                    Distans {formatDistance(route.distanceRoadToWaterMeters)}
                    {route.terrain && (
                      <>
                        {' '}• Stigning +{Math.round(route.terrain.netAscentMeters ?? route.terrain.elevationGainMeters)} m
                        {' '}• Fall −{Math.round(route.terrain.elevationLossMeters)} m
                        {typeof route.terrain.maxGradePercent === 'number' && (
                          <> {' '}• Maxlutning {Math.round(route.terrain.maxGradePercent)}%</>
                        )}
                      </>
                    )}
                  </div>
                  {typeof route.walkDurationSeconds === 'number' && (
                    <div className="text-[11px] text-slate-400 mt-1">Beräknad gångtid: {formatDuration(route.walkDurationSeconds)} (Naismith)</div>
                  )}
                  {/* Sparkline */}
                  {route.terrain?.profile && (
                    <div className="mt-2">
                      <ElevationSparkline profile={route.terrain.profile as any} />
                    </div>
                  )}
                  {route.terrain?.isSteepTerrain && (
                    <div className="text-[11px] text-yellow-300 mt-1">⚠️ Brant terräng</div>
                  )}
                  {route.terrain?.elevationSource === 'eudem' && (
                    <div className="text-[10px] text-slate-400 mt-1">Datakvalitet: EU‑DEM 25m</div>
                  )}
                </div>
              )}

              {/* Instructions toggle (default collapsed) */}
              {route.segments[0]?.steps && (
                <button
                  onClick={() => setShowInstructions(!showInstructions)}
                  className="w-full py-2 px-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-sm text-white flex items-center justify-between transition-all"
                >
                  <span>Vägbeskrivning ({route.segments[0].steps.length} steg)</span>
                  {showInstructions ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
              )}

              {/* Instructions list */}
              {showInstructions && route.segments[0]?.steps && (
                <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg bg-slate-800/50 p-2">
                  {route.segments[0].steps.map((step, index) => (
                    <div key={index} className="text-xs text-slate-300 py-1 border-b border-slate-700/50 last:border-b-0">
                      <div className="font-medium text-white">{index + 1}. {step.instruction}</div>
                      {step.distance > 0 && (
                        <div className="text-slate-400 mt-0.5">{formatDistance(step.distance)}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Desktop: Right sidebar panel
  return (
    <div className="absolute top-4 left-4 w-full max-w-sm bg-gradient-to-br from-slate-900/98 to-slate-800/98 backdrop-blur-xl rounded-2xl border border-slate-600/50 shadow-2xl z-[1000]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-600/50 bg-gradient-to-r from-cyan-900/30 to-cyan-800/20">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
              <div className="p-2 bg-cyan-600/20 rounded-lg">
                <Navigation className="w-5 h-5 text-cyan-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-white truncate">{destinationName}</h3>
                {route && (
                  <div>
                    <p className="text-sm text-cyan-300">
                      {formatDistance(route.summary.distance)} • {formatDuration(route.summary.duration)}
                      {(route.partialGeometries?.vehicle && currentMode !== 'foot-walking') ? ' totalt' : ''}
                    </p>
                    {route.partialGeometries?.vehicle && currentMode !== 'foot-walking' && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {currentMode === 'driving-car' ? '🚗' : '🚴'} + 🚶 Multimodal
                      </p>
                    )}
                    {route.partialGeometries?.vehicle && currentMode !== 'foot-walking' && typeof route.distanceRoadToWaterMeters === 'number' && route.distanceRoadToWaterMeters > 0 && (
                      <div className="mt-1">
                        <p className="text-sm text-cyan-300">
                          Sista biten: {formatDistance(route.distanceRoadToWaterMeters)}
                          {typeof route.walkDurationSeconds === 'number' && route.walkDurationSeconds > 0 && (
                            <> • {formatDuration(route.walkDurationSeconds)}</>
                          )}
                        </p>
                        {route.terrain && route.terrain.elevationGainMeters > 100 && (
                          <div className="text-sm text-yellow-300">⚠️ Brant terräng</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
        <button
          onClick={onClose}
          className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-600/50 transition-all flex-shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Loading eller ingen rutt än */}
      {(loading || !route) && (
        <div className="p-8 flex flex-col items-center justify-center">
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-cyan-400 border-t-transparent mb-4"></div>
              <span className="text-sm text-slate-300">Beräknar rutt...</span>
            </>
          ) : (
            <span className="text-sm text-slate-400">Välj färdmedel ovan för att beräkna rutt</span>
          )}
        </div>
      )}

      {/* Content */}
      {route && !loading && (
        <div className="p-4 space-y-4">
          {/* Transport mode selector */}
          <div>
            <label className="text-xs font-medium text-slate-400 mb-2 block">Färdsätt</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => onTransportChange('driving-car')}
                className={`py-3 px-2 rounded-xl text-sm font-medium transition-all ${
                  currentMode === 'driving-car'
                    ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30'
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Car className="w-5 h-5 mx-auto mb-1" />
                Bil
              </button>
              <button
                onClick={() => onTransportChange('cycling-regular')}
                className={`py-3 px-2 rounded-xl text-sm font-medium transition-all ${
                  currentMode === 'cycling-regular'
                    ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30'
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Bike className="w-5 h-5 mx-auto mb-1" />
                Cykel
              </button>
              <button
                onClick={() => onTransportChange('foot-walking')}
                className={`py-3 px-2 rounded-xl text-sm font-medium transition-all ${
                  currentMode === 'foot-walking'
                    ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30'
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <User className="w-5 h-5 mx-auto mb-1" />
                Gång
              </button>
            </div>
          </div>

          {/* Varning för direkt linje utan vägar */}
          {route.isDirectPath && (
            <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-3">
              <p className="text-sm text-yellow-200">
                ⚠️ Ingen gångväg hittades. Visar direkt linje med höjdprofil.
              </p>
            </div>
          )}

          {/* Instructions */}
          {route.segments[0]?.steps && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-slate-400">Vägbeskrivning</label>
                <span className="text-xs text-slate-500">{route.segments[0].steps.length} steg</span>
              </div>
              <div className="max-h-96 overflow-y-auto space-y-2 rounded-xl bg-slate-800/50 p-3">
                {route.segments[0].steps.map((step, index) => (
                  <div key={index} className="text-sm p-3 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-all">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0 w-6 h-6 bg-cyan-600/20 text-cyan-400 rounded-full flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-medium">{step.instruction}</div>
                        {step.distance > 0 && (
                          <div className="text-slate-400 text-xs mt-1">{formatDistance(step.distance)}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

