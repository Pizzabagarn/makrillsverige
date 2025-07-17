// Global Popup Preload Manager - förladdar data för snabbare popup prestanda
// Laddar vattenmask och makrill-data vid startup istället för vid första klick

interface PopupPreloadStatus {
  waterMask: 'pending' | 'loading' | 'loaded' | 'error';
  mackerelData: 'pending' | 'loading' | 'loaded' | 'error';
  currentTimestamp: string | null;
}

class PopupPreloadManager {
  private static instance: PopupPreloadManager;
  private status: PopupPreloadStatus = {
    waterMask: 'pending',
    mackerelData: 'pending',
    currentTimestamp: null
  };
  
  // Cache för förladdad data - delar cache med MapPin
  private waterMaskCache: any = null;
  private mackerelCache: Map<string, any> = new Map();
  
  private constructor() {}
  
  static getInstance(): PopupPreloadManager {
    if (!PopupPreloadManager.instance) {
      PopupPreloadManager.instance = new PopupPreloadManager();
    }
    return PopupPreloadManager.instance;
  }
  
  // Starta preloading av popup-data
  async startPreloading(): Promise<void> {
    const startTime = performance.now();
    
    // Starta båda parallellt för snabbare laddning
    await Promise.all([
      this.preloadWaterMask(),
      this.preloadCurrentMackerelData()
    ]);
    
    const totalTime = performance.now() - startTime;
  }
  
  // Förladda vattenmask
  private async preloadWaterMask(): Promise<void> {
    if (this.status.waterMask === 'loading' || this.status.waterMask === 'loaded') {
      return;
    }
    
    this.status.waterMask = 'loading';
    
    try {
      const startTime = performance.now();
      
      const response = await fetch('/data/scandinavian-waters.geojson');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      this.waterMaskCache = await response.json();
      const loadTime = performance.now() - startTime;
      
      this.status.waterMask = 'loaded';
    } catch (error) {
      this.status.waterMask = 'error';
      console.error('❌ Fel vid preloading av vattenmask:', error);
    }
  }
  
  // Förladda makrill-data för nuvarande tid
  private async preloadCurrentMackerelData(): Promise<void> {
    try {
      // Hämta area parameters för att få aktuell timestamp
      const areaResponse = await fetch('/api/area-parameters');
      if (!areaResponse.ok) {
        console.warn('⚠️ Kunde inte hämta area parameters för makrill preloading');
        return;
      }
      
      const areaData = await areaResponse.json();
      if (!areaData?.metadata?.timestamps?.length) {
        console.warn('⚠️ Inga timestamps hittades för makrill preloading');
        return;
      }
      
      // Hitta närmaste timestamp till nuvarande tid
      const now = new Date();
      const timestamps = areaData.metadata.timestamps;
      
      let closestTimestamp = timestamps[0];
      let minDiff = Math.abs(new Date(timestamps[0]).getTime() - now.getTime());
      
      for (const timestamp of timestamps) {
        const diff = Math.abs(new Date(timestamp).getTime() - now.getTime());
        if (diff < minDiff) {
          minDiff = diff;
          closestTimestamp = timestamp;
        }
      }
      
      this.status.currentTimestamp = closestTimestamp;
      
      // Ladda makrill-data för aktuell tid
      await this.preloadMackerelData(closestTimestamp);
      
      // Ladda även några timmar framåt/bakåt
      const currentIndex = timestamps.indexOf(closestTimestamp);
      const additionalTimestamps: string[] = [];
      
      // Lägg till 2 timmar framåt och bakåt
      for (let i = 1; i <= 2; i++) {
        if (currentIndex + i < timestamps.length) {
          additionalTimestamps.push(timestamps[currentIndex + i]);
        }
        if (currentIndex - i >= 0) {
          additionalTimestamps.push(timestamps[currentIndex - i]);
        }
      }
      
      // Ladda ytterligare timestamps med delays
      for (const timestamp of additionalTimestamps) {
        await this.preloadMackerelData(timestamp);
        // Kort paus för att inte blockera UI
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
    } catch (error) {
      console.error('❌ Fel vid preloading av makrill-data:', error);
    }
  }
  
  // Ladda makrill-data för en specifik timestamp
  private async preloadMackerelData(timestamp: string): Promise<void> {
    if (this.mackerelCache.has(timestamp)) {
      return;
    }
    
    this.status.mackerelData = 'loading';
    
    try {
      const startTime = performance.now();
      
      const response = await fetch(`/api/mackerel-values/${encodeURIComponent(timestamp)}`);
      if (!response.ok) {
        console.warn(`⚠️ Kunde inte ladda makrill-data för ${timestamp}`);
        return;
      }
      
      const data = await response.json();
      this.mackerelCache.set(timestamp, data);
      
      const loadTime = performance.now() - startTime;
      
      this.status.mackerelData = 'loaded';
    } catch (error) {
      this.status.mackerelData = 'error';
      console.warn(`❌ Fel vid preloading av makrill-data för ${timestamp}:`, error);
    }
  }
  
  // Hämta förladdad vattenmask
  getWaterMask(): any {
    return this.waterMaskCache;
  }
  
  // Hämta förladdad makrill-data
  getMackerelData(timestamp: string): any {
    return this.mackerelCache.get(timestamp);
  }
  
  // Kontrollera om data är förladdad
  isWaterMaskLoaded(): boolean {
    return this.status.waterMask === 'loaded';
  }
  
  isMackerelDataLoaded(timestamp: string): boolean {
    return this.mackerelCache.has(timestamp);
  }
  
  // Hämta preloading status
  getStatus(): PopupPreloadStatus {
    return { ...this.status };
  }
  
  // Kontrollera om all popup-data är redo för snabb prestanda
  isReadyForFastPopup(): boolean {
    return this.status.waterMask === 'loaded' && 
           this.status.mackerelData === 'loaded' && 
           this.status.currentTimestamp !== null;
  }
}

export default PopupPreloadManager; 