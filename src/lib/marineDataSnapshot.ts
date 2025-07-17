/**
 * Marine Data Snapshot Service
 * Sparar faktisk marin-data när fishing reports skapas för ML-träning
 */

import { FishingReport } from './fishingDataManager';

export interface MarineDataSnapshot {
  // Metadata
  reportId: string;
  timestamp: string;
  location: {
    centerLat: number;
    centerLng: number;
    bounds: {
      north: number;
      south: number;
      east: number;
      west: number;
    };
  };
  
  // Time window data (3 days before + report time)
  timeWindow: {
    start: string;
    end: string;
    reportTime: string;
  };
  
  // Actual marine parameters sampled from area-parameters
  marineData: MarineDataPoint[];
  
  // Fishing outcome
  fishingQuality: number;
  qualityLabel: string;
  customPercentage?: number;
  
  // Metadata
  createdAt: string;
  dataSource: 'area-parameters' | 'fallback';
}

export interface MarineDataPoint {
  timestamp: string;
  lat: number;
  lng: number;
  
  // Environmental parameters
  temperature?: number;
  salinity?: number;
  currentStrength?: number;
  currentDirection?: number;
  
  // Derived features
  seasonSin: number;
  seasonCos: number;
  
  // Temporal context
  hoursBeforeReport: number;
  isReportDay: boolean;
}

class MarineDataSnapshotService {
  private static instance: MarineDataSnapshotService;
  private snapshots: MarineDataSnapshot[] = [];
  private readonly STORAGE_KEY = 'marine_data_snapshots';
  private readonly MAX_SNAPSHOTS = 100; // Begränsa storlek

  public static getInstance(): MarineDataSnapshotService {
    if (!MarineDataSnapshotService.instance) {
      MarineDataSnapshotService.instance = new MarineDataSnapshotService();
    }
    return MarineDataSnapshotService.instance;
  }

  constructor() {
    this.loadSnapshots();
  }

  /**
   * Skapa snapshot av marin-data för en fishing report
   */
  public async createSnapshot(report: FishingReport): Promise<MarineDataSnapshot> {
    const reportDate = new Date(report.dateRange.start);
    const reportTime = new Date(report.dateRange.start + 'T' + report.timeRange.start);
    
    // Beräkna tidsintervall: 3 dagar före + rapportens tid
    const threeDaysBefore = new Date(reportTime);
    threeDaysBefore.setDate(threeDaysBefore.getDate() - 3);
    
    const timeWindow = {
      start: threeDaysBefore.toISOString(),
      end: reportTime.toISOString(),
      reportTime: reportTime.toISOString()
    };
    
    // Hämta faktisk marin-data
    const marineData = await this.fetchMarineDataForTimeWindow(
      report.location,
      timeWindow
    );
    
    // Konvertera fishing quality
    const fishingQuality = this.qualityToNumber(report.quality, report.customPercentage);
    
    const snapshot: MarineDataSnapshot = {
      reportId: report.id,
      timestamp: new Date().toISOString(),
      location: report.location,
      timeWindow,
      marineData,
      fishingQuality,
      qualityLabel: report.quality,
      customPercentage: report.customPercentage,
      createdAt: new Date().toISOString(),
      dataSource: marineData.length > 0 ? 'area-parameters' : 'fallback'
    };
    
    // Spara snapshot
    await this.saveSnapshot(snapshot);
    
    return snapshot;
  }

  /**
   * Hämta faktisk marin-data för tidsintervall
   */
  private async fetchMarineDataForTimeWindow(
    location: FishingReport['location'],
    timeWindow: { start: string; end: string; reportTime: string }
  ): Promise<MarineDataPoint[]> {
    const marineData: MarineDataPoint[] = [];
    
    try {
      // Hämta area-parameters data
      const areaData = await this.loadAreaParameters();
      
      if (!areaData?.points || !areaData?.metadata?.timestamps) {
        console.warn('⚠️ Ingen area-parameters data tillgänglig');
        return marineData;
      }
      
      // Hitta relevanta timestamps inom tidsintervallet
      const startTime = new Date(timeWindow.start);
      const endTime = new Date(timeWindow.end);
      const reportTime = new Date(timeWindow.reportTime);
      
      const relevantTimestamps = areaData.metadata.timestamps.filter((ts: string) => {
        const tsDate = new Date(ts);
        return tsDate >= startTime && tsDate <= endTime;
      });
      
      // Generera sampling points inom fishing location bounds
      const samplePoints = this.generateSamplePoints(location.bounds, 5); // 5x5 grid
      
      // För varje timestamp och samplingspunkt
      for (const timestamp of relevantTimestamps) {
        const tsDate = new Date(timestamp);
        const hoursBeforeReport = Math.round((reportTime.getTime() - tsDate.getTime()) / (1000 * 60 * 60));
        const isReportDay = Math.abs(hoursBeforeReport) < 24;
        
        // Beräkna säsongsfaktorer
        const dayOfYear = tsDate.getTime() / (1000 * 60 * 60 * 24 * 365.25) * 365.25;
        const seasonSin = Math.sin(2 * Math.PI * dayOfYear / 365.25);
        const seasonCos = Math.cos(2 * Math.PI * dayOfYear / 365.25);
        
        for (const point of samplePoints) {
          // Hämta faktisk data från area-parameters
          const parameterData = await this.getParameterDataForPoint(
            areaData,
            point.lat,
            point.lng,
            timestamp
          );
          
          if (parameterData) {
            marineData.push({
              timestamp,
              lat: point.lat,
              lng: point.lng,
              temperature: parameterData.temperature,
              salinity: parameterData.salinity,
              currentStrength: parameterData.currentStrength,
              currentDirection: parameterData.currentDirection,
              seasonSin,
              seasonCos,
              hoursBeforeReport,
              isReportDay
            });
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Fel vid hämtning av marine data:', error);
    }
    
    return marineData;
  }

  /**
   * Generera samplingspunkter inom bounds
   */
  private generateSamplePoints(bounds: any, gridSize: number = 5): Array<{lat: number, lng: number}> {
    const points: Array<{lat: number, lng: number}> = [];
    
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const lat = bounds.south + (bounds.north - bounds.south) * i / (gridSize - 1);
        const lng = bounds.west + (bounds.east - bounds.west) * j / (gridSize - 1);
        points.push({ lat, lng });
      }
    }
    
    return points;
  }

  /**
   * Hämta parameter data för specifik punkt och tid
   */
  private async getParameterDataForPoint(
    areaData: any,
    lat: number,
    lng: number,
    timestamp: string
  ): Promise<{
    temperature?: number;
    salinity?: number;
    currentStrength?: number;
    currentDirection?: number;
  } | null> {
    
    // Hitta närmaste punkt i area-parameters
    let nearestPoint = null;
    let minDistance = Infinity;
    
    for (const point of areaData.points) {
      const distance = Math.sqrt(
        Math.pow(lat - point.lat, 2) + Math.pow(lng - point.lng, 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestPoint = point;
      }
    }
    
    if (!nearestPoint || minDistance > 0.1) { // Max 0.1 grader avstånd
      return null;
    }
    
    // Hitta data för rätt timestamp
    const timestampPrefix = timestamp.substring(0, 13); // "2025-07-16T12"
    
    for (const dataEntry of nearestPoint.data) {
      if (dataEntry.time.startsWith(timestampPrefix)) {
        const currentData = dataEntry.current || {};
        const currentU = currentData.u;
        const currentV = currentData.v;
        
        return {
          temperature: dataEntry.temperature,
          salinity: dataEntry.salinity,
          currentStrength: currentU && currentV ? Math.sqrt(currentU * currentU + currentV * currentV) : undefined,
          currentDirection: currentU && currentV ? Math.atan2(currentV, currentU) * 180 / Math.PI : undefined
        };
      }
    }
    
    return null;
  }

  /**
   * Ladda area-parameters data
   */
  private async loadAreaParameters(): Promise<any> {
    try {
      const response = await fetch('/api/area-parameters');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('❌ Kunde inte ladda area-parameters:', error);
      return null;
    }
  }

  /**
   * Konvertera fishing quality till nummer
   */
  private qualityToNumber(quality: string, customPercentage?: number): number {
    if (quality === 'custom' && customPercentage !== undefined) {
      return customPercentage / 100; // Konvertera till 0-1 skala
    }
    
    const qualityMap = {
      'none': 0.0,
      'poor': 0.3,
      'fair': 0.6,
      'good': 0.8,
      'excellent': 1.0
    };
    
    return qualityMap[quality as keyof typeof qualityMap] || 0.0;
  }

  /**
   * Spara snapshot
   */
  private async saveSnapshot(snapshot: MarineDataSnapshot): Promise<void> {
    // Lägg till i minne
    this.snapshots.push(snapshot);
    
    // Begränsa antal snapshots
    if (this.snapshots.length > this.MAX_SNAPSHOTS) {
      this.snapshots = this.snapshots.slice(-this.MAX_SNAPSHOTS);
    }
    
    // Spara till localStorage
    this.saveToStorage();
    
    // Exportera till fil för Python-script
    await this.exportToFile(snapshot);
  }

  /**
   * Exportera till fil för Python-träning
   */
  private async exportToFile(snapshot: MarineDataSnapshot): Promise<void> {
    try {
      const exportData = {
        snapshots: this.snapshots,
        exportedAt: new Date().toISOString(),
        format: 'marine_data_snapshots_v1'
      };
      
      // Spara till public/data för Python access
      const response = await fetch('/api/export-marine-snapshots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(exportData)
      });
      
      if (!response.ok) {
        throw new Error(`Export failed: ${response.status}`);
      }
      
    } catch (error) {
      console.error('❌ Kunde inte exportera snapshots:', error);
    }
  }

  /**
   * Hämta alla snapshots
   */
  public getAllSnapshots(): MarineDataSnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Rensa gamla snapshots
   */
  public clearOldSnapshots(daysOld: number = 90): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const initialCount = this.snapshots.length;
    this.snapshots = this.snapshots.filter(
      snapshot => new Date(snapshot.createdAt) > cutoffDate
    );
    
    const removedCount = initialCount - this.snapshots.length;
    if (removedCount > 0) {
      this.saveToStorage();
    }
  }

  /**
   * Spara till localStorage
   */
  private saveToStorage(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.snapshots));
    } catch (error) {
      console.error('❌ Kunde inte spara snapshots till localStorage:', error);
    }
  }

  /**
   * Ladda från localStorage
   */
  private loadSnapshots(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.snapshots = JSON.parse(stored);
      }
    } catch (error) {
      console.error('❌ Kunde inte ladda snapshots från localStorage:', error);
      this.snapshots = [];
    }
  }

  /**
   * Få statistik om snapshots
   */
  public getStats(): {
    totalSnapshots: number;
    totalDataPoints: number;
    dateRange: { start: string; end: string } | null;
    averageDataPointsPerSnapshot: number;
    dataSourceDistribution: Record<string, number>;
  } {
    if (this.snapshots.length === 0) {
      return {
        totalSnapshots: 0,
        totalDataPoints: 0,
        dateRange: null,
        averageDataPointsPerSnapshot: 0,
        dataSourceDistribution: {}
      };
    }
    
    const totalDataPoints = this.snapshots.reduce((sum, s) => sum + s.marineData.length, 0);
    const dates = this.snapshots.map(s => s.createdAt).sort();
    
    const dataSourceDistribution = this.snapshots.reduce((acc, s) => {
      acc[s.dataSource] = (acc[s.dataSource] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      totalSnapshots: this.snapshots.length,
      totalDataPoints,
      dateRange: {
        start: dates[0],
        end: dates[dates.length - 1]
      },
      averageDataPointsPerSnapshot: totalDataPoints / this.snapshots.length,
      dataSourceDistribution
    };
  }
}

export const marineDataSnapshotService = MarineDataSnapshotService.getInstance(); 