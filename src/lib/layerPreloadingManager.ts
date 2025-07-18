// src/lib/layerPreloadingManager.ts
export interface PreloadStatus {
  layer: string;
  status: 'pending' | 'loading' | 'loaded' | 'error' | 'paused';
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
      metadataUrl: '/data/current-images-mercator/metadata.json', // FIXAT: Rätt mapp
      imageUrlPattern: '/data/current-images-mercator/current_magnitude_{timestamp}.png', // FIXAT: Rätt mapp
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
      metadataUrl: '/data/temperature-images-mercator/metadata.json', // FIXAT: Rätt mapp
      imageUrlPattern: '/data/temperature-images-mercator/temperature_{timestamp}.png', // FIXAT: Rätt mapp
      delay: 200,
      batchDelay: 5,
      maxParallelLoads: 3,
      priority: 'normal'
    },
    'salinity': {
      metadataUrl: '/data/salinity-images-mercator/metadata.json', // FIXAT: Rätt mapp
      imageUrlPattern: '/data/salinity-images-mercator/salinity_{timestamp}.png', // FIXAT: Rätt mapp
      delay: 300,
      batchDelay: 6,
      maxParallelLoads: 2,
      priority: 'normal'
    }
  };

  // NYTT: Mobil-optimerade inställningar
  private readonly MOBILE_LAYER_CONFIGS: Record<string, {
    metadataUrl: string;
    imageUrlPattern: string;
    delay: number;
    batchDelay: number;
    maxParallelLoads: number;
    priority: 'critical' | 'high' | 'normal' | 'low';
  }> = {
    'current-magnitude': {
      metadataUrl: '/data/current-images-mercator/metadata.json', // FIXAT: Rätt mapp
      imageUrlPattern: '/data/current-images-mercator/current_magnitude_{timestamp}.png', // FIXAT: Rätt mapp
      delay: 500, // Längre delay för mobil
      batchDelay: 10, // Mycket längre delay mellan bilder
      maxParallelLoads: 1, // Bara en åt gången
      priority: 'critical'
    },
    'mackerel-probability': {
      metadataUrl: '/data/mackerel-probability-images-mercator/metadata.json',
      imageUrlPattern: '/data/mackerel-probability-images-mercator/mackerel_probability_{timestamp}.png',
      delay: 1000,
      batchDelay: 15,
      maxParallelLoads: 1,
      priority: 'high'
    },
    'temperature': {
      metadataUrl: '/data/temperature-images-mercator/metadata.json', // FIXAT: Rätt mapp
      imageUrlPattern: '/data/temperature-images-mercator/temperature_{timestamp}.png', // FIXAT: Rätt mapp
      delay: 2000,
      batchDelay: 20,
      maxParallelLoads: 1,
      priority: 'low' // Sänk prioritet för mobil
    },
    'salinity': {
      metadataUrl: '/data/salinity-images-mercator/metadata.json', // FIXAT: Rätt mapp
      imageUrlPattern: '/data/salinity-images-mercator/salinity_{timestamp}.png', // FIXAT: Rätt mapp
      delay: 3000,
      batchDelay: 25,
      maxParallelLoads: 1,
      priority: 'low' // Sänk prioritet för mobil
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

  // NYTT: Identifiera mobil-enhet
  private isMobileDevice(): boolean {
    const cores = navigator.hardwareConcurrency || 4;
    const memory = (navigator as any).deviceMemory || 4;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    return isMobile || (cores <= 4 && memory <= 4);
  }

  // UPPDATERAT: Använd rätt konfiguration baserat på enhet
  private getLayerConfig(layer: string) {
    const isMobile = this.isMobileDevice();
    const configs = isMobile ? this.MOBILE_LAYER_CONFIGS : this.LAYER_CONFIGS;
    return configs[layer];
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

  // NYTT: Alias för getAllStatuses - för kompatibilitet med PreloadingStatusDashboard
  getAllPreloadingStatuses(): PreloadStatus[] {
    return this.getAllStatuses();
  }

  // Hämta status för specifikt lager
  getStatus(layer: string): PreloadStatus | null {
    return this.preloadStatuses.get(layer) || null;
  }

  // NYTT: Kontrollera om all preloading är slutförd
  isPreloadingComplete(): boolean {
    const allStatuses = this.getAllStatuses();
    return allStatuses.every(status => 
      status.status === 'loaded' || status.status === 'error'
    );
  }

  // Starta preloading för alla lager
  async startPreloading(): Promise<void> {
    if (this.isPreloading) {
      console.log('⏳ Preloading pågår redan...');
      return;
    }

    this.isPreloading = true;
    const isMobile = this.isMobileDevice();
    console.log(`🚀 Startar ${isMobile ? 'mobil-optimerad' : 'standard'} layer preloading...`);

    try {
      // Ladda metadata för alla lager först (parallellt)
      await this.loadAllMetadata();

      // Ladda lager i prioriteringsordning
      for (const layer of this.LAYER_PRIORITY) {
        const config = this.getLayerConfig(layer);
        if (!config) continue;
        
        if (config.priority === 'critical') {
          await this.preloadLayer(layer); // Vänta på kritiska lager
        } else if (config.priority === 'high') {
          if (isMobile) {
            // På mobil, ladda höga prioritets-lager sekventiellt
            await this.preloadLayer(layer);
          } else {
            // På desktop, ladda parallellt
            this.preloadLayer(layer);
          }
        } else if (config.priority === 'normal' || config.priority === 'low') {
          if (isMobile && config.priority === 'low') {
            // Skippa låga prioritets-lager helt på mobil
            console.log(`📱 Skippar ${layer} på mobil (låg prioritet)`);
            continue;
          }
          this.preloadLayer(layer);
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
      const config = this.getLayerConfig(layer);
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
    const config = this.getLayerConfig(layer);
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
    
    // NYTT: Begränsa antal bilder på mobil
    const isMobile = this.isMobileDevice();
    const maxImages = isMobile ? Math.min(timestamps.length, 20) : timestamps.length;
    const limitedTimestamps = timestamps.slice(0, maxImages);
    
    console.log(`📱 ${layer}: Laddar ${limitedTimestamps.length}/${timestamps.length} bilder (${isMobile ? 'mobil' : 'desktop'})`);
    
    // Vänta på initial delay
    await new Promise(resolve => setTimeout(resolve, config.delay));
    
    // Dela upp timestamps i batches för parallell laddning
    const batchSize = config.maxParallelLoads;
    const batches = [];
    for (let i = 0; i < limitedTimestamps.length; i += batchSize) {
      batches.push(limitedTimestamps.slice(i, i + batchSize));
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
          status.progress = (totalLoaded / limitedTimestamps.length) * 100;
          
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
    
    console.log(`✅ ${layer} preloading slutfört: ${totalLoaded}/${limitedTimestamps.length} bilder på ${loadTime}ms`);
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

  // NYTT: Pausera preloading för svaga enheter
  pausePreloading(): void {
    this.isPreloading = false;
    console.log('⏸️ Pausar preloading för bättre prestanda');
    
    // Rensa pågående preloading-requests
    this.preloadStatuses.forEach(status => {
      if (status.status === 'loading') {
        status.status = 'paused';
      }
    });
  }
  
  // NYTT: Återuppta preloading
  resumePreloading(): void {
    console.log('▶️ Återupptar preloading');
    this.startPreloading();
  }

  // Få preloading-status för ett specifikt lager
  getPreloadingStatus(layer: string): PreloadStatus | null {
    return this.preloadStatuses.get(layer) || null;
  }

  // Rensa cache för specifikt lager
  clearLayerCache(layer: string): void {
    const imageCache = this.imageCache.get(layer);
    if (imageCache) {
      imageCache.clear();
    }
    
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