'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { fishingDataManager, FishingReport } from '@/lib/fishingDataManager';
import { mackerelCalibration, CalibrationResult } from '@/lib/mackerelModelCalibration';
import { X, TrendingUp, AlertTriangle, CheckCircle, BarChart3, Calendar, MapPin, Settings } from 'lucide-react';

interface ValidationResult {
  reportId: string;
  report: FishingReport;
  modelPrediction: number;
  actualQuality: number;
  difference: number;
  accuracy: 'good' | 'fair' | 'poor';
}

interface FishingValidationDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

const FishingValidationDashboard: React.FC<FishingValidationDashboardProps> = ({
  isOpen,
  onClose
}) => {
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState<'all' | '30days' | '7days'>('all');
  const [calibrationStatus, setCalibrationStatus] = useState<{
    hasCalibration: boolean;
    needsUpdate: boolean;
    calibration: CalibrationResult | null;
    recommendations: string[];
  } | null>(null);

  // Mock function för att beräkna modellens prediction för en rapport
  // NU MED DATADRIVEN KALIBRERING
  const calculateModelPrediction = (report: FishingReport): number => {
    // Simplified prediction based on our current model logic
    const { centerLat: lat, centerLng: lng } = report.location;
    const date = new Date(report.dateRange.start);
    
    // Simulated environmental parameters (i verkligheten skulle dessa hämtas från faktisk data)
    const temperature = 15 + Math.sin((date.getMonth() - 1) * Math.PI / 6) * 8; // Seasonal variation
    const salinity = lng > 13.5 ? 32 : (lng > 12.5 ? 25 : 15); // Geographic variation
    const currentStrength = 0.3 + Math.random() * 0.4;
    
    // Seasonal factor
    const dayOfYear = date.getTime() / (1000 * 60 * 60 * 24) % 365.25;
    const seasonalRadians = (dayOfYear - 200) * 2 * Math.PI / 365;
    const seasonalFactor = (Math.cos(seasonalRadians) + 1) / 2;
    
    // Simplified model logic matching our improved coefficients
    let tempFactor = 0;
    if (temperature < 8) tempFactor = -2.0;
    else if (temperature < 12) tempFactor = -1.0;
    else if (temperature < 15) tempFactor = 0.0;
    else if (temperature <= 20) tempFactor = (temperature - 15) * 0.4;
    else tempFactor = 2.0 - (temperature - 20) * 0.2;
    
    let salinityFactor = 0;
    if (salinity < 8) salinityFactor = -3.0;
    else if (salinity < 15) salinityFactor = -1.0 + (salinity - 8) * 0.3;
    else if (salinity < 25) salinityFactor = 1.0 + (salinity - 15) * 0.1;
    else salinityFactor = 2.0;
    
    const currentFactor = currentStrength < 0.5 ? currentStrength * 0.8 : 0.4;
    
    let seasonBoost = 0;
    if (seasonalFactor > 0.8) seasonBoost = 3.0;
    else if (seasonalFactor > 0.6) seasonBoost = 2.0;
    else if (seasonalFactor > 0.4) seasonBoost = 1.0;
    else if (seasonalFactor > 0.2) seasonBoost = -1.0;
    else seasonBoost = -3.0;
    
    // ANVÄND KALIBRERAD INTERCEPT istället för hårdkodad -8.0
    const interceptOffset = mackerelCalibration.getCurrentInterceptOffset();
    const calibratedIntercept = -8.0 + interceptOffset;
    
    const Z = calibratedIntercept + tempFactor + salinityFactor + currentFactor + seasonBoost;
    const probability = 1 / (1 + Math.exp(-Z));
    
    return Math.round(probability * 100);
  };

  // Ladda kalibrering när komponenten laddas
  useEffect(() => {
    const loadCalibration = () => {
      const status = mackerelCalibration.getCalibrationStatus();
      setCalibrationStatus(status);
    };
    
    loadCalibration();
  }, []);

  // Konvertera rapport-kvalitet till numeriskt värde
  const qualityToNumber = (quality: FishingReport['quality']): number => {
    const qualityMap = {
      'excellent': 100,
      'good': 80,
      'fair': 60,
      'poor': 30,
      'none': 0
    };
    return qualityMap[quality];
  };

  // Beräkna validering för alla rapporter
  const calculateValidation = () => {
    setLoading(true);
    
    try {
      const reports = fishingDataManager.getAllReports();
      
      // Filtrera baserat på tidsram
      const filteredReports = reports.filter(report => {
        if (selectedTimeframe === 'all') return true;
        
        const reportDate = new Date(report.dateRange.start);
        const now = new Date();
        const daysDiff = Math.floor((now.getTime() - reportDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (selectedTimeframe === '30days') return daysDiff <= 30;
        if (selectedTimeframe === '7days') return daysDiff <= 7;
        return true;
      });
      
      const results: ValidationResult[] = filteredReports.map(report => {
        const modelPrediction = calculateModelPrediction(report);
        const actualQuality = qualityToNumber(report.quality);
        const difference = modelPrediction - actualQuality;
        
        // Bestäm träffsäkerhet
        let accuracy: 'good' | 'fair' | 'poor';
        const absDiff = Math.abs(difference);
        if (absDiff <= 15) accuracy = 'good';
        else if (absDiff <= 30) accuracy = 'fair';
        else accuracy = 'poor';
        
        return {
          reportId: report.id,
          report,
          modelPrediction,
          actualQuality,
          difference,
          accuracy
        };
      });
      
      setValidationResults(results);
    } catch (error) {
      console.error('Validation calculation error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      calculateValidation();
    }
  }, [isOpen, selectedTimeframe]);

  // Beräkna sammanfattande statistik
  const stats = useMemo(() => {
    if (validationResults.length === 0) {
      return { totalReports: 0, averageAccuracy: 0, goodPredictions: 0, trendDirection: 'neutral' as const };
    }
    
    const good = validationResults.filter(r => r.accuracy === 'good').length;
    const fair = validationResults.filter(r => r.accuracy === 'fair').length;
    const poor = validationResults.filter(r => r.accuracy === 'poor').length;
    
    const averageAccuracy = Math.round(((good * 100 + fair * 60 + poor * 20) / validationResults.length));
    
    // Enkel trend-analys
    const avgDifference = validationResults.reduce((sum, r) => sum + r.difference, 0) / validationResults.length;
    const trendDirection = avgDifference > 10 ? 'over' : avgDifference < -10 ? 'under' : 'neutral';
    
    return {
      totalReports: validationResults.length,
      averageAccuracy,
      goodPredictions: good,
      trendDirection
    };
  }, [validationResults]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto m-4">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="text-blue-600" />
            Modell Validering
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {/* Tidsfilterkontroller */}
          <div className="mb-6">
            <div className="flex items-center gap-4 mb-4">
              <span className="text-sm font-medium">Tidsperiod:</span>
              <div className="flex bg-gray-100 rounded-lg p-1">
                {[
                  { value: 'all', label: 'Alla' },
                  { value: '30days', label: '30 dagar' },
                  { value: '7days', label: '7 dagar' }
                ].map(option => (
                  <button
                    key={option.value}
                    onClick={() => setSelectedTimeframe(option.value as any)}
                    className={`px-3 py-1 rounded-md text-sm transition-colors ${
                      selectedTimeframe === option.value
                        ? 'bg-white shadow-sm text-blue-600'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sammanfattande statistik */}
          {!loading && validationResults.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar size={16} className="text-blue-600" />
                  <span className="text-sm font-medium text-blue-800">Rapporter</span>
                </div>
                <div className="text-2xl font-bold text-blue-900">{stats.totalReports}</div>
              </div>
              
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle size={16} className="text-green-600" />
                  <span className="text-sm font-medium text-green-800">Träffsäkerhet</span>
                </div>
                <div className="text-2xl font-bold text-green-900">{stats.averageAccuracy}%</div>
              </div>
              
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp size={16} className="text-purple-600" />
                  <span className="text-sm font-medium text-purple-800">Bra prediktioner</span>
                </div>
                <div className="text-2xl font-bold text-purple-900">{stats.goodPredictions}</div>
              </div>
              
              <div className={`rounded-lg p-4 ${
                stats.trendDirection === 'over' ? 'bg-orange-50' :
                stats.trendDirection === 'under' ? 'bg-red-50' : 'bg-gray-50'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={16} className={
                    stats.trendDirection === 'over' ? 'text-orange-600' :
                    stats.trendDirection === 'under' ? 'text-red-600' : 'text-gray-600'
                  } />
                  <span className={`text-sm font-medium ${
                    stats.trendDirection === 'over' ? 'text-orange-800' :
                    stats.trendDirection === 'under' ? 'text-red-800' : 'text-gray-800'
                  }`}>Trend</span>
                </div>
                <div className={`text-sm font-bold ${
                  stats.trendDirection === 'over' ? 'text-orange-900' :
                  stats.trendDirection === 'under' ? 'text-red-900' : 'text-gray-900'
                }`}>
                  {stats.trendDirection === 'over' ? 'Överpredikterar' :
                   stats.trendDirection === 'under' ? 'Underpredikterar' : 'Balanserad'}
                </div>
              </div>
            </div>
          )}

          {/* Kalibrering status */}
          {calibrationStatus && (
            <div className="mb-6 border rounded-lg p-4 bg-gray-50">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Settings size={20} className="text-blue-600" />
                Modell Kalibrering
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-white rounded-lg p-3">
                  <div className="text-sm text-gray-600">Intercept</div>
                  <div className="text-lg font-semibold">
                    {calibrationStatus.calibration?.recommendedIntercept?.toFixed(3) || -8.0}
                  </div>
                  <div className="text-xs text-gray-500">
                    Offset: {calibrationStatus.calibration?.interceptOffset?.toFixed(3) || '0.000'}
                  </div>
                </div>
                
                <div className="bg-white rounded-lg p-3">
                  <div className="text-sm text-gray-600">Framgångsgrad</div>
                  <div className="text-lg font-semibold">
                    {((calibrationStatus.calibration?.baseSuccessRate || 0) * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500">
                    Av {calibrationStatus.calibration?.totalReports || 0} rapporter
                  </div>
                </div>
                
                <div className="bg-white rounded-lg p-3">
                  <div className="text-sm text-gray-600">Kalibrering</div>
                  <div className={`text-lg font-semibold ${
                    calibrationStatus.calibration?.useSlopeCalibration ? 'text-purple-600' : 'text-blue-600'
                  }`}>
                    {calibrationStatus.calibration?.useSlopeCalibration ? 'ML Model' : 'Heuristik'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {calibrationStatus.calibration?.useSlopeCalibration ? 'β-koefficienter' : 'Endast intercept'}
                  </div>
                </div>
                
                <div className="bg-white rounded-lg p-3">
                  <div className="text-sm text-gray-600">Konfidensgrad</div>
                  <div className={`text-lg font-semibold ${
                    calibrationStatus.calibration?.confidence === 'high' ? 'text-green-600' :
                    calibrationStatus.calibration?.confidence === 'medium' ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {calibrationStatus.calibration?.confidence === 'high' ? 'Hög' :
                     calibrationStatus.calibration?.confidence === 'medium' ? 'Medel' :
                     'Låg'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {calibrationStatus.needsUpdate ? 'Behöver uppdatering' : 'Uppdaterad'}
                  </div>
                </div>
              </div>
              
              {/* ML Coefficients för slope calibration */}
              {calibrationStatus.calibration?.useSlopeCalibration && calibrationStatus.calibration?.coefficients && (
                <div className="mt-4 bg-purple-50 rounded-lg p-4">
                  <h4 className="text-md font-semibold text-purple-800 mb-3">🔬 ML Koefficienter (β)</h4>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="bg-white rounded p-2">
                      <div className="text-xs text-gray-600">Temperatur</div>
                      <div className="font-semibold text-purple-700">
                        {calibrationStatus.calibration.coefficients.temperature.toFixed(3)}
                      </div>
                    </div>
                    <div className="bg-white rounded p-2">
                      <div className="text-xs text-gray-600">Salthalt</div>
                      <div className="font-semibold text-purple-700">
                        {calibrationStatus.calibration.coefficients.salinity.toFixed(3)}
                      </div>
                    </div>
                    <div className="bg-white rounded p-2">
                      <div className="text-xs text-gray-600">Ström</div>
                      <div className="font-semibold text-purple-700">
                        {calibrationStatus.calibration.coefficients.currentStrength.toFixed(3)}
                      </div>
                    </div>
                    <div className="bg-white rounded p-2">
                      <div className="text-xs text-gray-600">Säsong Sin</div>
                      <div className="font-semibold text-purple-700">
                        {calibrationStatus.calibration.coefficients.seasonSin.toFixed(3)}
                      </div>
                    </div>
                    <div className="bg-white rounded p-2">
                      <div className="text-xs text-gray-600">Säsong Cos</div>
                      <div className="font-semibold text-purple-700">
                        {calibrationStatus.calibration.coefficients.seasonCos.toFixed(3)}
                      </div>
                    </div>
                  </div>
                  
                  {calibrationStatus.calibration?.modelMetrics && (
                    <div className="mt-3 pt-3 border-t border-purple-200">
                      <div className="text-sm text-purple-800 font-medium mb-2">📊 Model Metrics</div>
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <span className="text-gray-600">Accuracy:</span>{' '}
                          <span className="font-semibold">
                            {(calibrationStatus.calibration.modelMetrics.accuracy * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">CV Score:</span>{' '}
                          <span className="font-semibold">
                            {(calibrationStatus.calibration.modelMetrics.crossValidationScore * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Regularization:</span>{' '}
                          <span className="font-semibold">
                            {calibrationStatus.calibration.modelMetrics.regularizationStrength.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {calibrationStatus.recommendations.length > 0 && (
                <div className="mt-3">
                  <div className="text-sm font-medium text-gray-700 mb-2">Rekommendationer:</div>
                  <ul className="space-y-1">
                    {calibrationStatus.recommendations.map((rec, index) => (
                      <li key={index} className="text-sm text-gray-600 flex items-start gap-1">
                        <span className="text-yellow-500">•</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Laddning */}
          {loading && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Beräknar validering...</p>
            </div>
          )}

          {/* Inga rapporter */}
          {!loading && validationResults.length === 0 && (
            <div className="text-center py-8">
              <BarChart3 size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600 mb-2">Inga fiskrapporter att validera</p>
              <p className="text-sm text-gray-500">Registrera några rapporter först för att se modelljämförelse</p>
            </div>
          )}

          {/* Detaljerade resultat */}
          {!loading && validationResults.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold mb-4">Detaljerade resultat</h3>
              
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {validationResults.map((result, index) => (
                  <div key={result.reportId} className={`border rounded-lg p-4 ${
                    result.accuracy === 'good' ? 'border-green-200 bg-green-50' :
                    result.accuracy === 'fair' ? 'border-yellow-200 bg-yellow-50' :
                    'border-red-200 bg-red-50'
                  }`}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-gray-500" />
                        <span className="font-medium">
                          {result.report.location.centerLat.toFixed(3)}, {result.report.location.centerLng.toFixed(3)}
                        </span>
                        <span className="text-sm text-gray-500">
                          {result.report.dateRange.start}
                        </span>
                      </div>
                      <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                        result.accuracy === 'good' ? 'bg-green-100 text-green-800' :
                        result.accuracy === 'fair' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {result.accuracy === 'good' ? 'Bra träff' :
                         result.accuracy === 'fair' ? 'OK träff' : 'Dålig träff'}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Modell:</span>
                        <div className="font-bold text-blue-600">{result.modelPrediction}%</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Verklighet:</span>
                        <div className="font-bold">{result.actualQuality}%</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Skillnad:</span>
                        <div className={`font-bold ${
                          result.difference > 0 ? 'text-orange-600' : 'text-blue-600'
                        }`}>
                          {result.difference > 0 ? '+' : ''}{result.difference}%
                        </div>
                      </div>
                    </div>
                    
                    {result.report.notes && (
                      <div className="mt-2 text-sm text-gray-600 italic">
                        "{result.report.notes}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Handlingsrekommendationer */}
          {!loading && validationResults.length > 0 && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-2">Rekommendationer</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                {validationResults.length < 10 && (
                  <li>• Samla fler rapporter (minst 20) för tillförlitlig validering</li>
                )}
                {stats.averageAccuracy < 60 && (
                  <li>• Modellen behöver kalibrering - fortsätt samla data från olika platser och tider</li>
                )}
                {stats.trendDirection === 'over' && (
                  <li>• Modellen överpredikterar - kan behöva justera temperatur/säsongsfaktorer</li>
                )}
                {stats.trendDirection === 'under' && (
                  <li>• Modellen underpredikterar - kan behöva öka viktningen av gynnsamma faktorer</li>
                )}
                {stats.averageAccuracy >= 70 && validationResults.length >= 15 && (
                  <li>• Bra modellprestanda! Nu kan du överväga att träna modellen med din data</li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FishingValidationDashboard; 