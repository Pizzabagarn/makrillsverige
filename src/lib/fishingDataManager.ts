import type { FeatureCollection } from 'geojson';
import { generateSamplePointsFromWaterMask } from './extractWaterPoints';

export interface FishingReport {
  id: string;
  timestamp: string;
  dateRange: {
    start: string; // ISO date string
    end: string;   // ISO date string
  };
  timeRange: {
    start: string; // HH:MM format
    end: string;   // HH:MM format
  };
  location: {
    bounds: {
      north: number;
      south: number;
      east: number;
      west: number;
    };
    centerLat: number;
    centerLng: number;
  };
  quality: 'excellent' | 'good' | 'fair' | 'poor' | 'none';
  notes?: string;
  createdAt: string;
}

export interface BBoxTemplate {
  id: string;
  name: string;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  description?: string;
  createdAt: string;
}

export interface TrainingDataPoint {
  // Marine parameters
  temperature: number;
  salinity: number;
  currentStrength: number;
  currentDirection: number;
  
  // Temporal features
  seasonSin: number;
  seasonCos: number;
  
  // Historical features
  temperatureHist: number;
  salinityHist: number;
  currentStrengthHist: number;
  
  // Target variable
  fishingQuality: number; // 0-1 scale
  
  // Metadata
  lat: number;
  lng: number;
  datetime: string;
  reportId: string;
}

class FishingDataManager {
  private readonly STORAGE_KEY = 'fishing_reports';
  private readonly TRAINING_DATA_KEY = 'training_data_cache';
  private readonly BBOX_TEMPLATES_KEY = 'bbox_templates';
  private waterMaskCache: FeatureCollection | null = null;

  // Save fishing report
  saveFishingReport(report: Omit<FishingReport, 'id' | 'createdAt'>): FishingReport {
    const fullReport: FishingReport = {
      ...report,
      id: this.generateId(),
      createdAt: new Date().toISOString()
    };

    const reports = this.getAllReports();
    reports.push(fullReport);
    
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(reports));
    
    // 🔄 AUTOMATISK EXPORT av kalibrering när rapport sparas
    this.triggerCalibrationExport();
    
    return fullReport;
  }

  // Get all reports
  getAllReports(): FishingReport[] {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  // Delete report
  deleteReport(id: string): boolean {
    const reports = this.getAllReports();
    const filtered = reports.filter(r => r.id !== id);
    
    if (filtered.length !== reports.length) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
      
      // 🔄 AUTOMATISK EXPORT av kalibrering när rapport tas bort
      this.triggerCalibrationExport();
      
      return true;
    }
    return false;
  }

  // Convert quality to numerical value for training
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

  // Load water mask for filtering land areas
  private async loadWaterMask(): Promise<FeatureCollection> {
    if (this.waterMaskCache) {
      return this.waterMaskCache;
    }

    try {
      const response = await fetch('/data/scandinavian-waters.geojson');
      if (!response.ok) {
        throw new Error(`Failed to load water mask: ${response.status}`);
      }
      
      this.waterMaskCache = await response.json();
      if (this.waterMaskCache) {
        return this.waterMaskCache;
      }
      throw new Error('Water mask is null after loading');
    } catch (error) {
      console.error('Failed to load water mask:', error);
      // Return empty feature collection as fallback
      return {
        type: 'FeatureCollection',
        features: []
      };
    }
  }

  // Legacy method (kept as fallback)
  private generateGridPointsLegacy(bounds: FishingReport['location']['bounds'], resolution: number = 0.01): Array<{lat: number, lng: number}> {
    const points: Array<{lat: number, lng: number}> = [];
    
    for (let lat = bounds.south; lat <= bounds.north; lat += resolution) {
      for (let lng = bounds.west; lng <= bounds.east; lng += resolution) {
        points.push({ lat, lng });
      }
    }
    
    return points;
  }

  // Generate grid points within bounding box - WATER ONLY
  private async generateGridPoints(bounds: FishingReport['location']['bounds'], resolution: number = 0.01): Promise<Array<{lat: number, lng: number}>> {
    try {
      const waterMask = await this.loadWaterMask();
      
      // Create a temporary GeoJSON feature collection with our bounding box
      const bboxFeature: FeatureCollection = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [bounds.west, bounds.south],
              [bounds.east, bounds.south],
              [bounds.east, bounds.north],
              [bounds.west, bounds.north],
              [bounds.west, bounds.south]
            ]]
          }
        }]
      };
      
      // Intersect water mask with bounding box
      const intersectedFeatures = waterMask.features.filter(waterFeature => {
        // Simple bbox intersection check
        const bbox = this.getFeatureBbox(waterFeature);
        return !(bbox.maxLng < bounds.west || bbox.minLng > bounds.east ||
                bbox.maxLat < bounds.south || bbox.minLat > bounds.north);
      });
      
      const filteredWaterMask: FeatureCollection = {
        type: 'FeatureCollection',
        features: intersectedFeatures
      };
      
      // Generate water points within the bounding box
      const waterPoints = generateSamplePointsFromWaterMask(filteredWaterMask, resolution);
      
      console.log(`🌊 Generated ${waterPoints.length} water points (filtered from bbox)`);
      return waterPoints.map(p => ({ lat: p.lat, lng: p.lon }));
      
    } catch (error) {
      console.error('Failed to generate water-filtered points:', error);
      console.log('🔄 Falling back to legacy grid generation');
      return this.generateGridPointsLegacy(bounds, resolution);
    }
  }

  // Helper to get bounding box from a GeoJSON feature
  private getFeatureBbox(feature: any) {
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    
    const processCoords = (coords: any[]) => {
      if (typeof coords[0] === 'number') {
        minLng = Math.min(minLng, coords[0]);
        maxLng = Math.max(maxLng, coords[0]);
        minLat = Math.min(minLat, coords[1]);
        maxLat = Math.max(maxLat, coords[1]);
      } else {
        coords.forEach(processCoords);
      }
    };
    
    processCoords(feature.geometry.coordinates);
    return { minLng, maxLng, minLat, maxLat };
  }

  // Generate training data points from reports
  async generateTrainingData(): Promise<TrainingDataPoint[]> {
    const reports = this.getAllReports();
    const trainingPoints: TrainingDataPoint[] = [];

    for (const report of reports) {
      // Generate WATER-ONLY grid points within the bounding box
      const gridPoints = await this.generateGridPoints(report.location.bounds);
      
      console.log(`📊 Report ${report.id}: ${gridPoints.length} water points generated`);
      
      for (const point of gridPoints) {
        // For each day in the date range
        const startDate = new Date(report.dateRange.start);
        const endDate = new Date(report.dateRange.end);
        
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          // Generate hourly points within time range
          const timePoints = this.generateTimePoints(d, report.timeRange);
          
          for (const datetime of timePoints) {
            try {
              // Here you would fetch actual marine data for this point and time
              // For now, we'll create a placeholder structure
              const trainingPoint: TrainingDataPoint = {
                temperature: 0, // TODO: fetch from marine data
                salinity: 0,    // TODO: fetch from marine data  
                currentStrength: 0, // TODO: fetch from marine data
                currentDirection: 0, // TODO: fetch from marine data
                seasonSin: Math.sin(2 * Math.PI * datetime.getTime() / (365.25 * 24 * 60 * 60 * 1000)),
                seasonCos: Math.cos(2 * Math.PI * datetime.getTime() / (365.25 * 24 * 60 * 60 * 1000)),
                temperatureHist: 0, // TODO: calculate from historical data
                salinityHist: 0,    // TODO: calculate from historical data
                currentStrengthHist: 0, // TODO: calculate from historical data
                fishingQuality: this.qualityToNumber(report.quality),
                lat: point.lat,
                lng: point.lng,
                datetime: datetime.toISOString(),
                reportId: report.id
              };
              
              trainingPoints.push(trainingPoint);
            } catch (error) {
              console.warn('Failed to generate training point:', error);
            }
          }
        }
      }
    }

    return trainingPoints;
  }

  // Generate time points within time range
  private generateTimePoints(date: Date, timeRange: FishingReport['timeRange']): Date[] {
    const points: Date[] = [];
    const [startHour, startMin] = timeRange.start.split(':').map(Number);
    const [endHour, endMin] = timeRange.end.split(':').map(Number);
    
    for (let hour = startHour; hour <= endHour; hour++) {
      const startMinute = (hour === startHour) ? startMin : 0;
      const endMinute = (hour === endHour) ? endMin : 59;
      
      for (let minute = startMinute; minute <= endMinute; minute += 60) { // Hourly intervals
        const datetime = new Date(date);
        datetime.setHours(hour, minute, 0, 0);
        points.push(datetime);
      }
    }
    
    return points;
  }

  // Export data for external training
  exportTrainingData(): string {
    const reports = this.getAllReports();
    return JSON.stringify({
      reports,
      exportedAt: new Date().toISOString(),
      format: 'fishing_data_v1'
    }, null, 2);
  }

  // Export in scikit-learn ready format
  exportForScikitLearn(): string {
    // This would be implemented after generateTrainingData is complete
    return JSON.stringify({
      message: 'Training data generation requires marine data integration',
      structure: {
        features: ['temperature', 'salinity', 'currentStrength', 'currentDirection', 'seasonSin', 'seasonCos', 'temperatureHist', 'salinityHist', 'currentStrengthHist'],
        target: 'fishingQuality',
        format: 'ready for pandas.DataFrame'
      }
    }, null, 2);
  }

  // Trigger download of training data
  downloadTrainingData(): void {
    const exportData = this.exportTrainingData();
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `fishing_data_export_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Import and merge data from JSON file
  importAndMergeData(jsonData: string): { imported: number; duplicates: number; errors: number } {
    try {
      const data = JSON.parse(jsonData);
      const existingReports = this.getAllReports();
      const incomingReports = data.reports || [];
      
      let imported = 0;
      let duplicates = 0;
      let errors = 0;
      
      // Create a set of existing report IDs for fast lookup
      const existingIds = new Set(existingReports.map(r => r.id));
      
      const reportsToAdd: FishingReport[] = [];
      
      for (const report of incomingReports) {
        try {
          // Skip if report already exists
          if (existingIds.has(report.id)) {
            duplicates++;
            continue;
          }
          
          // Validate report structure
          if (!this.validateReportStructure(report)) {
            errors++;
            continue;
          }
          
          reportsToAdd.push(report);
          imported++;
        } catch (error) {
          errors++;
        }
      }
      
      // Add new reports to storage
      if (reportsToAdd.length > 0) {
        const allReports = [...existingReports, ...reportsToAdd];
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allReports));
      }
      
      return { imported, duplicates, errors };
    } catch (error) {
      throw new Error('Invalid JSON format');
    }
  }

  // Validate report structure
  private validateReportStructure(report: any): boolean {
    return (
      report &&
      typeof report.id === 'string' &&
      report.dateRange &&
      typeof report.dateRange.start === 'string' &&
      typeof report.dateRange.end === 'string' &&
      report.timeRange &&
      typeof report.timeRange.start === 'string' &&
      typeof report.timeRange.end === 'string' &&
      report.location &&
      typeof report.location.centerLat === 'number' &&
      typeof report.location.centerLng === 'number' &&
      report.location.bounds &&
      typeof report.quality === 'string' &&
      ['excellent', 'good', 'fair', 'poor', 'none'].includes(report.quality)
    );
  }

  // Automatic backup functionality
  createAutomaticBackup(): boolean {
    try {
      const reports = this.getAllReports();
      if (reports.length === 0) return false;

      const backupData = {
        reports,
        backedUpAt: new Date().toISOString(),
        format: 'fishing_data_backup_v1',
        totalReports: reports.length
      };

      const timestamp = new Date().toISOString().split('T')[0];
      const backupKey = `fishing_backup_${timestamp}`;
      
      // Store backup in localStorage with different key
      localStorage.setItem(backupKey, JSON.stringify(backupData));
      
      // Keep only last 7 days of backups
      this.cleanOldBackups();
      
      return true;
    } catch (error) {
      console.error('Automatic backup failed:', error);
      return false;
    }
  }

  // Clean old automatic backups (keep last 7 days)
  private cleanOldBackups(): void {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);
      const cutoffString = cutoffDate.toISOString().split('T')[0];
      
      // Find and remove old backup keys
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('fishing_backup_')) {
          const dateStr = key.replace('fishing_backup_', '');
          if (dateStr < cutoffString) {
            localStorage.removeItem(key);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to clean old backups:', error);
    }
  }

  // Get available backups
  getAvailableBackups(): Array<{ date: string; key: string; reportCount: number }> {
    const backups: Array<{ date: string; key: string; reportCount: number }> = [];
    
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('fishing_backup_')) {
          const dateStr = key.replace('fishing_backup_', '');
          const backupData = localStorage.getItem(key);
          
          if (backupData) {
            try {
              const parsed = JSON.parse(backupData);
              backups.push({
                date: dateStr,
                key,
                reportCount: parsed.totalReports || 0
              });
            } catch (e) {
              // Skip invalid backups
            }
          }
        }
      }
      
      // Sort by date, newest first
      return backups.sort((a, b) => b.date.localeCompare(a.date));
    } catch (error) {
      console.error('Failed to get backups:', error);
      return [];
    }
  }

  // Restore from backup
  restoreFromBackup(backupKey: string): boolean {
    try {
      const backupData = localStorage.getItem(backupKey);
      if (!backupData) return false;
      
      const parsed = JSON.parse(backupData);
      if (parsed.reports && Array.isArray(parsed.reports)) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(parsed.reports));
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to restore backup:', error);
      return false;
    }
  }

  // Enhanced statistics with validation insights
  getStatistics(): {
    totalReports: number;
    byQuality: Record<string, number>;
    dateRange: { start: string; end: string } | null;
    averageLatitude: number;
    averageLongitude: number;
    reportsByMonth: Record<string, number>;
    readyForValidation: boolean;
    readyForTraining: boolean;
  } {
    const reports = this.getAllReports();
    
    if (reports.length === 0) {
      return {
        totalReports: 0,
        byQuality: {},
        dateRange: null,
        averageLatitude: 0,
        averageLongitude: 0,
        reportsByMonth: {},
        readyForValidation: false,
        readyForTraining: false
      };
    }

    // Quality distribution
    const byQuality = reports.reduce((acc, report) => {
      acc[report.quality] = (acc[report.quality] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Date range
    const dates = reports.map(r => r.dateRange.start).sort();
    const dateRange = {
      start: dates[0],
      end: dates[dates.length - 1]
    };

    // Average position
    const totalLat = reports.reduce((sum, r) => sum + r.location.centerLat, 0);
    const totalLng = reports.reduce((sum, r) => sum + r.location.centerLng, 0);
    const averageLatitude = totalLat / reports.length;
    const averageLongitude = totalLng / reports.length;

    // Reports by month
    const reportsByMonth = reports.reduce((acc, report) => {
      const month = report.dateRange.start.substring(0, 7); // YYYY-MM
      acc[month] = (acc[month] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Readiness assessment
    const readyForValidation = reports.length >= 5;
    const readyForTraining = reports.length >= 20 && Object.keys(reportsByMonth).length >= 2;

    return {
      totalReports: reports.length,
      byQuality,
      dateRange,
      averageLatitude,
      averageLongitude,
      reportsByMonth,
      readyForValidation,
      readyForTraining
    };
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Trigga automatisk export av mackerel kalibrering när rapporter ändras
   */
  private async triggerCalibrationExport(): Promise<void> {
    try {
      // Dynamisk import för att undvika circular dependencies
      const { mackerelCalibration } = await import('./mackerelModelCalibration');
      await mackerelCalibration.autoExportOnReportChange();
    } catch (error) {
      console.warn('⚠️ Kunde inte exportera kalibrering automatiskt:', error);
    }
  }
  
  // BBox Template Management
  saveBBoxTemplate(template: Omit<BBoxTemplate, 'id' | 'createdAt'>): BBoxTemplate {
    const fullTemplate: BBoxTemplate = {
      ...template,
      id: this.generateId(),
      createdAt: new Date().toISOString()
    };

    const templates = this.getAllBBoxTemplates();
    templates.push(fullTemplate);
    
    localStorage.setItem(this.BBOX_TEMPLATES_KEY, JSON.stringify(templates));
    return fullTemplate;
  }

  getAllBBoxTemplates(): BBoxTemplate[] {
    const stored = localStorage.getItem(this.BBOX_TEMPLATES_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  deleteBBoxTemplate(id: string): boolean {
    const templates = this.getAllBBoxTemplates();
    const filtered = templates.filter(t => t.id !== id);
    
    if (filtered.length !== templates.length) {
      localStorage.setItem(this.BBOX_TEMPLATES_KEY, JSON.stringify(filtered));
      return true;
    }
    return false;
  }

  getBBoxTemplate(id: string): BBoxTemplate | undefined {
    const templates = this.getAllBBoxTemplates();
    return templates.find(t => t.id === id);
  }
}

export const fishingDataManager = new FishingDataManager(); 