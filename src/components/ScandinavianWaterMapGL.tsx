'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import { X, ExternalLink, Thermometer, Navigation, Car, Bike, User, ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { WaterBodyData } from '@/lib/waterBodyDataFetcher';
import { getLayoutType, type LayoutType } from '@/lib/layoutUtils';
import { getSwedishWaterTypeName, formatWaterType } from '@/lib/waterTypeTranslation';
import {
  SMHIWaterBody,
  SMHIWaterBodySearchResult,
  getSMHIWaterBodiesInBounds,
  getSMHIWaterBodyDetails,
  getSMHIWaterBodyAtCoordinates
} from '@/lib/smhiWaterService';

// NEW: Import the enhanced service with place names
import {
  WaterBodyWithPlaces,
  getWaterBodyWithPlacesAtCoordinates,
  getWaterBodyWithPlacesDetails,
  convertToSMHIFormat
} from '@/lib/waterBodiesWithPlacesService';

// Import routing services
import { Route, TransportMode, getRoute, formatDistance, formatDuration } from '@/lib/routingService';
import { findNearestShorePoint } from '@/lib/smartRoutingService';

// FEATURE FLAG: Use new system with place names
const USE_PLACES_SYSTEM = true;

interface WaterBodyInfoPanelProps {
  waterBody: SMHIWaterBody | null;
  waterData: WaterBodyData | null;
  loading: boolean;
  onClose: () => void;
  onNavigate?: () => void;
  layoutType: LayoutType;
  // Navigation integration
  route?: Route | null;
  routeLoading?: boolean;
  navigationStatus?: string;
  onTransportChange?: (mode: TransportMode) => void;
  currentMode?: TransportMode;
  onBackFromNavigation?: () => void;
}

function WaterBodyInfoPanel({ waterBody, waterData, loading, onClose, onNavigate, layoutType, route, routeLoading, navigationStatus, onTransportChange, currentMode, onBackFromNavigation }: WaterBodyInfoPanelProps) {
  if (!waterBody) return null;

  const countryNames = {
    'SE': 'Sverige',
    'NO': 'Norge', 
    'DK': 'Danmark',
    'FI': 'Finland'
  };

  // Använd intelligent översättning baserad på namn
  const getDisplayType = (waterBody: SMHIWaterBody) => {
    const swedishType = getSwedishWaterTypeName(waterBody.name, waterBody.water_type);
    return formatWaterType(swedishType);
  };

    // Mobile: Same as desktop but smaller and more compact
  const isMobile = layoutType === 'mobilePortrait' || layoutType === 'mobileLandscape';
  const navActive = !!route || !!routeLoading;
  const allSteps = route?.segments?.flatMap(seg => seg.steps || []) || [];
  
  if (isMobile) {
  const [showMobileSteps, setShowMobileSteps] = useState(false);
  return (
      <div 
        className={`absolute ${layoutType === 'mobileLandscape' ? 'top-16 right-1' : 'top-20 right-1'} w-48 sm:w-56 bg-gradient-to-br from-slate-900/98 to-slate-800/98 backdrop-blur-xl rounded-lg border border-slate-600/50 shadow-2xl z-[1000] flex flex-col`}
        style={{
          // ADAPTIV: Liten när lite data, max 2 kort när mycket data
          maxHeight: '160px' // Max höjd för 2 kort, men kan vara mindre
        }}>
        {/* Mobile Header - Ultra Compact for tiny screens */}
        <div className="flex justify-between items-center p-1.5 sm:p-2 border-b border-slate-600/50 bg-gradient-to-r from-slate-800/50 to-slate-700/50 rounded-t-lg flex-shrink-0">
          <div className="min-w-0 flex-1 pr-1">
            <h3 className="text-xs font-bold text-white mb-0 truncate">{waterBody.name}</h3>
            <p className="text-xs text-slate-300 font-medium leading-tight truncate">
              {getDisplayType(waterBody)} • {countryNames[waterBody.country]}
            </p>
          </div>
          <div className="flex items-center space-x-1 flex-shrink-0">
            {navActive && onBackFromNavigation ? (
              <button
                onClick={onBackFromNavigation}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all duration-200"
                title="Tillbaka"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            ) : onNavigate ? (
              <button
                onClick={onNavigate}
                className="p-1 rounded-md text-slate-400 hover:text-cyan-400 hover:bg-slate-700/50 transition-all duration-200"
                title="Navigera"
              >
                <Navigation className="w-3.5 h-3.5" />
              </button>
            ) : null}
            <button
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all duration-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Mobile Content - Extra compact for tiny screens */}
        <div 
          className="p-1.5 sm:p-2 space-y-1.5 sm:space-y-2 overflow-y-auto"
          style={{ 
            scrollbarWidth: 'thin',
            scrollbarColor: '#64748b #1e293b',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {/* Navigation mode (mobile) */}
          {navActive ? (
            <div className="space-y-2">
              {routeLoading && (
                <div className="flex items-center justify-center py-2">
                  <div className="animate-spin rounded-full h-3 w-3 border border-cyan-400 border-t-transparent"></div>
                  <span className="ml-2 text-xs text-slate-300">{navigationStatus || 'Beräknar rutt...'}</span>
                </div>
              )}
              {route && !routeLoading && (
                <>
                  <div className="text-xs text-slate-300">
                    {formatDistance(route.summary.distance)} • {formatDuration(route.summary.duration)}
                    {(currentMode !== 'foot-walking' && typeof route.distanceRoadToWaterMeters === 'number' && route.distanceRoadToWaterMeters > 0) ? ' totalt' : ''}
                  </div>
                  {currentMode !== 'foot-walking' && typeof route.distanceRoadToWaterMeters === 'number' && route.distanceRoadToWaterMeters > 0 && (
                    <div className="text-cyan-300 text-[11px] mt-1">
                      Sista biten till fots: {formatDistance(route.distanceRoadToWaterMeters)} • {formatDuration(route.walkDurationSeconds || route.distanceRoadToWaterMeters / 1.4)}
                    </div>
                  )}
                  {route.terrain && (
                    <div className="text-[11px] text-slate-400">
                      Höjd: +{Math.round(route.terrain.elevationGainMeters)} m / -{Math.round(route.terrain.elevationLossMeters)} m
                    </div>
                  )}
                  {onTransportChange && currentMode && (
                    <div className="flex space-x-1">
                      <button onClick={() => onTransportChange('driving-car')} className={`flex-1 py-1 rounded text-[11px] ${currentMode==='driving-car'?'bg-cyan-600 text-white':'bg-slate-700/50 text-slate-300'}`}><Car className="w-3 h-3 inline mr-1"/>Bil</button>
                      <button onClick={() => onTransportChange('cycling-regular')} className={`flex-1 py-1 rounded text-[11px] ${currentMode==='cycling-regular'?'bg-cyan-600 text-white':'bg-slate-700/50 text-slate-300'}`}><Bike className="w-3 h-3 inline mr-1"/>Cykel</button>
                      <button onClick={() => onTransportChange('foot-walking')} className={`flex-1 py-1 rounded text-[11px] ${currentMode==='foot-walking'?'bg-cyan-600 text-white':'bg-slate-700/50 text-slate-300'}`}><User className="w-3 h-3 inline mr-1"/>Gång</button>
                    </div>
                  )}
                  {/* Toggle for steps (mobile) */}
                  {allSteps.length > 0 && (
                    <>
                      <button
                        onClick={() => setShowMobileSteps(!showMobileSteps)}
                        className="w-full py-1.5 px-2 bg-slate-700/50 hover:bg-slate-700 rounded text-xs text-white flex items-center justify-between"
                      >
                        <span>Vägbeskrivning ({allSteps.length} steg)</span>
                        {showMobileSteps ? <ChevronDown className="w-3.5 h-3.5"/> : <ChevronUp className="w-3.5 h-3.5"/>}
                      </button>
                      {showMobileSteps && (
                        <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg bg-slate-800/50 p-2">
                          {allSteps.map((step, index) => (
                            <div key={index} className="text-xs text-slate-300 py-1 border-b border-slate-700/50 last:border-b-0">
                              <div className="font-medium text-white">{index + 1}. {step.instruction}</div>
                              {step.distance > 0 && (
                                <div className="text-slate-400 mt-0.5">{formatDistance(step.distance)}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              {/* Original info content hidden while navigating */}
          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-2">
              <div className="animate-spin rounded-full h-3 w-3 border border-cyan-400 border-t-transparent"></div>
              <span className="ml-2 text-xs text-slate-300">Laddar...</span>
            </div>
          )}

          {/* Water Quality Data (VISS) - Mobile optimized but same structure */}
          {waterBody.country === 'SE' && waterData?.waterQuality && (() => {
            const hasOxygenData = waterData.waterQuality.oxygen?.status && waterData.waterQuality.oxygen.status !== 'Okänt' && waterData.waterQuality.oxygen.status !== '-';
            const hasNutrientsData = waterData.waterQuality.nutrients?.status && waterData.waterQuality.nutrients.status !== 'Okänt' && waterData.waterQuality.nutrients.status !== '-';
            const hasTransparencyData = waterData.waterQuality.transparency?.light_conditions && waterData.waterQuality.transparency.light_conditions !== 'Okänt' && waterData.waterQuality.transparency.light_conditions !== '-';
            const hasAcidityData = waterData.waterQuality.acidity?.ph_status && waterData.waterQuality.acidity.ph_status !== 'Okänt' && waterData.waterQuality.acidity.ph_status !== '-';
            const hasEcologicalData = waterData.waterQuality.ecological_status && waterData.waterQuality.ecological_status !== 'Okänt' && waterData.waterQuality.ecological_status !== '-';
            
            const hasAnyData = hasOxygenData || hasNutrientsData || hasTransparencyData || hasAcidityData || hasEcologicalData;
            
            return hasAnyData;
          })() && (
            <div>
              {/* Ta bort titel på mobil för att spara plats och visa exakt 2 kort */}
              <div className="grid grid-cols-1 gap-1">
                {/* Oxygen */}
                {waterData.waterQuality.oxygen?.status && waterData.waterQuality.oxygen.status !== 'Okänt' && waterData.waterQuality.oxygen.status !== '-' && (
                  <div className="bg-gradient-to-br from-cyan-900/30 to-cyan-800/20 border border-cyan-700/30 rounded p-1 sm:p-1.5">
                    <div className="text-cyan-300 text-xs font-medium mb-0.5">Syrgas</div>
                    <div className="text-white font-bold text-xs">
                      {waterData.waterQuality.oxygen.status}
                    </div>
                  </div>
                )}

                {/* Nutrients */}
                {waterData.waterQuality.nutrients?.status && waterData.waterQuality.nutrients.status !== 'Okänt' && waterData.waterQuality.nutrients.status !== '-' && (
                  <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 border border-green-700/30 rounded p-1 sm:p-1.5">
                    <div className="text-green-300 text-xs font-medium mb-0.5">Övergödning</div>
                    <div className="text-white font-bold text-xs">
                      {waterData.waterQuality.nutrients.status}
                    </div>
                    {waterData.waterQuality.nutrients.chlorophyll && waterData.waterQuality.nutrients.chlorophyll !== 'Okänt' && (
                      <div className="text-green-400 text-xs mt-0.5">Alger: {waterData.waterQuality.nutrients.chlorophyll}</div>
                    )}
                  </div>
                )}

                {/* Transparency */}
                {waterData.waterQuality.transparency?.light_conditions && waterData.waterQuality.transparency.light_conditions !== 'Okänt' && waterData.waterQuality.transparency.light_conditions !== '-' && (
                  <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border border-blue-700/30 rounded p-1 sm:p-1.5">
                    <div className="text-blue-300 text-xs font-medium mb-0.5">Ljus</div>
                    <div className="text-white font-bold text-xs">
                      {waterData.waterQuality.transparency.light_conditions}
                    </div>
                    {waterData.waterQuality.transparency.visibility && waterData.waterQuality.transparency.visibility !== 'Okänt' && (
                      <div className="text-blue-400 text-xs mt-0.5">Sikt: {waterData.waterQuality.transparency.visibility}</div>
                    )}
                  </div>
                )}

                {/* Acidity */}
                {waterData.waterQuality.acidity?.ph_status && waterData.waterQuality.acidity.ph_status !== 'Okänt' && waterData.waterQuality.acidity.ph_status !== '-' && (
                  <div className="bg-gradient-to-br from-yellow-900/30 to-yellow-800/20 border border-yellow-700/30 rounded p-1 sm:p-1.5">
                    <div className="text-yellow-300 text-xs font-medium mb-0.5">pH</div>
                    <div className="text-white font-bold text-xs">
                      {waterData.waterQuality.acidity.ph_status}
                    </div>
                  </div>
                )}

                {/* Ecological Status */}
                {waterData.waterQuality.ecological_status && waterData.waterQuality.ecological_status !== 'Okänt' && (
                  <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 border border-purple-700/30 rounded p-1 sm:p-1.5">
                    <div className="text-purple-300 text-xs font-medium mb-0.5">Ekologi</div>
                    <div className="text-white font-bold text-xs">
                      {waterData.waterQuality.ecological_status}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Non-Swedish waters message */}
          {waterBody.country !== 'SE' && (
            <div className="bg-blue-900/20 border border-blue-800/50 p-1 sm:p-1.5 rounded">
              <p className="text-blue-300 text-xs leading-tight">
                {waterBody.country === 'NO' && '🇳🇴 Norge.'}
                {waterBody.country === 'DK' && '🇩🇰 Danmark.'}
                {waterBody.country === 'FI' && '🇫🇮 Finland.'}
                {' '}VISS endast för Sverige.
              </p>
            </div>
          )}
            </>
          )}
        </div>
      </div>
    );
  }

  // Desktop: Right sidebar design with fixed height
  return (
    <div className="absolute top-4 right-4 w-full max-w-sm lg:max-w-md xl:max-w-lg mx-4 lg:mx-0 lg:w-96 bg-gradient-to-br from-slate-900/98 to-slate-800/98 backdrop-blur-xl rounded-2xl border border-slate-600/50 shadow-2xl z-[1000] flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center p-4 lg:p-6 border-b border-slate-600/50 bg-gradient-to-r from-slate-800/50 to-slate-700/50">
        <div className="flex-1 min-w-0 pr-4">
          <h3 className="text-lg lg:text-xl font-bold text-white mb-1">{waterBody.name}</h3>
          <p className="text-xs lg:text-sm text-slate-300 font-medium">
                          {getDisplayType(waterBody)} • {countryNames[waterBody.country]}
          </p>
        </div>
        <div className="flex items-center space-x-1 flex-shrink-0">
          {navActive && onBackFromNavigation ? (
            <button
              onClick={onBackFromNavigation}
              className="px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white transition-all duration-200 flex items-center space-x-2 border border-slate-600/30 hover:border-slate-500/50"
              title="Tillbaka"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Tillbaka</span>
            </button>
          ) : onNavigate ? (
            <button
              onClick={onNavigate}
              className="px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white transition-all duration-200 flex items-center space-x-2 border border-slate-600/30 hover:border-slate-500/50"
              title="Navigera"
            >
              <Navigation className="w-4 h-4" />
              <span className="text-sm font-medium">Navigera</span>
            </button>
          ) : null}
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-600/50 transition-all duration-200"
          >
            <X className="w-4 h-4 lg:w-5 lg:h-5" />
          </button>
        </div>
      </div>

      {/* Content - Fixed height with scrolling for max ~2 cards */}
      <div 
        className="p-4 lg:p-6 space-y-4 lg:space-y-6 overflow-y-auto max-h-[400px]" 
        style={{ 
          scrollbarWidth: 'thin',
          scrollbarColor: '#64748b #1e293b',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {/* Navigation mode (desktop) */}
        {navActive ? (
          <div className="space-y-3">
          {routeLoading && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
              <span className="ml-3 text-sm text-slate-300">{navigationStatus || 'Beräknar rutt...'}</span>
            </div>
          )}
              {route && !routeLoading && (
                <>
                  <div className="text-sm text-slate-300">
                    {formatDistance(route.summary.distance)} • {formatDuration(route.summary.duration)}
                    {(currentMode !== 'foot-walking' && typeof route.distanceRoadToWaterMeters === 'number' && route.distanceRoadToWaterMeters > 0) ? ' totalt' : ''}
                  </div>
                  {currentMode !== 'foot-walking' && typeof route.distanceRoadToWaterMeters === 'number' && route.distanceRoadToWaterMeters > 0 && (
                    <div className="text-cyan-300 text-sm">
                      Sista biten till fots: {formatDistance(route.distanceRoadToWaterMeters)} • {formatDuration(route.walkDurationSeconds || route.distanceRoadToWaterMeters / 1.4)}
                    </div>
                  )}
                  {route.terrain && (
                    <div className="text-xs text-slate-400 bg-slate-800/50 rounded p-2 mt-2">
                      {route.terrain.isSteepTerrain && (
                        <div className="text-yellow-400 font-medium mb-1">⚠️ Brant terräng</div>
                      )}
                      <div className="space-y-0.5">
                        <div>Distans {formatDistance(route.distanceRoadToWaterMeters || 0)}</div>
                        <div>Stigning +{Math.round(route.terrain.netAscentMeters ?? route.terrain.elevationGainMeters)} m</div>
                        <div>Fall −{Math.round(route.terrain.elevationLossMeters)} m</div>
                        {typeof route.terrain.maxGradePercent === 'number' && (
                          <div>Maxlutning {Math.round(route.terrain.maxGradePercent)}%</div>
                        )}
                      </div>
                    </div>
                  )}
                  {onTransportChange && currentMode && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <button onClick={() => onTransportChange('driving-car')} className={`py-2 px-2 rounded-lg text-sm ${currentMode==='driving-car'?'bg-cyan-600 text-white':'bg-slate-700/50 text-slate-300'}`}><Car className="w-4 h-4 inline mr-1"/>Bil</button>
                      <button onClick={() => onTransportChange('cycling-regular')} className={`py-2 px-2 rounded-lg text-sm ${currentMode==='cycling-regular'?'bg-cyan-600 text-white':'bg-slate-700/50 text-slate-300'}`}><Bike className="w-4 h-4 inline mr-1"/>Cykel</button>
                      <button onClick={() => onTransportChange('foot-walking')} className={`py-2 px-2 rounded-lg text-sm ${currentMode==='foot-walking'?'bg-cyan-600 text-white':'bg-slate-700/50 text-slate-300'}`}><User className="w-4 h-4 inline mr-1"/>Gång</button>
                    </div>
                  )}
                {/* Steps list */}
                {allSteps.length > 0 && (
                  <div className="max-h-64 overflow-y-auto space-y-2 rounded-xl bg-slate-800/50 p-3">
                    {allSteps.map((step, index) => (
                      <div key={index} className="text-sm p-3 bg-slate-700/30 rounded-lg">
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
                )}
              </>
            )}
          </div>
        ) : (
          <>
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
            <span className="ml-3 text-sm text-slate-300">Hämtar vattendata...</span>
          </div>
        )}

        {/* Water Quality Data (VISS) - Only show if actual data exists */}
        {waterBody.country === 'SE' && waterData?.waterQuality && (() => {
          // Check if there's any real data (not just "Okänt" or "-")
          const hasOxygenData = waterData.waterQuality.oxygen?.status && waterData.waterQuality.oxygen.status !== 'Okänt' && waterData.waterQuality.oxygen.status !== '-';
          const hasNutrientsData = waterData.waterQuality.nutrients?.status && waterData.waterQuality.nutrients.status !== 'Okänt' && waterData.waterQuality.nutrients.status !== '-';
          const hasTransparencyData = waterData.waterQuality.transparency?.light_conditions && waterData.waterQuality.transparency.light_conditions !== 'Okänt' && waterData.waterQuality.transparency.light_conditions !== '-';
          const hasAcidityData = waterData.waterQuality.acidity?.ph_status && waterData.waterQuality.acidity.ph_status !== 'Okänt' && waterData.waterQuality.acidity.ph_status !== '-';
          const hasEcologicalData = waterData.waterQuality.ecological_status && waterData.waterQuality.ecological_status !== 'Okänt' && waterData.waterQuality.ecological_status !== '-';
          
          const hasAnyData = hasOxygenData || hasNutrientsData || hasTransparencyData || hasAcidityData || hasEcologicalData;
          
          return hasAnyData;
        })() && (
          <div>
            <h4 className="font-semibold text-white mb-4 flex items-center text-lg">
              🧪 Vattenkvalitet (VISS)
              <span className="ml-2 text-xs text-slate-400 font-normal">2017-2021</span>
            </h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
              {/* Oxygen - only if real data */}
              {waterData.waterQuality.oxygen?.status && waterData.waterQuality.oxygen.status !== 'Okänt' && waterData.waterQuality.oxygen.status !== '-' && (
                <div className="bg-gradient-to-br from-cyan-900/30 to-cyan-800/20 border border-cyan-700/30 rounded-xl p-3 lg:p-4">
                  <div className="text-cyan-300 text-sm font-medium mb-1">Syrgasförhållanden</div>
                  <div className="text-white font-bold text-lg">
                    {waterData.waterQuality.oxygen.status}
                  </div>

                </div>
              )}

              {/* Nutrients - only if real data */}
              {waterData.waterQuality.nutrients?.status && waterData.waterQuality.nutrients.status !== 'Okänt' && waterData.waterQuality.nutrients.status !== '-' && (
                <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 border border-green-700/30 rounded-xl p-3 lg:p-4">
                  <div className="text-green-300 text-sm font-medium mb-1">Övergödning</div>
                  <div className="text-white font-bold text-lg">
                    {waterData.waterQuality.nutrients.status}
                  </div>
                  {waterData.waterQuality.nutrients.chlorophyll && waterData.waterQuality.nutrients.chlorophyll !== 'Okänt' && (
                    <div className="text-green-400 text-xs">Algblomning: {waterData.waterQuality.nutrients.chlorophyll}</div>
                  )}
                </div>
              )}

              {/* Transparency - only if real data */}
              {waterData.waterQuality.transparency?.light_conditions && waterData.waterQuality.transparency.light_conditions !== 'Okänt' && waterData.waterQuality.transparency.light_conditions !== '-' && (
                <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border border-blue-700/30 rounded-xl p-3 lg:p-4">
                  <div className="text-blue-300 text-sm font-medium mb-1">Ljusförhållanden</div>
                  <div className="text-white font-bold text-lg">
                    {waterData.waterQuality.transparency.light_conditions}
                  </div>
                  {waterData.waterQuality.transparency.visibility && waterData.waterQuality.transparency.visibility !== 'Okänt' && (
                    <div className="text-blue-400 text-xs">Sikt: {waterData.waterQuality.transparency.visibility}</div>
                  )}
                </div>
              )}

              {/* Acidity - only if real data */}
              {waterData.waterQuality.acidity?.ph_status && waterData.waterQuality.acidity.ph_status !== 'Okänt' && waterData.waterQuality.acidity.ph_status !== '-' && (
                <div className="bg-gradient-to-br from-yellow-900/30 to-yellow-800/20 border border-yellow-700/30 rounded-xl p-3 lg:p-4">
                  <div className="text-yellow-300 text-sm font-medium mb-1">pH-nivå</div>
                  <div className="text-white font-bold text-lg">
                    {waterData.waterQuality.acidity.ph_status}
                  </div>

                </div>
              )}

              {/* Ecological Status - only if real data */}
              {waterData.waterQuality.ecological_status && waterData.waterQuality.ecological_status !== 'Okänt' && (
                <div className="col-span-1 sm:col-span-2 bg-gradient-to-br from-purple-900/30 to-purple-800/20 border border-purple-700/30 rounded-xl p-3 lg:p-4">
                  <div className="text-purple-300 text-sm font-medium mb-1">Ekologisk status</div>
                  <div className="text-white font-bold text-lg">
                    {waterData.waterQuality.ecological_status}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}







        {/* Non-Swedish waters message */}
        {waterBody.country !== 'SE' && (
          <div className="bg-blue-900/20 border border-blue-800/50 p-3 rounded-lg">
            <p className="text-blue-300 text-sm">
              {waterBody.country === 'NO' && '🇳🇴 Norska vattendrag.'}
              {waterBody.country === 'DK' && '🇩🇰 Danska vattendrag.'}
              {waterBody.country === 'FI' && '🇫🇮 Finska vattendrag.'}
              {' '}VISS-data finns endast för svenska vatten.
            </p>
          </div>
        )}
        </>
        )}

      </div>
    </div>
  );
}



interface MapRef {
  focusOnWaterBody: (waterBody: SMHIWaterBody) => void;
  triggerGeolocate: () => void;
}

interface Props {
  searchTerm?: string;
  onWaterBodySelect?: (waterBody: SMHIWaterBody) => void;
  layoutType?: LayoutType;
}

const ScandinavianWaterMapGL = forwardRef<MapRef, Props>(({ searchTerm, onWaterBodySelect, layoutType: propLayoutType }, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  
  // Layout detection for responsive design
  const [layoutType, setLayoutType] = useState<LayoutType>(propLayoutType || 'desktop');
  
  // REF för synkron state tracking (löser React async state problem)
  const selectedWaterBodyRef = useRef<SMHIWaterBody | null>(null);
  
  const [selectedWaterBody, setSelectedWaterBody] = useState<SMHIWaterBody | null>(null);
  const [waterData, setWaterData] = useState<WaterBodyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [visibleWaterBodies, setVisibleWaterBodies] = useState<SMHIWaterBody[]>([]);
  const [userHeading, setUserHeading] = useState<number | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  
  // Navigation state
  const [currentRoute, setCurrentRoute] = useState<Route | null>(null);
  const [navigationMode, setNavigationMode] = useState<TransportMode>('driving-car');
  const [routeLoading, setRouteLoading] = useState(false);
  const [navigationStatus, setNavigationStatus] = useState<string>('');
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null);

  // Layout detection effect - use prop if provided
  useEffect(() => {
    if (propLayoutType) {
      setLayoutType(propLayoutType);
      return;
    }
    
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
  }, [propLayoutType]);

  useImperativeHandle(ref, () => ({
    focusOnWaterBody: (waterBody: SMHIWaterBody) => {
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [waterBody.coordinates[1], waterBody.coordinates[0]],
          zoom: 12,
          duration: 2000
        });
        handleWaterBodyClick(waterBody);
      }
    },
    triggerGeolocate: () => {
      // Not needed anymore - position tracks automatically
    }
  }));

  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !layoutType) return;

    // Initialize MapLibre GL map with satellite imagery (same as main map)
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf', // Fix för text-labels
        sources: {
          'esri-world-imagery': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            ],
            tileSize: 256,
            attribution: '&copy; Esri, Maxar, Earthstar Geographics'
          },
          'place-names': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
            ],
            tileSize: 256,
            attribution: '&copy; Esri'
          }
        },
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: {
              'background-color': '#0f172a'
            }
          },
          {
            id: 'esri-world-imagery',
            type: 'raster',
            source: 'esri-world-imagery'
          },
          {
            id: 'place-names',
            type: 'raster',
            source: 'place-names',
            paint: {
              'raster-opacity': 0.8
            }
          }
        ]
      },
      center: [15.0, 62.0],
      zoom: 5,
      maxZoom: 18,
      minZoom: 3
    });

    // Sätt vanlig cursor över hela kartan
    map.getCanvas().style.cursor = 'default';

    mapRef.current = map;

    // Wait for map to load
    map.on('load', async () => {
      // Cache populära vattendrag i bakgrunden för snabbare lookup
      loadPopularFishingWaters();
      
      // Cache vattendrag för aktuell vy också
      const bounds = map.getBounds();
      if (bounds) {
        handleMapMove();
      }
      
      // Add event listeners
      map.on('moveend', handleMapMove); // För preloading av detaljer
      
      // SMART KLICK-HANTERING: Klicka ut först, sedan välj nytt
      map.on('click', (e) => {
        // Klick på karta: rensa rutt och urval
        handleCloseNavigation();
        handleSmartMapClick(e);
      });
      
      // Starta användarpositionering
      startUserLocationTracking();
    });

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [layoutType]);

  // Starta device orientation tracking för kompassriktning (BARA på mobil)
  useEffect(() => {
    // Kör bara på klienten och bara på mobila enheter
    if (typeof window === 'undefined') return;
    
    const isMobile = layoutType === 'mobilePortrait' || layoutType === 'mobileLandscape';
    if (!isMobile) return;

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha !== null) {
        // alpha är kompassriktning (0-360 grader)
        setUserHeading(event.alpha);
      }
    };

    // Fråga om tillåtelse på iOS 13+
    if (typeof DeviceOrientationEvent !== 'undefined' && 
        typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      (DeviceOrientationEvent as any).requestPermission()
        .then((response: string) => {
          if (response === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
          }
        })
        .catch(console.error);
    } else if (typeof DeviceOrientationEvent !== 'undefined') {
      // Icke-iOS eller äldre iOS
      window.addEventListener('deviceorientation', handleOrientation);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('deviceorientation', handleOrientation);
      }
    };
  }, [layoutType]);

  // Uppdatera marker rotation när heading ändras (bara SVG, inte hela elementet)
  useEffect(() => {
    if (userMarkerRef.current && userHeading !== null) {
      const element = userMarkerRef.current.getElement();
      const svg = element.querySelector('svg');
      if (svg) {
        svg.style.transform = `rotate(${userHeading}deg)`;
      }
    }
  }, [userHeading]);

  const startUserLocationTracking = () => {
    if (!mapRef.current || !navigator.geolocation) return;

    const map = mapRef.current;
    let isFirstPosition = true;
    const isMobile = layoutType === 'mobilePortrait' || layoutType === 'mobileLandscape';

    const updateUserPosition = (position: GeolocationPosition) => {
      const { longitude, latitude } = position.coords;
      
      // Spara användarens position för routing
      setUserPosition([longitude, latitude]);

      if (!userMarkerRef.current) {
        // Skapa custom marker
        const el = document.createElement('div');
        el.className = 'user-location-marker';
        
        if (isMobile) {
          // MOBIL: Stor marker med pil för navigation
          el.classList.add('mobile');
          el.innerHTML = `
            <div class="ping"></div>
            <div class="ping"></div>
            <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" style="display: block; position: relative; z-index: 1;">
              <defs>
                <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
                  <feOffset dx="0" dy="2" result="offsetblur"/>
                  <feComponentTransfer>
                    <feFuncA type="linear" slope="0.3"/>
                  </feComponentTransfer>
                  <feMerge>
                    <feMergeNode/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              <!-- Yttre cirkel (vit) -->
              <circle cx="20" cy="20" r="12" fill="white" opacity="0.9" filter="url(#shadow)"/>
              <!-- Inre cirkel (blå) -->
              <circle cx="20" cy="20" r="8" fill="#3b82f6"/>
              <!-- Pil -->
              <path d="M 20 8 L 23 16 L 20 14 L 17 16 Z" fill="white"/>
            </svg>
          `;
          el.style.width = '40px';
          el.style.height = '40px';
        } else {
          // DESKTOP: Liten plupp utan pil
          el.classList.add('desktop');
          el.innerHTML = `
            <div class="ping"></div>
            <div class="ping"></div>
            <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style="display: block; position: relative; z-index: 1;">
              <defs>
                <filter id="shadow-desktop" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceAlpha" stdDeviation="1"/>
                  <feOffset dx="0" dy="1" result="offsetblur"/>
                  <feComponentTransfer>
                    <feFuncA type="linear" slope="0.3"/>
                  </feComponentTransfer>
                  <feMerge>
                    <feMergeNode/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              <!-- Yttre cirkel (vit) -->
              <circle cx="10" cy="10" r="7" fill="white" opacity="0.9" filter="url(#shadow-desktop)"/>
              <!-- Inre cirkel (blå) -->
              <circle cx="10" cy="10" r="5" fill="#3b82f6"/>
            </svg>
          `;
          el.style.width = '20px';
          el.style.height = '20px';
        }
        
        el.style.pointerEvents = 'none';

        userMarkerRef.current = new maplibregl.Marker({ 
          element: el, 
          anchor: 'center'
        })
          .setLngLat([longitude, latitude])
          .addTo(map);
      } else {
        // Uppdatera position
        userMarkerRef.current.setLngLat([longitude, latitude]);
      }

      // Centrera kartan på första positionen (mycket mindre zoom)
      if (isFirstPosition) {
        map.flyTo({
          center: [longitude, latitude],
          zoom: 9, // Mycket mindre zoom - översikt
          duration: 2000
        });
        isFirstPosition = false;
      }
    };

    // Starta kontinuerlig positionsspårning
    watchIdRef.current = navigator.geolocation.watchPosition(
      updateUserPosition,
      (error) => {
        const err = error as GeolocationPositionError;
        let message = 'Platsfel.';
        if (typeof window !== 'undefined' && !window.isSecureContext && !location.hostname.includes('localhost')) {
          message = 'Plats kräver HTTPS. Öppna sidan via https:// eller aktivera plats manuellt.';
        } else if (err && typeof err.code === 'number') {
          if (err.code === 1) message = 'Platsåtkomst nekad. Tillåt platsdelning för webbplatsen.';
          else if (err.code === 2) message = 'Plats otillgänglig. Prova utomhus eller aktivera GPS.';
          else if (err.code === 3) message = 'Platsförfrågan tog för lång tid. Försök igen.';
        }
        setGeoError(message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 8000
      }
    );
  };

  // BORTTAGET: Glow-effekt (på användarens begäran)

  const loadPopularFishingWaters = async () => {
    try {
      // TEMPORÄRT INAKTIVERAD - implementera SMHI-version senare om behövs
      // Silenced noisy log
      setVisibleWaterBodies([]);
    } catch (error) {
      console.error('Fel vid laddning av populära fiskevatten:', error);
    }
  };

  const handleMapMove = async () => {
    if (!mapRef.current) return;

    const map = mapRef.current;
    const bounds = map.getBounds();
    const zoom = map.getZoom();

    // Minska zoom-begränsningen kraftigt för att alla sjöar ska vara klickbara
    if (zoom < 4) return;

    try {
              const waterBodies = await getSMHIWaterBodiesInBounds({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      }, 300); // Öka limit för fler vattendrag

      const newBodies = waterBodies.filter(wb => 
        !visibleWaterBodies.some(vwb => vwb.id === wb.id)
      );
      
      if (newBodies.length > 0) {
        // Cache för snabbare lookup
        setVisibleWaterBodies(prev => [...prev, ...newBodies].slice(0, 1000));
      }
    } catch (error) {
      console.error('Fel vid laddning av vattendrag:', error);
    }
  };

  // BORTTAGET: updateGlowOverlay (glow-effekten togs bort)

  const addWaterBodiesToMap = (waterBodies: SMHIWaterBody[]) => {
    if (!mapRef.current || waterBodies.length === 0) return;

    const map = mapRef.current;

    const features = waterBodies.map(wb => ({
      type: 'Feature' as const,
      properties: {
        id: wb.id,
        name: wb.name,
        water_type: wb.water_type,
        country: wb.country,
        area_km2: wb.area_km2,
        has_chart: wb.has_chart
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [wb.coordinates[1], wb.coordinates[0]]
      }
    }));

    if (map.getSource('water-bodies')) {
      const source = map.getSource('water-bodies') as maplibregl.GeoJSONSource;
      const existingData = source._data as any;
      
      const allFeatures = [
        ...(existingData?.features || []),
        ...features
      ];
      
      const uniqueFeatures = allFeatures.filter((feature, index, self) => 
        index === self.findIndex(f => f.properties.id === feature.properties.id)
      );

      source.setData({
        type: 'FeatureCollection',
        features: uniqueFeatures
      });
    } else {
      map.addSource('water-bodies', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features
        }
      });

      // Add circles layer - Professional design with glow effect
      map.addLayer({
        id: 'water-bodies-layer',
        type: 'circle',
        source: 'water-bodies',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5, 4,
            10, 8,
            15, 16
          ],
          'circle-color': [
            'case',
            ['==', ['get', 'country'], 'SE'], '#06b6d4', // Swedish cyan
            ['==', ['get', 'country'], 'NO'], '#ef4444', // Norwegian red  
            ['==', ['get', 'country'], 'DK'], '#f59e0b', // Danish amber
            ['==', ['get', 'country'], 'FI'], '#10b981', // Finnish green
            '#64748b' // Default slate
          ],
          'circle-stroke-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5, 1,
            10, 2,
            15, 3
          ],
          'circle-stroke-color': '#ffffff',
          'circle-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5, 0.7,
            10, 0.8,
            15, 0.9
          ],
          'circle-stroke-opacity': 0.9
        }
      });

      // Add inner glow layer for more professional look
      map.addLayer({
        id: 'water-bodies-glow',
        type: 'circle',
        source: 'water-bodies',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5, 6,
            10, 12,
            15, 24
          ],
          'circle-color': [
            'case',
            ['==', ['get', 'country'], 'SE'], '#06b6d4',  // Sverige - cyan
            ['==', ['get', 'country'], 'NO'], '#ef4444',  // Norge - röd
            ['==', ['get', 'country'], 'DK'], '#f59e0b',  // Danmark - orange
            ['==', ['get', 'country'], 'FI'], '#10b981',  // Finland - grön
            '#64748b'  // Fallback - grå
          ],
          'circle-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5, 0.1,
            10, 0.15,
            15, 0.2
          ]
        }
      }, 'water-bodies-layer'); // Add glow behind main circles

      // Add labels layer - med fallback font
      map.addLayer({
        id: 'water-bodies-labels',
        type: 'symbol',
        source: 'water-bodies',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular', 'Arial Unicode MS Regular'], // Fallback fonts
          'text-offset': [0, 2],
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8, 10,
            12, 12,
            16, 16
          ],
          'text-max-width': 15,
          'text-allow-overlap': false,
          'text-ignore-placement': false
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 3
        },
        minzoom: 8
      });
    }
  };

  // GAMMAL handleMapClick BORTTAGEN - vi använder bara handleUniversalMapClick nu

  // SMART KLICK-HANTERING: Klicka ut först, sedan välj nytt
  const handleSmartMapClick = async (e: maplibregl.MapMouseEvent) => {
    // Om klicket redan hanterades av en specifik layer, skippa
    if (e.originalEvent.defaultPrevented) {
      return;
    }

    // VIKTIGT: Använd REF istället för state för synkron kontroll
    if (selectedWaterBodyRef.current) {
      e.originalEvent.preventDefault(); // Förhindra andra handlers
      clearSelection();
      return;
    }

    const { lng, lat } = e.lngLat;
    
    try {
      // Förbättrad sökning med större tolerans för små geometrier
      const waterBody = await getSMHIWaterBodyImproved(lat, lng);
      
      if (waterBody) {
        // Markera att vi hanterat klicket
        e.originalEvent.preventDefault();
        
        handleWaterBodyClick(waterBody);
      }
      
    } catch (error) {
      console.error('Fel vid smart map click:', error);
    }
  };

  // FÖRBÄTTRAD geometri-sökning med större tolerans för stora sjöar
  const getSMHIWaterBodyImproved = async (lat: number, lng: number): Promise<SMHIWaterBody | null> => {
    
    if (USE_PLACES_SYSTEM) {
      // NEW SYSTEM: Use water_bodies_with_places with disambiguation
      let waterBodyWithPlaces = await getWaterBodyWithPlacesAtCoordinates(lat, lng, 5);
      if (waterBodyWithPlaces) {
        return convertToSMHIFormat(waterBodyWithPlaces);
      }
      
      // Fallback: Sök i cache bland synliga vattendrag
      const cachedMatch = findInCachedWaterBodies(lat, lng);
      if (cachedMatch) return cachedMatch;
      
      // Sista försök med maximal tolerans (10km för mycket stora sjöar)
      waterBodyWithPlaces = await getWaterBodyWithPlacesAtCoordinates(lat, lng, 10);
      return waterBodyWithPlaces ? convertToSMHIFormat(waterBodyWithPlaces) : null;
      
    } else {
      // OLD SYSTEM: Use water_bodies_integrated
      let waterBody = await getSMHIWaterBodyAtCoordinates(lat, lng, 5);
      if (waterBody) return waterBody;
      
      // Fallback: Sök i cache bland synliga vattendrag
      const cachedMatch = findInCachedWaterBodies(lat, lng);
      if (cachedMatch) return cachedMatch;
      
      // Sista försök med maximal tolerans (10km för mycket stora sjöar)
      waterBody = await getSMHIWaterBodyAtCoordinates(lat, lng, 10);
      return waterBody;
    }
  };

  // Hjälpfunktion: Sök i cachade vattendrag för snabb matchning
  const findInCachedWaterBodies = (lat: number, lng: number): SMHIWaterBody | null => {
    const tolerance = 0.05; // ~5km tolerans i grader
    
    for (const wb of visibleWaterBodies) {
      const [wbLat, wbLng] = wb.coordinates;
      const distance = Math.sqrt(
        Math.pow(lat - wbLat, 2) + Math.pow(lng - wbLng, 2)
      );
      
      if (distance < tolerance) {
        return wb;
      }
    }
    
    return null;
  };

  const clearSelection = () => {
    // Uppdatera både state och ref synkront
    selectedWaterBodyRef.current = null;
    setSelectedWaterBody(null);
    setWaterData(null);
    
    if (mapRef.current) {
      const map = mapRef.current;
      // Remove all highlight layers
      ['selected-water-polygon', 'selected-water-outline', 'highlight-circle'].forEach(layerId => {
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
      });
      ['selected-water-source', 'highlight-source'].forEach(sourceId => {
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      });
    }
  };

  // HJÄLPFUNKTIONER för geometri-highlighting
  const isValidGeometryForHighlighting = (geometry: any): boolean => {
    if (!geometry) return false;
    
    const validTypes = ['Polygon', 'MultiPolygon', 'GeometryCollection', 'LineString', 'MultiLineString'];
    return validTypes.includes(geometry.type);
  };

  const prepareGeometryForHighlighting = (waterBody: SMHIWaterBody) => {
    const { geometry } = waterBody;
    
    // Om det är en GeometryCollection (flera segment), skapa FeatureCollection
    if (geometry.type === 'GeometryCollection') {
      return {
        type: 'FeatureCollection',
        features: geometry.geometries.map((geom: any, index: number) => ({
          type: 'Feature',
          properties: { 
            name: waterBody.name,
            segment: index + 1,
            total_segments: geometry.geometries.length,
            geometry_type: geom.type // För att avgöra highlighting-typ
          },
          geometry: geom
        }))
      };
    }
    
    // Vanlig geometri
    return {
      type: 'Feature',
      geometry: geometry,
      properties: { 
        name: waterBody.name,
        geometry_type: geometry.type
      }
    };
  };

  // Avgör om geometrin borde fyllas (polygoner) eller bara ha linje (åar/floder)
  const shouldUsePolygonFill = (geometry: any): boolean => {
    if (!geometry) return false;
    
    if (geometry.type === 'GeometryCollection') {
      // Om GeometryCollection innehåller bara LineString/MultiLineString → ingen fill
      return geometry.geometries.some((geom: any) => 
        geom.type === 'Polygon' || geom.type === 'MultiPolygon'
      );
    }
    
    // Bara polygoner får fill, linjer får bara outline
    return geometry.type === 'Polygon' || geometry.type === 'MultiPolygon';
  };

  const handleWaterBodyClick = async (waterBody: SMHIWaterBody) => {
    // Uppdatera både state och ref synkront
    selectedWaterBodyRef.current = waterBody;
    setSelectedWaterBody(waterBody);
    setWaterData(null);
    setLoading(true);

    if (onWaterBodySelect) {
      onWaterBodySelect(waterBody);
    }

    // *** SNABB HIGHLIGHTING FÖRST - ingen väntan! ***
    showImmediateHighlight(waterBody);

    // *** Data-hämtning i bakgrunden - blocking UI ***
    fetchWaterBodyDataInBackground(waterBody);
  };

  // Visa highlighting omedelbart utan att vänta på data
  const showImmediateHighlight = (waterBody: SMHIWaterBody) => {
    if (!mapRef.current) return;
    
    const map = mapRef.current;
    
    // Remove existing highlight layers
    ['selected-water-polygon', 'selected-water-outline', 'highlight-circle'].forEach(layerId => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    });
    ['selected-water-source', 'highlight-source'].forEach(sourceId => {
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    });

    // Show geometry if available - stöder nu även GeometryCollection
    if (waterBody.geometry && isValidGeometryForHighlighting(waterBody.geometry)) {
      
      // Skapa GeoJSON data för highlighting
      const highlightData = prepareGeometryForHighlighting(waterBody);
      
      // Add geometry source
              map.addSource('selected-water-source', {
          type: 'geojson',
          data: highlightData as any
        });

      // Bara lägg till fill för polygoner (sjöar), inte för åar/floder
      if (shouldUsePolygonFill(waterBody.geometry)) {
        map.addLayer({
          id: 'selected-water-polygon',
          type: 'fill',
          source: 'selected-water-source',
          paint: {
            'fill-color': '#0ea5e9',
            'fill-opacity': 0.15
          }
        });
      }

      // Add outline - fungerar för alla geometrityper (både sjöar och åar)
      map.addLayer({
        id: 'selected-water-outline',
        type: 'line',
        source: 'selected-water-source',
        paint: {
          'line-color': '#0ea5e9',
          'line-width': shouldUsePolygonFill(waterBody.geometry) ? 2 : 3, // Tjockare linje för åar
          'line-opacity': 0.8
        }
      });

      // Fit map to geometry bounds
      try {
        const bbox = turf.bbox(waterBody.geometry);
        map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
          padding: 50,
          maxZoom: 14
        });
      } catch (e) {
        console.warn('Could not fit bounds to geometry:', e);
      }

    } else {
      // Fallback to circle highlight
      const center = [waterBody.coordinates[1], waterBody.coordinates[0]];
      const radius = Math.max(100, (waterBody.area_km2 || 1) * 100);
      
              map.addSource('highlight-source', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: center
            },
            properties: {}
          }
        });

      map.addLayer({
        id: 'highlight-circle',
        type: 'circle',
        source: 'highlight-source',
        paint: {
          'circle-radius': radius / (Math.pow(2, map.getZoom() - 10)),
          'circle-color': '#0ea5e9',
          'circle-opacity': 0.1,
          'circle-stroke-color': '#0ea5e9',
          'circle-stroke-width': 2,
          'circle-stroke-opacity': 0.8
        }
      });
    }
  };

  // Hantera navigation till vattendrag
  const handleNavigate = async () => {
    if (!selectedWaterBody || !userPosition || !mapRef.current) {
      console.error('Saknar användarposition eller destination');
      alert('Din position kunde inte hittas. Tillåt platsdelning för att använda navigation.');
      return;
    }

    setRouteLoading(true);
    setCurrentRoute(null);
    
    // Professionella meddelanden som roterar under beräkningen
    const statusMessages = navigationMode === 'foot-walking' 
      ? [
          'Söker efter gångvägar...',
          'Analyserar stigar och vägar...',
          'Beräknar höjdprofil...',
          'Optimerar ruttval...'
        ]
      : [
          'Söker efter tillgängliga vägar...',
          'Planerar körväg...',
          'Kontrollerar gångsträcka till vattnet...',
          'Optimerar total restid...',
          'Beräknar höjdskillnader...'
        ];
    
    let statusIndex = 0;
    setNavigationStatus(statusMessages[0]);
    
    // Rotera meddelanden var 2:e sekund
    const statusInterval = setInterval(() => {
      statusIndex = (statusIndex + 1) % statusMessages.length;
      setNavigationStatus(statusMessages[statusIndex]);
    }, 2000);
    
    try {
      // Hitta närmaste strandpunkt (inte centrum)
      const shorePoint = findNearestShorePoint(selectedWaterBody, userPosition);

      const route = await getRoute(userPosition, shorePoint, navigationMode);
      
      clearInterval(statusInterval);
      
      if (route) {
        setNavigationStatus('Rutt beräknad!');
        setCurrentRoute(route);
        
        // Rita rutten på kartan
        drawRouteOnMap(route);
        
        // Zooma kartan för att visa hela rutten
        if (mapRef.current) {
          if (route.bbox) {
            const [minLng, minLat, maxLng, maxLat] = route.bbox;
            mapRef.current.fitBounds(
              [[minLng, minLat], [maxLng, maxLat]],
              { padding: 50, duration: 1000 }
            );
          } else if (route.geometry?.coordinates?.length) {
            try {
              const bbox = turf.bbox({ type: 'LineString', coordinates: route.geometry.coordinates } as any);
              mapRef.current.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 50, duration: 1000 });
            } catch {}
          }
        }
      } else {
        // Ingen rutt hittades
        setNavigationStatus('');
        alert('Ingen väg hittades till ' + selectedWaterBody.name + '. Området kan vara oåtkomligt eller för avlägset från vägnätet.');
      }
    } catch (error: any) {
      clearInterval(statusInterval);
      console.error('Fel vid routing:', error);
      const errorMessage = error?.message || 'Ett oväntat fel uppstod';
      setNavigationStatus('');
      if (errorMessage.includes('404')) {
        alert('Ingen väg hittades till ' + selectedWaterBody.name + '. Området kan vara oåtkomligt eller för avlägset från vägnätet.');
      } else {
        alert('Kunde inte beräkna rutt: ' + errorMessage);
      }
    } finally {
      clearInterval(statusInterval);
      setRouteLoading(false);
      setTimeout(() => setNavigationStatus(''), 2000); // Rensa meddelande efter 2s
    }
  };

  // Rita rutt-linjen på kartan (solid för bil/cykel, prickad för gång-del)
  const drawRouteOnMap = (route: Route) => {
    if (!mapRef.current) return;

    const map = mapRef.current;

    // Hjälpare: ta bort lager/källor om de finns
    const removeIfExists = (type: 'layer' | 'source', id: string) => {
      if (type === 'layer' && map.getLayer(id)) map.removeLayer(id);
      if (type === 'source' && map.getSource(id)) map.removeSource(id);
    };

    // Rensa tidigare rutter (både enkel och multimodal)
    ['route-line', 'route-outline', 'route-vehicle-line', 'route-vehicle-outline', 'route-walk-line', 'route-walk-outline', 'route-walk-final-line', 'route-walk-graded-line', 'route-walk-dash-line']
      .forEach(id => removeIfExists('layer', id));
    ['route', 'route-vehicle', 'route-walk', 'route-walk-final', 'route-walk-graded', 'route-walk-dash']
      .forEach(id => removeIfExists('source', id));

    const hasParts = !!route.partialGeometries && (!!route.partialGeometries.vehicle || !!route.partialGeometries.walk || !!route.partialGeometries.walkFinal);

      if (hasParts) {
      // Förbered geometrier: trimma fordon till där gång börjar och snappa mötespunkten
      let vehicleGeometryForRender = route.partialGeometries?.vehicle;
      let walkGeometryForRender = route.partialGeometries?.walk;

      try {
        if (vehicleGeometryForRender && walkGeometryForRender &&
            Array.isArray(vehicleGeometryForRender.coordinates) && vehicleGeometryForRender.coordinates.length >= 2 &&
            Array.isArray(walkGeometryForRender.coordinates) && walkGeometryForRender.coordinates.length >= 2) {
          const walkStart = walkGeometryForRender.coordinates[0];
          // Snappa/trimma ENDAST om avståndet är mycket litet (≤5m). Annars lämna separata.
          const line = turf.lineString(vehicleGeometryForRender.coordinates as any);
          const snappedOnVehicle = turf.nearestPointOnLine(line as any, walkStart as any) as any;
          const join = snappedOnVehicle?.geometry?.coordinates as [number, number] | undefined;
          const joinDistM = join ? turf.distance(walkStart as any, join as any, { units: 'kilometers' }) * 1000 : Infinity;
          if (join && isFinite(joinDistM) && joinDistM <= 5) {
            const idx = (snappedOnVehicle?.properties?.index ?? vehicleGeometryForRender.coordinates.length - 1) as number;
            const trimmed = vehicleGeometryForRender.coordinates.slice(0, Math.max(1, idx + 1));
            trimmed[trimmed.length - 1] = join;
            vehicleGeometryForRender = { type: 'LineString', coordinates: trimmed } as any;

            const walkCoords = walkGeometryForRender.coordinates.slice();
            walkCoords[0] = join;
            walkGeometryForRender = { type: 'LineString', coordinates: walkCoords } as any;
          }
        }
      } catch {}

      // Bil/cykel-del (solid)
      if (vehicleGeometryForRender) {
        map.addSource('route-vehicle', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: vehicleGeometryForRender
          }
        });

        map.addLayer({
          id: 'route-vehicle-outline',
          type: 'line',
          source: 'route-vehicle',
          paint: {
            'line-color': '#ffffff',
            'line-width': 5,
            'line-opacity': 0.8
          }
        });

        map.addLayer({
          id: 'route-vehicle-line',
          type: 'line',
          source: 'route-vehicle',
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          },
          paint: {
            'line-color': '#3b82f6',
            'line-width': 3,
            'line-opacity': 1.0
          }
        });
      }

      // Gång-del färgkodad efter lutning – snappa endast SLUT mot vattenkanten
      if (walkGeometryForRender) {
        let walkGeometry = walkGeometryForRender;
        try {
          const water = selectedWaterBodyRef.current?.geometry as any;
          if (water && walkGeometry?.coordinates?.length >= 2) {
            let boundaryLine: any = null;
            if (water.type === 'Polygon' || water.type === 'MultiPolygon') {
              boundaryLine = turf.polygonToLine(water as any);
            } else if (water.type === 'LineString' || water.type === 'MultiLineString') {
              boundaryLine = { type: water.type, coordinates: water.coordinates } as any;
            }
            if (boundaryLine) {
              const walkEndRef = walkGeometry.coordinates[walkGeometry.coordinates.length - 1];
              const snapped = turf.nearestPointOnLine(boundaryLine as any, walkEndRef as any) as any;
              const newCoords = walkGeometry.coordinates.slice();
              if (snapped?.geometry?.coordinates) {
                newCoords[newCoords.length - 1] = snapped.geometry.coordinates as [number, number];
              }
              walkGeometry = { type: 'LineString', coordinates: newCoords } as any;
            }
          }
        } catch {}

        // Bygg gradersatta segment (0:grön 0–4%, 1:gul 4–10%, 2:röd >10%)
        const coords = walkGeometry.coordinates as [number, number][];
        const segments: any[] = [];
        if (coords.length >= 2) {
          // Cumulativ distans längs gång-linjen
          const cum: number[] = [0];
          for (let i = 1; i < coords.length; i++) {
            const d = turf.distance([coords[i - 1][0], coords[i - 1][1]], [coords[i][0], coords[i][1]], { units: 'kilometers' }) * 1000;
            cum.push(cum[i - 1] + d);
          }
          // Hämta profil om finns
          const terrain: any = (route as any).terrain || null;
          const profile: { d: number; g: number }[] = Array.isArray(terrain?.profile) ? terrain.profile : [];
          const gradeAt = (dist: number) => {
            if (profile.length < 2) return 0;
            // hitta närmaste profil-punkt (linjärt)
            let lo = 0, hi = profile.length - 1;
            while (hi - lo > 1) {
              const mid = (lo + hi) >> 1;
              if (profile[mid].d < dist) lo = mid; else hi = mid;
            }
            const a = profile[lo]; const b = profile[hi];
            const t = Math.max(0, Math.min(1, (dist - a.d) / Math.max(b.d - a.d, 1e-6)));
            const g = a.g + t * (b.g - a.g);
            return g;
          };
          for (let i = 1; i < coords.length; i++) {
            const dMid = (cum[i - 1] + cum[i]) / 2;
            const g = gradeAt(dMid);
            const abs = Math.abs(g);
            const cls = abs <= 4 ? 0 : abs <= 10 ? 1 : 2;
            segments.push({
              type: 'Feature',
              properties: { gradeClass: cls },
              geometry: {
                type: 'LineString',
                coordinates: [coords[i - 1], coords[i]]
              }
            });
          }
        }

        // Base dashed layer for consistent dash spacing along entire walk, offset så den syns ovanför blå linje
        map.addSource('route-walk-dash', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: walkGeometry }
        });
        map.addLayer({
          id: 'route-walk-dash-line',
          type: 'line',
          source: 'route-walk-dash',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-width': 3,
            'line-color': '#94a3b8',
            'line-opacity': 0.6,
            'line-dasharray': [2, 5],
            'line-translate': [0, -2]
          }
        });

        // Colored segments on top (solid)
        map.addSource('route-walk-graded', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: segments }
        });

        map.addLayer({
          id: 'route-walk-graded-line',
          type: 'line',
          source: 'route-walk-graded',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-width': 3,
            'line-opacity': 1.0,
            'line-dasharray': [2, 5],
            'line-color': [
              'match', ['get', 'gradeClass'],
              0, '#10b981',
              1, '#f59e0b',
              2, '#ef4444',
              '#3b82f6'
            ],
            'line-translate': [0, -2]
          }
        });
      }

      // Sista raka gång-delen (walkFinal) – rendera också prickad
      if (route.partialGeometries?.walkFinal) {
        map.addSource('route-walk-final', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: route.partialGeometries.walkFinal
          }
        });

        map.addLayer({
          id: 'route-walk-final-line',
          type: 'line',
          source: 'route-walk-final',
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          },
          paint: {
            'line-color': '#3b82f6',
            'line-width': 3,
            'line-opacity': 1.0,
            'line-dasharray': [0.0001, 5]
          }
        });
      }

      return;
    }

    // Fallback: enkel rutt (solid linje)
    // Om vi bara har en gång-rutt, snappa sista punkten till närmaste kant från ruttens SLUT
    let routeGeometry = route.geometry;
    try {
      const water = selectedWaterBodyRef.current?.geometry as any;
      if (water && routeGeometry?.coordinates?.length >= 2) {
        let boundaryLine: any = null;
        if (water.type === 'Polygon' || water.type === 'MultiPolygon') {
          boundaryLine = turf.polygonToLine(water as any);
        } else if (water.type === 'LineString' || water.type === 'MultiLineString') {
          boundaryLine = { type: water.type, coordinates: water.coordinates } as any;
        }
        if (boundaryLine) {
          const endPoint = routeGeometry.coordinates[routeGeometry.coordinates.length - 1];
          const snapped = turf.nearestPointOnLine(boundaryLine as any, endPoint as any) as any;
          if (snapped?.geometry?.coordinates) {
            const newCoords = routeGeometry.coordinates.slice();
            newCoords[newCoords.length - 1] = snapped.geometry.coordinates as [number, number];
            routeGeometry = { type: 'LineString', coordinates: newCoords } as any;
          }
        }
      }
    } catch {}

    map.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: routeGeometry
      }
    });

    map.addLayer({
      id: 'route-outline',
      type: 'line',
      source: 'route',
      paint: {
        'line-color': '#ffffff',
        'line-width': 5,
        'line-opacity': 0.8
      }
    });

    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': '#3b82f6',
        'line-width': 3,
        'line-opacity': 1.0
      }
    });
  };

  // Stäng navigation
  const handleCloseNavigation = () => {
    setCurrentRoute(null);
    setRouteLoading(false);
    
    // Ta bort rutt från kartan
    if (mapRef.current) {
      const map = mapRef.current;
      const removeIfExists = (type: 'layer' | 'source', id: string) => {
        if (type === 'layer' && map.getLayer(id)) map.removeLayer(id);
        if (type === 'source' && map.getSource(id)) map.removeSource(id);
      };
      ['route-line', 'route-outline', 'route-vehicle-line', 'route-vehicle-outline', 'route-walk-line', 'route-walk-outline', 'route-walk-graded-line', 'route-walk-final-line']
        .forEach(id => removeIfExists('layer', id));
      ['route', 'route-vehicle', 'route-walk', 'route-walk-graded', 'route-walk-final']
        .forEach(id => removeIfExists('source', id));
    }
  };

  // Tillbaka från navigation: visa info-panel igen och ta bort rutt från karta
  const handleBackFromNavigation = () => {
    handleCloseNavigation();
  };

  // Byt transporttyp
  const handleTransportChange = async (mode: TransportMode) => {
    setNavigationMode(mode);
    
    // Om vi redan har en rutt, uppdatera den med nytt transportläge
    if (selectedWaterBody && userPosition) {
      setRouteLoading(true);
      
      // Professionella meddelanden för omberäkning
      const statusMessages = mode === 'foot-walking' 
        ? [
            'Beräknar gångrutt...',
            'Analyserar stigar...',
            'Beräknar höjdprofil...'
          ]
        : mode === 'cycling-regular'
        ? [
            'Planerar cykelrutt...',
            'Söker cykelvägar...',
            'Optimerar ruttval...'
          ]
        : [
            'Planerar bilrutt...',
            'Söker körvägar...',
            'Kontrollerar tillgänglighet...'
          ];
      
      let statusIndex = 0;
      setNavigationStatus(statusMessages[0]);
      
      const statusInterval = setInterval(() => {
        statusIndex = (statusIndex + 1) % statusMessages.length;
        setNavigationStatus(statusMessages[statusIndex]);
      }, 2000);
      
      try {
        // Hitta närmaste strandpunkt
        const shorePoint = findNearestShorePoint(selectedWaterBody, userPosition);
        const route = await getRoute(userPosition, shorePoint, mode);
        
        clearInterval(statusInterval);
        
        if (route) {
          setNavigationStatus('Rutt uppdaterad!');
          setCurrentRoute(route);
          drawRouteOnMap(route);
          
          // Zooma kartan för att visa hela rutten
          if (mapRef.current) {
            if (route.bbox) {
              const [minLng, minLat, maxLng, maxLat] = route.bbox;
              mapRef.current.fitBounds(
                [[minLng, minLat], [maxLng, maxLat]],
                { padding: 50, duration: 1000 }
              );
            } else if (route.geometry?.coordinates?.length) {
              try {
                const bbox = turf.bbox({ type: 'LineString', coordinates: route.geometry.coordinates } as any);
                mapRef.current.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 50, duration: 1000 });
              } catch {}
            }
          }
        }
      } catch (error) {
        clearInterval(statusInterval);
        console.error('Fel vid byte av transporttyp:', error);
        setNavigationStatus('');
      } finally {
        clearInterval(statusInterval);
        setRouteLoading(false);
        setTimeout(() => setNavigationStatus(''), 2000);
      }
    }
  };

  // Hämta data i bakgrunden och uppdatera geometri om behövs
  const fetchWaterBodyDataInBackground = async (waterBody: SMHIWaterBody) => {
    try {
      // Choose the right service based on feature flag
      if (USE_PLACES_SYSTEM) {
        // NEW SYSTEM: Use water_bodies_with_places for VISS data
        const details = await getWaterBodyWithPlacesDetails(waterBody.id);
        
        if (details) {
          // Uppdatera med VISS-data från nya systemet
          setWaterData(details.vissData || null);
          
          // Om vi fick bättre geometri, uppdatera highlighting
          if (details.waterBody.geometry && !waterBody.geometry) {
            waterBody.geometry = details.waterBody.geometry;
            // Visa förbättrad highlighting med fullständig geometri
            showImmediateHighlight(waterBody);
          }
        }
      } else {
        // OLD SYSTEM: Use water_bodies_integrated
        const details = await getSMHIWaterBodyDetails(waterBody.id);
        
        if (details) {
          // Uppdatera med VISS-data
          setWaterData(details.vissData || null);
          
          // Om vi fick bättre geometri, uppdatera highlighting
          if (details.waterBody.geometry && !waterBody.geometry) {
            waterBody.geometry = details.waterBody.geometry;
            // Visa förbättrad highlighting med fullständig geometri
            showImmediateHighlight(waterBody);
          }
        }
      }
    } catch (error) {
      console.error('Fel vid hämtning av vattendrags-detaljer:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full h-full">
      {/* Map Container */}
      <div ref={mapContainer} className="w-full h-full" />

      {/* Custom CSS for user location marker */}
      <style jsx global>{`
        .user-location-marker {
          position: relative;
          pointer-events: none;
        }
        .user-location-marker svg {
          display: block;
        }
        .user-location-marker .ping {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          opacity: 0;
          animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        .user-location-marker.mobile .ping {
          width: 40px;
          height: 40px;
          border: 2px solid #3b82f6;
        }
        .user-location-marker.desktop .ping {
          width: 20px;
          height: 20px;
          border: 2px solid #3b82f6;
        }
        @keyframes ping {
          75%, 100% {
            transform: translate(-50%, -50%) scale(2);
            opacity: 0;
          }
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
        }
      `}</style>

      {/* Geolocation error toast */}
      {geoError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1100] bg-red-600 text-white text-sm px-3 py-2 rounded shadow-lg">
          {geoError}
        </div>
      )}

      {/* Info Panel */}
      {selectedWaterBody && (
        <WaterBodyInfoPanel
          waterBody={selectedWaterBody}
          waterData={waterData}
          loading={loading}
          onClose={clearSelection}
          onNavigate={userPosition ? handleNavigate : undefined}
          layoutType={layoutType}
          route={currentRoute}
          routeLoading={routeLoading}
          navigationStatus={navigationStatus}
          onTransportChange={handleTransportChange}
          currentMode={navigationMode}
          onBackFromNavigation={handleBackFromNavigation}
        />
      )}
    </div>
  );
});

ScandinavianWaterMapGL.displayName = 'ScandinavianWaterMapGL';

export default ScandinavianWaterMapGL;