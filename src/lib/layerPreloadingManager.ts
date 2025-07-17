// Global Layer Preloading Manager - koordinerar laddning av alla lager
// Implementerar prioriterad laddning och global cache

interface LayerMetadata {
  parameter: string;
  timestamps?: string[];
  images?: Array<{
    timestamp: string;
    filename: string;
  }>;
  total_images: number;
}

interface PreloadStatus {
  layer: string;
  status: 'pending' | 'loading' | 'loaded' | 'error';
  progress: number;
  totalImages: number;
  loadedImages: number;
  startTime?: number;
  endTime?: number;
}

class LayerPreloadingManager {
  private static instance: LayerPreloadingManager;
  private preloadStatuses: Map<string, PreloadStatus> = new Map();
  private metadataCache: Map<string, LayerMetadata> = new Map();
  private imageCache: Map<string, Map<string, HTMLImageElement>> = new Map();
  private isPreloading: boolean = false;
  
  // Prioriterad ordning för laddning
  private readonly LAYER_PRIORITY = [
    'current-magnitude',
    'temperature', 
    'salinity',
    'mackerel-probability'
  ] as const;
  
  private readonly LAYER_CONFIGS: Record<string, {
    metadataUrl: string;
    imageUrlPattern: string;
    delay: number;
    batchDelay: number;
  }> = {
    'current-magnitude': {
      metadataUrl: '/data/current-magnitude-images/metadata.json',
      imageUrlPattern: '/data/current-magnitude-images/current_magnitude_{timestamp}.png',
      delay: 100,
      batchDelay: 5
    },
    'temperature': {
      metadataUrl: '/data/temperature-images/metadata.json',
      imageUrlPattern: '/data/temperature-images/temperature_{timestamp}.png',
      delay: 200,
      batchDelay: 6
    },
    'salinity': {
      metadataUrl: '/data/salinity-images/metadata.json',
      imageUrlPattern: '/data/salinity-images/salinity_{timestamp}.png',
      delay: 400,
      batchDelay: 7
    },
    'mackerel-probability': {
      metadataUrl: '/data/mackerel-probability-images-mercator/metadata.json',
      imageUrlPattern: '/data/mackerel-probability-images-mercator/mackerel_probability_{timestamp}.png',
      delay: 300,
      batchDelay: 8
    }
  };

  private constructor() {
    // Initialisera status för alla lager
    this.LAYER_PRIORITY.forEach(layer => {
      this.preloadStatuses.set(layer, {
        layer,
        status: 'pending',
        progress: 0,
        totalImages: 0,
        loadedImages: 0
      });
    });
  }

  static getInstance(): LayerPreloadingManager {
    if (!LayerPreloadingManager.instance) {
      LayerPreloadingManager.instance = new LayerPreloadingManager();
    }
    return LayerPreloadingManager.instance;
  }

  // Starta preloading av alla lager
  async startPreloading(): Promise<void> {
    if (this.isPreloading) {
      return;
    }

    this.isPreloading = true;
    
    // Ladda metadata för alla lager först
    await this.loadAllMetadata();
    
    // Starta preloading av bilder i prioriterad ordning
    for (const layer of this.LAYER_PRIORITY) {
      await this.preloadLayer(layer);
    }
    
    this.isPreloading = false;
  }

  // Ladda metadata för alla lager
  private async loadAllMetadata(): Promise<void> {
    
    const metadataPromises = this.LAYER_PRIORITY.map(async (layer) => {
      try {
        const config = this.LAYER_CONFIGS[layer];
        const response = await fetch(config.metadataUrl);
        
        if (!response.ok) {
          console.warn(`⚠️ Kunde inte ladda metadata för ${layer}`);
          return;
        }
        
        const metadata: LayerMetadata = await response.json();
        this.metadataCache.set(layer, metadata);
        
        // Uppdatera status
        const status = this.preloadStatuses.get(layer);
        if (status) {
          status.totalImages = metadata.total_images || 0;
        }
        
      } catch (error) {
        console.warn(`❌ Fel vid laddning av metadata för ${layer}:`, error);
      }
    });
    
    await Promise.all(metadataPromises);
  }

  // Preload ett specifikt lager
  private async preloadLayer(layer: string): Promise<void> {
    const status = this.preloadStatuses.get(layer);
    const config = this.LAYER_CONFIGS[layer];
    const metadata = this.metadataCache.get(layer);
    
    if (!status || !config || !metadata) {
      console.warn(`⚠️ Kunde inte starta preloading för ${layer} - saknar status/config/metadata`);
      return;
    }

    status.status = 'loading';
    status.startTime = Date.now();
    
    // Förbered image cache för detta lager
    this.imageCache.set(layer, new Map());
    const layerImageCache = this.imageCache.get(layer)!;
    
    // Hämta timestamps
    const timestamps = this.getTimestampsFromMetadata(metadata);
    
    // Preload bilder med delay
    await new Promise(resolve => setTimeout(resolve, config.delay));
    
    let loadedCount = 0;
    for (const timestamp of timestamps) {
      const safeTimestamp = timestamp.replace(/:/g, '-').replace(/\+/g, 'plus');
      const imageUrl = config.imageUrlPattern.replace('{timestamp}', safeTimestamp);
      
      try {
        const img = await this.preloadImage(imageUrl);
        layerImageCache.set(safeTimestamp, img);
        loadedCount++;
        
        // Uppdatera status
        status.loadedImages = loadedCount;
        status.progress = (loadedCount / timestamps.length) * 100;
        
        // Liten delay mellan bilder
        await new Promise(resolve => setTimeout(resolve, config.batchDelay));
      } catch (error) {
        console.warn(`⚠️ Kunde inte preload bild för ${layer}:`, safeTimestamp);
      }
    }
    
    status.status = 'loaded';
    status.endTime = Date.now();
    const loadTime = status.endTime - (status.startTime || 0);
    
  }

  // Preload en bild
  private preloadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  // Hämta timestamps från metadata
  private getTimestampsFromMetadata(metadata: LayerMetadata): string[] {
    if (metadata.images) {
      return metadata.images.map(img => img.timestamp);
    } else if (metadata.timestamps) {
      return metadata.timestamps;
    }
    return [];
  }

  // Hämta preloaded bild
  getPreloadedImage(layer: string, timestamp: string): HTMLImageElement | null {
    const layerCache = this.imageCache.get(layer);
    if (!layerCache) return null;
    
    const safeTimestamp = timestamp.replace(/:/g, '-').replace(/\+/g, 'plus');
    return layerCache.get(safeTimestamp) || null;
  }

  // Hämta preloading status
  getPreloadingStatus(layer: string): PreloadStatus | null {
    return this.preloadStatuses.get(layer) || null;
  }

  // Hämta alla preloading statuses
  getAllPreloadingStatuses(): PreloadStatus[] {
    return Array.from(this.preloadStatuses.values());
  }

  // Hämta metadata för lager
  getMetadata(layer: string): LayerMetadata | null {
    return this.metadataCache.get(layer) || null;
  }

  // Kontrollera om preloading är klar
  isPreloadingComplete(): boolean {
    return Array.from(this.preloadStatuses.values()).every(status => 
      status.status === 'loaded' || status.status === 'error'
    );
  }

  // Rensa cache (för minne)
  clearCache(): void {
    this.imageCache.clear();
    this.metadataCache.clear();
    this.preloadStatuses.forEach(status => {
      status.status = 'pending';
      status.progress = 0;
      status.loadedImages = 0;
    });
  }
}

export default LayerPreloadingManager; 