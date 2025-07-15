// Mackerel Model Calibration - Intercept adjustment based on fishing reports
import { fishingDataManager, FishingReport } from './fishingDataManager';

export interface CalibrationResult {
  interceptOffset: number;
  totalReports: number;
  qualityDistribution: Record<string, number>;
  averageQuality: number;
  baseSuccessRate: number;
  recommendedIntercept: number;
  confidence: 'low' | 'medium' | 'high';
  lastUpdated: string;
  
  // Ny: slope-kalibrering
  useSlopeCalibration: boolean;
  coefficients?: {
    temperature: number;
    salinity: number;
    currentStrength: number;
    seasonSin: number;
    seasonCos: number;
  };
  modelMetrics?: {
    accuracy: number;
    crossValidationScore: number;
    regularizationStrength: number;
  };
}

export class MackerelModelCalibration {
  private readonly CALIBRATION_STORAGE_KEY = 'mackerel_calibration_data';
  private readonly MIN_REPORTS_FOR_CALIBRATION = 3;
  private readonly MIN_REPORTS_FOR_HIGH_CONFIDENCE = 15;

  /**
   * Konvertera fishing quality till numeriskt värde för kalibrering
   */
  private qualityToNumber(quality: FishingReport['quality']): number {
    switch (quality) {
      case 'excellent': return 1.0;
      case 'good': return 0.8;
      case 'fair': return 0.6;
      case 'poor': return 0.3;
      case 'none': return 0.0;
      default: return 0.0;
    }
  }

  /**
   * Beräkna optimal intercept baserat på fishing reports
   */
  private calculateOptimalIntercept(reports: FishingReport[]): number {
    if (reports.length === 0) return -8.0; // Default heuristisk intercept

    // Beräkna andelen "bra fiske" (>= 0.6 quality)
    const goodReports = reports.filter(r => this.qualityToNumber(r.quality) >= 0.6);
    const successRate = goodReports.length / reports.length;

    // Logit-transformation: intercept = ln(p / (1-p))
    // Men vi vill ha en konservativ justering, inte ersätta hela interceptet
    const clampedSuccessRate = Math.max(0.01, Math.min(0.99, successRate));
    const targetLogit = Math.log(clampedSuccessRate / (1 - clampedSuccessRate));
    
    // Blend mellan heuristisk intercept (-8.0) och data-driven intercept
    const heuristicIntercept = -8.0;
    const dataWeight = Math.min(reports.length / 30, 0.5); // Max 50% data weight
    const blendedIntercept = heuristicIntercept * (1 - dataWeight) + targetLogit * dataWeight;

    return blendedIntercept;
  }

  /**
   * Beräkna konfidensgraden för kalibreringen
   */
  private calculateConfidence(reports: FishingReport[]): 'low' | 'medium' | 'high' {
    if (reports.length < this.MIN_REPORTS_FOR_CALIBRATION) return 'low';
    if (reports.length < this.MIN_REPORTS_FOR_HIGH_CONFIDENCE) return 'medium';
    return 'high';
  }

  /**
   * Enkel slope-kalibrering med mock-data för features
   * I verkligheten skulle denna använda faktiska parameterdata från area-parameters
   */
  private performSlopeCalibration(reports: FishingReport[]): {
    coefficients: {
      temperature: number;
      salinity: number;
      currentStrength: number;
      seasonSin: number;
      seasonCos: number;
    };
    metrics: {
      accuracy: number;
      crossValidationScore: number;
      regularizationStrength: number;
    };
  } {
    // För nu, mock en enkel slope-kalibrering
    // I framtiden skulle denna använda faktiska sklearn-liknande träning
    
    const features = reports.map(report => {
      const date = new Date(report.dateRange.start);
      const { centerLat: lat, centerLng: lng } = report.location;
      
      // Mock environmental parameters (skulle hämtas från faktisk data)
      const temperature = 15 + Math.sin((date.getMonth() - 1) * Math.PI / 6) * 8;
      const salinity = lng > 13.5 ? 32 : (lng > 12.5 ? 25 : 15);
      const currentStrength = 0.3 + Math.random() * 0.4;
      
      // Seasonal features
      const dayOfYear = date.getTime() / (1000 * 60 * 60 * 24) % 365.25;
      const seasonSin = Math.sin(2 * Math.PI * dayOfYear / 365.25);
      const seasonCos = Math.cos(2 * Math.PI * dayOfYear / 365.25);
      
      return {
        temperature,
        salinity,
        currentStrength,
        seasonSin,
        seasonCos,
        quality: this.qualityToNumber(report.quality)
      };
    });

    // Enkel korrelations-baserad koefficient-uppskattning
    // (I verkligheten: logistic regression med L2 regularization)
    const correlations = this.calculateSimpleCorrelations(features);
    
    // Regularisera koefficienterna (simulerar L2-regularization)
    const regularizationStrength = 0.1;
    const coefficients = {
      temperature: correlations.temperature * (1 - regularizationStrength),
      salinity: correlations.salinity * (1 - regularizationStrength),
      currentStrength: correlations.currentStrength * (1 - regularizationStrength),
      seasonSin: correlations.seasonSin * (1 - regularizationStrength),
      seasonCos: correlations.seasonCos * (1 - regularizationStrength)
    };

    // Mock metrics (skulle komma från riktig cross-validation)
    const accuracy = 0.7 + Math.random() * 0.2; // 70-90%
    const crossValidationScore = accuracy - 0.1 + Math.random() * 0.1;

    return {
      coefficients,
      metrics: {
        accuracy,
        crossValidationScore,
        regularizationStrength
      }
    };
  }

  /**
   * Beräkna enkla korrelationer mellan features och fishing quality
   */
  private calculateSimpleCorrelations(features: Array<{
    temperature: number;
    salinity: number;
    currentStrength: number;
    seasonSin: number;
    seasonCos: number;
    quality: number;
  }>): {
    temperature: number;
    salinity: number;
    currentStrength: number;
    seasonSin: number;
    seasonCos: number;
  } {
    const n = features.length;
    
    // Beräkna medelvärden
    const meanQuality = features.reduce((sum, f) => sum + f.quality, 0) / n;
    const meanTemp = features.reduce((sum, f) => sum + f.temperature, 0) / n;
    const meanSalinity = features.reduce((sum, f) => sum + f.salinity, 0) / n;
    const meanCurrent = features.reduce((sum, f) => sum + f.currentStrength, 0) / n;
    const meanSeasonSin = features.reduce((sum, f) => sum + f.seasonSin, 0) / n;
    const meanSeasonCos = features.reduce((sum, f) => sum + f.seasonCos, 0) / n;
    
    // Beräkna korrelationer (Pearson)
    const tempCorr = this.pearsonCorrelation(
      features.map(f => f.temperature - meanTemp),
      features.map(f => f.quality - meanQuality)
    );
    
    const salinityCorr = this.pearsonCorrelation(
      features.map(f => f.salinity - meanSalinity),
      features.map(f => f.quality - meanQuality)
    );
    
    const currentCorr = this.pearsonCorrelation(
      features.map(f => f.currentStrength - meanCurrent),
      features.map(f => f.quality - meanQuality)
    );
    
    const seasonSinCorr = this.pearsonCorrelation(
      features.map(f => f.seasonSin - meanSeasonSin),
      features.map(f => f.quality - meanQuality)
    );
    
    const seasonCosCorr = this.pearsonCorrelation(
      features.map(f => f.seasonCos - meanSeasonCos),
      features.map(f => f.quality - meanQuality)
    );

    return {
      temperature: tempCorr * 0.5, // Skala ner för realistiska koefficienter
      salinity: salinityCorr * 0.3,
      currentStrength: currentCorr * 0.8,
      seasonSin: seasonSinCorr * 2.0,
      seasonCos: seasonCosCorr * 2.0
    };
  }

  /**
   * Beräkna Pearson korrelation mellan två arrays
   */
  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0) return 0;
    
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
    
    const denominator = Math.sqrt(sumX2 * sumY2);
    return denominator === 0 ? 0 : sumXY / denominator;
  }

  /**
   * Huvudfunktion för kalibrering
   */
  public calibrateModel(): CalibrationResult {
    const reports = fishingDataManager.getAllReports();
    
    // Beräkna kvalitetsdistribution
    const qualityDistribution = reports.reduce((acc, report) => {
      acc[report.quality] = (acc[report.quality] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Beräkna genomsnittlig kvalitet
    const averageQuality = reports.length > 0 
      ? reports.reduce((sum, r) => sum + this.qualityToNumber(r.quality), 0) / reports.length
      : 0;

    // Beräkna bas-framgångsgrad
    const baseSuccessRate = reports.length > 0
      ? reports.filter(r => this.qualityToNumber(r.quality) >= 0.6).length / reports.length
      : 0;

    // Beräkna optimal intercept
    const recommendedIntercept = this.calculateOptimalIntercept(reports);
    const interceptOffset = recommendedIntercept - (-8.0); // Offset från heuristisk baseline

    // Kolla om vi kan använda slope-kalibrering
    const useSlopeCalibration = reports.length >= 20;
    let coefficients = undefined;
    let modelMetrics = undefined;

    if (useSlopeCalibration) {
      const slopeResult = this.performSlopeCalibration(reports);
      coefficients = slopeResult.coefficients;
      modelMetrics = slopeResult.metrics;
    }

    const result: CalibrationResult = {
      interceptOffset,
      totalReports: reports.length,
      qualityDistribution,
      averageQuality,
      baseSuccessRate,
      recommendedIntercept,
      confidence: this.calculateConfidence(reports),
      lastUpdated: new Date().toISOString(),
      useSlopeCalibration,
      coefficients,
      modelMetrics
    };

    // Spara kalibrering
    this.saveCalibration(result);
    
    return result;
  }

  /**
   * Spara kalibrering till localStorage
   */
  private saveCalibration(calibration: CalibrationResult): void {
    localStorage.setItem(this.CALIBRATION_STORAGE_KEY, JSON.stringify(calibration));
  }

  /**
   * Ladda sparad kalibrering
   */
  public loadCalibration(): CalibrationResult | null {
    const stored = localStorage.getItem(this.CALIBRATION_STORAGE_KEY);
    if (!stored) return null;

    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to load calibration:', error);
      return null;
    }
  }

  /**
   * Kolla om kalibrering behöver uppdateras
   */
  public needsRecalibration(): boolean {
    const calibration = this.loadCalibration();
    if (!calibration) return true;

    const currentReports = fishingDataManager.getAllReports();
    const reportCountChanged = currentReports.length !== calibration.totalReports;
    
    const lastUpdated = new Date(calibration.lastUpdated);
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const tooOld = lastUpdated < oneWeekAgo;

    return reportCountChanged || tooOld;
  }

  /**
   * Hämta aktuell intercept-offset (för användning i probability calculation)
   */
  public getCurrentInterceptOffset(): number {
    if (this.needsRecalibration()) {
      const calibration = this.calibrateModel();
      return calibration.interceptOffset;
    }

    const calibration = this.loadCalibration();
    return calibration?.interceptOffset || 0;
  }

  /**
   * Få detaljerad status för debugging
   */
  public getCalibrationStatus(): {
    hasCalibration: boolean;
    needsUpdate: boolean;
    calibration: CalibrationResult | null;
    recommendations: string[];
  } {
    const calibration = this.loadCalibration();
    const needsUpdate = this.needsRecalibration();
    const reports = fishingDataManager.getAllReports();

    const recommendations: string[] = [];
    
    if (reports.length < this.MIN_REPORTS_FOR_CALIBRATION) {
      recommendations.push(`Behöver minst ${this.MIN_REPORTS_FOR_CALIBRATION} rapporter för kalibrering (har ${reports.length})`);
    } else if (reports.length < this.MIN_REPORTS_FOR_HIGH_CONFIDENCE) {
      recommendations.push(`För hög konfidensgrad, behöver ${this.MIN_REPORTS_FOR_HIGH_CONFIDENCE} rapporter (har ${reports.length})`);
    }

    if (calibration && calibration.confidence === 'low') {
      recommendations.push('Låg konfidensgrad - kalibrering kan vara opålitlig');
    }

    if (needsUpdate) {
      recommendations.push('Kalibrering behöver uppdateras');
    }

    return {
      hasCalibration: calibration !== null,
      needsUpdate,
      calibration,
      recommendations
    };
  }

  /**
   * Exportera kalibrering till JSON för Python-script
   * AUTOMATISK EXPORT direkt från React
   */
  public async exportCalibrationToFile(): Promise<boolean> {
    try {
      const calibration = this.calibrateModel();
      const reports = fishingDataManager.getAllReports();
      
      const exportData = {
        calibration,
        reports: reports.map(r => ({
          id: r.id,
          quality: r.quality,
          qualityNumeric: this.qualityToNumber(r.quality),
          dateRange: r.dateRange,
          location: r.location,
          createdAt: r.createdAt
        })),
        exportedAt: new Date().toISOString(),
        exportedBy: 'React mackerelModelCalibration.ts'
      };

      // Använd Fetch API för att skriva till fil via backend
      const response = await fetch('/api/export-calibration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(exportData)
      });

      if (!response.ok) {
        console.error('Failed to export calibration:', response.statusText);
        return false;
      }

      console.log('🎯 Automatisk kalibrering exporterad:', {
        totalReports: calibration.totalReports,
        intercept: calibration.recommendedIntercept.toFixed(3),
        useSlopeCalibration: calibration.useSlopeCalibration,
        confidence: calibration.confidence
      });

      return true;
    } catch (error) {
      console.error('Export calibration error:', error);
      return false;
    }
  }

  /**
   * Automatisk export när rapporter ändras
   */
  public async autoExportOnReportChange(): Promise<void> {
    const calibration = this.loadCalibration();
    const currentReports = fishingDataManager.getAllReports();
    
    // Exportera bara om antalet rapporter har ändrats
    const shouldExport = !calibration || 
                        calibration.totalReports !== currentReports.length ||
                        this.needsRecalibration();

    if (shouldExport) {
      await this.exportCalibrationToFile();
    }
  }
}

// Singleton export
export const mackerelCalibration = new MackerelModelCalibration(); 