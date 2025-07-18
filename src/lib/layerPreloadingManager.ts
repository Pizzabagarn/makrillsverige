// src/lib/layerPreloadingManager.ts
export interface PreloadStatus {
  layer: string;
  status: 'pending' | 'loading' | 'loaded' | 'error';
  progress: number;
  totalImages: number;
  loadedImages: number;
  startTime?: number;
  endTime?: number;
}

export interface LayerMetadata {
  timestamps: string[];
  total_images: number;
  parameter?: string;
  wgs84_bbox?: [number, number, number, number];
}

class LayerPreloadingManager {
  private static instance: LayerPreloadingManager;
  private preloadStatuses: Map<string, PreloadStatus> = new Map();
  private metadataCache: Map<string, LayerMetadata> = new Map();
  private imageCache: Map<string, Map<string, HTMLImageElement>> = new Map();
  private isPreloading: boolean = false;
  
  // OPTIMERAD prioritering för Vercel - mest kritiska lager först
  private readonly LAYER_PRIORITY = [
    'current-magnitude',
    'mackerel-probability', // Flyttad upp - ofta använd
    'temperature', 
    'salinity'
  ] as const;
  
  // OPTIMERADE inställningar för Vercel
  private readonly LAYER_CONFIGS: Record<string, {
    metadataUrl: string;
    imageUrlPattern: string;
    delay: number;
    batchDelay: number;
    maxParallelLoads: number; // NYTT: Begränsa parallell laddning
    priority: 'critical' | 'high' | 'normal' | 'low'; // NYTT: Prioritering
  }> = {
    'current-magnitude': {
      metadataUrl: '/data/current-magnitude-images/metadata.json',
      imageUrlPattern: '/data/current-magnitude-images/current_magnitude_{timestamp}.png',
      delay: 50, // Snabbare start
      batchDelay: 3, // Mindre delay mellan bilder
      maxParallelLoads: 6, // Fler parallella laddningar
      priority: 'critical'
    },
    'mackerel-probability': {
      metadataUrl: '/data/mackerel-probability-images-mercator/metadata.json',
      imageUrlPattern: '/data/mackerel-probability-images-mercator/mackerel_probability_{timestamp}.png',
      delay: 100,
      batchDelay: 4,
      maxParallelLoads: 4,
      priority: 'high'
    },
    'temperature': {
      metadataUrl: '/data/temperature-images/metadata.json',
      imageUrlPattern: '/data/temperature-images/temperature_{timestamp}.png',
      delay: 200,
      batchDelay: 5,
      maxParallelLoads: 3,
      priority: 'normal'
    },
    'salinity': {
      metadataUrl: '/data/salinity-images/metadata.json',
      imageUrlPattern: '/data/salinity-images/salinity_{timestamp}.png',
      delay: 300,
      batchDelay: 6,
      maxParallelLoads: 2,
      priority: 'normal'
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

  // Hämta status för alla lager
  getAllStatuses(): PreloadStatus[] {
    return Array.from(this.preloadStatuses.values());
  }

  // Hämta status för specifikt lager
  getStatus(layer: string): PreloadStatus | null {
    return this.preloadStatuses.get(layer) || null;
  }

  // Starta preloading för alla lager
  async startPreloading(): Promise<void> {
    if (this.isPreloading) {
      console.log('⏳ Preloading pågår redan...');
      return;
    }

    this.isPreloading = true;
    console.log('🚀 Startar prioriterad layer preloading...');

    try {
      // Ladda metadata för alla lager först (parallellt)
      await this.loadAllMetadata();

      // Ladda lager i prioriteringsordning
      for (const layer of this.LAYER_PRIORITY) {
        const config = this.LAYER_CONFIGS[layer];
        if (config.priority === 'critical') {
          await this.preloadLayer(layer); // Vänta på kritiska lager
        } else {
          this.preloadLayer(layer); // Kör höga/normala lager parallellt
        }
      }

      console.log('✅ Preloading startat för alla lager');
    } catch (error) {
      console.error('❌ Preloading misslyckades:', error);
    } finally {
      this.isPreloading = false;
    }
  }

  // Ladda metadata för alla lager (parallellt)
  private async loadAllMetadata(): Promise<void> {
    const metadataPromises = this.LAYER_PRIORITY.map(async (layer) => {
      const config = this.LAYER_CONFIGS[layer];
      try {
        const response = await fetch(config.metadataUrl);
        if (response.ok) {
          const metadata = await response.json();
          this.metadataCache.set(layer, metadata);
          
          // Uppdatera total images count
          const status = this.preloadStatuses.get(layer);
          if (status) {
            status.totalImages = metadata.timestamps?.length || 0;
          }
        }
      } catch (error) {
        console.warn(`⚠️ Kunde inte ladda metadata för ${layer}:`, error);
      }
    });

    await Promise.all(metadataPromises);
    console.log('📊 Metadata laddad för alla lager');
  }

  // Preload ett specifikt lager med optimerad parallellisering
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
    
    // Vänta på initial delay
    await new Promise(resolve => setTimeout(resolve, config.delay));
    
    // Dela upp timestamps i batches för parallell laddning
    const batchSize = config.maxParallelLoads;
    const batches = [];
    for (let i = 0; i < timestamps.length; i += batchSize) {
      batches.push(timestamps.slice(i, i + batchSize));
    }

    let totalLoaded = 0;
    
    // Processa batches sekventiellt, men parallellt inom varje batch
    for (const batch of batches) {
      const batchPromises = batch.map(async (timestamp) => {
        const safeTimestamp = timestamp.replace(/:/g, '-').replace(/\+/g, 'plus');
        const imageUrl = config.imageUrlPattern.replace('{timestamp}', safeTimestamp);
        
        try {
          const img = await this.preloadImage(imageUrl);
          layerImageCache.set(safeTimestamp, img);
          totalLoaded++;
          
          // Uppdatera progress
          status.loadedImages = totalLoaded;
          status.progress = (totalLoaded / timestamps.length) * 100;
          
          return { success: true, timestamp: safeTimestamp };
        } catch (error) {
          console.warn(`⚠️ Kunde inte preload bild för ${layer}:`, safeTimestamp);
          return { success: false, timestamp: safeTimestamp };
        }
      });
      
      // Vänta på hela batchen
      await Promise.all(batchPromises);
      
      // Paus mellan batches
      if (config.batchDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, config.batchDelay));
      }
    }
    
    status.status = 'loaded';
    status.endTime = Date.now();
    const loadTime = status.endTime - (status.startTime || 0);
    
    console.log(`✅ ${layer} preloading slutfört: ${totalLoaded}/${timestamps.length} bilder på ${loadTime}ms`);
  }

  // Optimerad bildladdning med timeout och retry
  private async preloadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      // Timeout för långsam laddning
      const timeout = setTimeout(() => {
        img.onerror = null;
        img.onload = null;
        reject(new Error(`Timeout för ${url}`));
      }, 10000); // 10 sekunder timeout
      
      img.onload = () => {
        clearTimeout(timeout);
        resolve(img);
      };
      
      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(`Kunde inte ladda ${url}`));
      };
      
      img.src = url;
    });
  }

  // Hämta timestamps från metadata
  private getTimestampsFromMetadata(metadata: LayerMetadata): string[] {
    return metadata.timestamps || [];
  }

  // Hämta preloaded bild
  getPreloadedImage(layer: string, timestamp: string): HTMLImageElement | null {
    const layerCache = this.imageCache.get(layer);
    if (!layerCache) return null;
    
    const safeTimestamp = timestamp.replace(/:/g, '-').replace(/\+/g, 'plus');
    return layerCache.get(safeTimestamp) || null;
  }

  // Rensa cache för specifikt lager
  clearLayerCache(layer: string): void {
    this.imageCache.delete(layer);
    const status = this.preloadStatuses.get(layer);
    if (status) {
      status.status = 'pending';
      status.progress = 0;
      status.loadedImages = 0;
    }
  }

  // Rensa all cache
  clearAllCache(): void {
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