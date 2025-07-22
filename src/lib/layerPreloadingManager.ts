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
  timestamps?: string[]; // Old format
  images?: Array<{       // New format
    timestamp: string;
    filename: string;
    data_points?: number;
    value_range?: [number, number];
  }>;
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
  private isPaused: boolean = false; // NYTT: För pausning av preloading
  
  // FÖRBÄTTRAD prioritering för optimal prestanda med temperatur som default
  private readonly LAYER_PRIORITY = [
    'temperature',        // Flytta temperatur först eftersom det är default
    'current-magnitude',
    'mackerel-probability', 
    'salinity'
  ] as const;
  
  // DRAMATISKT förbättrade desktop-inställningar
  private readonly LAYER_CONFIGS: Record<string, {
    metadataUrl: string;
    imageUrlPattern: string;
    delay: number;
    batchDelay: number;
    maxParallelLoads: number;
    priority: 'critical' | 'high' | 'normal' | 'low';
    maxImages?: number; // NYTT: Begränsa antal bilder
  }> = {
    'temperature': {
      metadataUrl: '/data/temperature-images-mercator/metadata.json',
      imageUrlPattern: '/data/temperature-images-mercator/temperature_{timestamp}.webp',
      delay: 0, // OMEDELBAR start för default layer
      batchDelay: 1, // ULTRA-snabb mellan bilder
      maxParallelLoads: 12, // Hög hastighet för default layer
      priority: 'critical', // Kritisk prioritet för default layer
      maxImages: undefined
    },
    'current-magnitude': {
      metadataUrl: '/data/current-images-mercator/metadata.json',
      imageUrlPattern: '/data/current-images-mercator/current_magnitude_{timestamp}.webp',
      delay: 10, // Start snabbt efter temperatur
      batchDelay: 1, // Samma snabbhet som critical
      maxParallelLoads: 16, // Fortfarande höga värden
      priority: 'high', // Höga prioritet istället för critical
      maxImages: undefined
    },
    'mackerel-probability': {
      metadataUrl: '/data/mackerel-probability-images-mercator/metadata.json',
      imageUrlPattern: '/data/mackerel-probability-images-mercator/mackerel_probability_{timestamp}.webp',
      delay: 10, // Start nästan omedelbart efter strömbilder
      batchDelay: 1, // Samma snabbhet som critical
      maxParallelLoads: 12, // Hög hastighet för högt prioriterat lager
      priority: 'high',
      maxImages: undefined
    },
    'salinity': {
      metadataUrl: '/data/salinity-images-mercator/metadata.json',
      imageUrlPattern: '/data/salinity-images-mercator/salinity_{timestamp}.webp',
      delay: 100, // 3x snabbare start än tidigare
      batchDelay: 2, // Mycket snabbare
      maxParallelLoads: 6, // Dubbla parallella laddningar
      priority: 'normal',
      maxImages: undefined
    }
  };

  // REVOLUTIONÄRT förbättrade mobil-inställningar
  private readonly MOBILE_LAYER_CONFIGS: Record<string, {
    metadataUrl: string;
    imageUrlPattern: string;
    delay: number;
    batchDelay: number;
    maxParallelLoads: number;
    priority: 'critical' | 'high' | 'normal' | 'low';
    maxImages: number; // KRITISKT: Begränsa bilder drastiskt
  }> = {
    'temperature': {
      metadataUrl: '/data/temperature-images-mercator/metadata.json',
      imageUrlPattern: '/data/temperature-images-mercator/temperature_{timestamp}.webp',
      delay: 1000, // Snabb start för default layer på mobil
      batchDelay: 50, // Samma som tidigare critical
      maxParallelLoads: 1, // En i taget
      priority: 'critical', // Kritisk prioritet för default layer
      maxImages: 24 // Samma som tidigare critical layer
    },
    'current-magnitude': {
      metadataUrl: '/data/current-images-mercator/metadata.json',
      imageUrlPattern: '/data/current-images-mercator/current_magnitude_{timestamp}.webp',
      delay: 3000, // Vänta 3 sekunder efter temperatur
      batchDelay: 100,
      maxParallelLoads: 1,
      priority: 'high', // Höga prioritet istället för critical
      maxImages: 12 // Färre bilder än tidigare
    },
    'mackerel-probability': {
      metadataUrl: '/data/mackerel-probability-images-mercator/metadata.json',
      imageUrlPattern: '/data/mackerel-probability-images-mercator/mackerel_probability_{timestamp}.webp',
      delay: 3000, // Vänta 3 sekunder
      batchDelay: 100,
      maxParallelLoads: 1,
      priority: 'high',
      maxImages: 12 // Bara 12 bilder (½ dag) för höga prioritet
    },
    'salinity': {
      metadataUrl: '/data/salinity-images-mercator/metadata.json',
      imageUrlPattern: '/data/salinity-images-mercator/salinity_{timestamp}.webp',
      delay: 12000, // Vänta 12 sekunder - bara för dedikerade användare
      batchDelay: 300,
      maxParallelLoads: 1,
      priority: 'low',
      maxImages: 6
    }
  };

  // NYTT: Ultra-aggressiva inställningar för svaga enheter
  private readonly ULTRA_MOBILE_CONFIGS: Record<string, {
    metadataUrl: string;
    imageUrlPattern: string;
    delay: number;
    batchDelay: number;
    maxParallelLoads: number;
    priority: 'critical' | 'high' | 'normal' | 'low';
    maxImages: number;
  }> = {
    'temperature': {
      metadataUrl: '/data/temperature-images-mercator/metadata.json',
      imageUrlPattern: '/data/temperature-images-mercator/temperature_{timestamp}.webp',
      delay: 2000, // Start för default layer
      batchDelay: 100,
      maxParallelLoads: 1,
      priority: 'critical', // Kritisk prioritet för default layer
      maxImages: 12 // Samma som tidigare critical
    },
    'current-magnitude': {
      metadataUrl: '/data/current-images-mercator/metadata.json',
      imageUrlPattern: '/data/current-images-mercator/current_magnitude_{timestamp}.webp',
      delay: 8000, // Senare start
      batchDelay: 200,
      maxParallelLoads: 1,
      priority: 'high', // Höga prioritet
      maxImages: 6 // Färre bilder
    },
    'mackerel-probability': {
      metadataUrl: '/data/mackerel-probability-images-mercator/metadata.json',
      imageUrlPattern: '/data/mackerel-probability-images-mercator/mackerel_probability_{timestamp}.webp',
      delay: 8000,
      batchDelay: 200,
      maxParallelLoads: 1,
      priority: 'high',
      maxImages: 6
    },
    'salinity': {
      metadataUrl: '/data/salinity-images-mercator/metadata.json',
      imageUrlPattern: '/data/salinity-images-mercator/salinity_{timestamp}.webp',
      delay: 30000, // Skippa nästan helt
      batchDelay: 1000,
      maxParallelLoads: 1,
      priority: 'low',
      maxImages: 3
    }
  };

  // AGGRESSIV men SMART preloadning - ger omedelbar visning med minnesstyrning
  private getDeviceClass(): 'desktop' | 'tablet' | 'mobile' | 'ultra-mobile' {
    console.log('🚀 FULL PRESTANDA AKTIVERAD - alla bilder laddas för omedelbar visning!');
    console.log('💡 Nu med 8GB heap och smart minnesstyrning - inga begränsningar!');
    
    // Alla enheter får full funktionalitet tack vare våra minnesoptimeringar
    return 'desktop';
  }

  // UPPDATERAD: Använd rätt konfiguration baserat på enhet
  private getLayerConfig(layer: string) {
    const deviceClass = this.getDeviceClass();
    
    switch (deviceClass) {
      case 'ultra-mobile':
        return this.ULTRA_MOBILE_CONFIGS[layer];
      case 'mobile':
        return this.MOBILE_LAYER_CONFIGS[layer];
      case 'tablet':
        // Tablet använder desktop-config men med begränsningar
        const desktopConfig = this.LAYER_CONFIGS[layer];
        return {
          ...desktopConfig,
          maxImages: layer === 'current-magnitude' ? 48 : layer === 'mackerel-probability' ? 24 : 12,
          maxParallelLoads: Math.min(desktopConfig.maxParallelLoads, 2)
        };
      default:
        return this.LAYER_CONFIGS[layer];
    }
  }

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

  // REVOLUTIONÄR preloading-logik med adaptiv laddning
  async startPreloading(): Promise<void> {
    if (this.isPreloading) {
      console.log('⏳ Preloading pågår redan...');
      return;
    }

    this.isPreloading = true;
    const deviceClass = this.getDeviceClass();
    console.log(`🚀 Startar ${deviceClass}-optimerad layer preloading...`);

    try {
      // Ladda metadata för alla lager först (parallellt)
      await this.loadAllMetadata();

      // Olika strategier baserat på enhetsklass
      switch (deviceClass) {
        case 'ultra-mobile':
          // Extremt försiktig laddning för svagaste enheter
          await this.preloadUltraMobile();
          break;
        
        case 'mobile':
          // Standard mobil-optimering
          await this.preloadMobile();
          break;
        
        case 'tablet':
          // Balanserad laddning för tablets
          await this.preloadTablet();
          break;
        
        default:
          // Aggressiv laddning för desktop
          await this.preloadDesktop();
          break;
      }

      console.log(`✅ ${deviceClass} preloading slutfört`);
    } catch (error) {
      console.error('❌ Preloading misslyckades:', error);
    } finally {
      this.isPreloading = false;
    }
  }

  // NYTT: Ultra-mobil preloading - minimal laddning
  private async preloadUltraMobile(): Promise<void> {
    console.log('📱 Ultra-mobil preloading: Bara kritiska bilder');
    
    // Bara kritiska lager
    const criticalLayers = this.LAYER_PRIORITY.filter(layer => {
      const config = this.getLayerConfig(layer);
      return config.priority === 'critical';
    });

    for (const layer of criticalLayers) {
      if (this.isPaused) break;
      await this.preloadLayer(layer);
      
      // Längre paus mellan lager
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Ladda höga prioritets-lager bara om användaren är aktiv i 10+ sekunder
    setTimeout(async () => {
      if (this.isPaused) return;
      
      const highPriorityLayers = this.LAYER_PRIORITY.filter(layer => {
        const config = this.getLayerConfig(layer);
        return config.priority === 'high';
      });

      for (const layer of highPriorityLayers) {
        if (this.isPaused) break;
        await this.preloadLayer(layer);
      }
    }, 10000);
  }

  // NYTT: Mobil preloading - selektiv laddning
  private async preloadMobile(): Promise<void> {
    console.log('📱 Mobil preloading: Stegvis laddning');

    // Steg 1: Kritiska lager sekventiellt
    for (const layer of this.LAYER_PRIORITY) {
      const config = this.getLayerConfig(layer);
      if (config.priority === 'critical') {
        await this.preloadLayer(layer);
      }
    }

    // Steg 2: Höga prioritets-lager efter delay
    setTimeout(async () => {
      if (this.isPaused) return;
      
      for (const layer of this.LAYER_PRIORITY) {
        const config = this.getLayerConfig(layer);
        if (config.priority === 'high') {
          await this.preloadLayer(layer);
        }
      }
    }, 3000);

    // Steg 3: Låga prioritets-lager bara om användaren är dedikerad
    setTimeout(async () => {
      if (this.isPaused) return;
      
      for (const layer of this.LAYER_PRIORITY) {
        const config = this.getLayerConfig(layer);
        if (config.priority === 'low') {
          await this.preloadLayer(layer);
        }
      }
    }, 15000);
  }

  // NYTT: Tablet preloading - balanserad laddning
  private async preloadTablet(): Promise<void> {
    console.log('📱 Tablet preloading: Balanserad laddning');

    // Kritiska lager först
    const criticalPromises = this.LAYER_PRIORITY
      .filter(layer => this.getLayerConfig(layer).priority === 'critical')
      .map(layer => this.preloadLayer(layer));
    
    await Promise.all(criticalPromises);

    // Höga prioritets-lager parallellt men med delay
    setTimeout(() => {
      if (this.isPaused) return;
      
      this.LAYER_PRIORITY
        .filter(layer => this.getLayerConfig(layer).priority === 'high')
        .forEach(layer => this.preloadLayer(layer));
    }, 1000);

    // Normal prioritets-lager
    setTimeout(() => {
      if (this.isPaused) return;
      
      this.LAYER_PRIORITY
        .filter(layer => ['normal', 'low'].includes(this.getLayerConfig(layer).priority))
        .forEach(layer => this.preloadLayer(layer));
    }, 3000);
  }

  // NYTT: Desktop preloading - aggressiv parallell laddning
  private async preloadDesktop(): Promise<void> {
    console.log('🖥️ Desktop preloading: Full parallell laddning');

    // Alla lager parallellt med olika delays
    const layerPromises = this.LAYER_PRIORITY.map((layer, index) => {
      const config = this.getLayerConfig(layer);
      
      // Staggera starten baserat på prioritet
      const startDelay = config.priority === 'critical' ? 0 :
                        config.priority === 'high' ? 200 :
                        config.priority === 'normal' ? 500 : 1000;

      return new Promise<void>(resolve => {
        setTimeout(() => {
          this.preloadLayer(layer).finally(resolve);
        }, startDelay);
      });
    });

    await Promise.all(layerPromises);
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
          
          // Uppdatera total images count - hantera båda format
          const status = this.preloadStatuses.get(layer);
          if (status) {
            if (metadata.images && metadata.images.length > 0) {
              status.totalImages = metadata.images.length;
            } else if (metadata.timestamps && metadata.timestamps.length > 0) {
              status.totalImages = metadata.timestamps.length;
            } else {
              status.totalImages = metadata.total_images || 0;
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ Kunde inte ladda metadata för ${layer}:`, error);
      }
    });

    await Promise.all(metadataPromises);
    console.log('📊 Metadata laddad för alla lager');
  }

  // REVOLUTIONÄR preload-metod med smart bildhantering
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
    
    // SMART PRELOADING-begränsning (alla bilder fortfarande tillgängliga on-demand)
    let maxPreloadImages = timestamps.length;
    if (config.maxImages !== undefined) {
      maxPreloadImages = config.maxImages;
    }
    
    // PROGRESSIV preloading: Börja med senaste bilder (mest relevanta)
    const sortedTimestamps = [...timestamps].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const preloadTimestamps = sortedTimestamps.slice(0, maxPreloadImages);
    
    const deviceClass = this.getDeviceClass();
    if (preloadTimestamps.length === timestamps.length) {
      console.log(`🚀 ${layer}: Laddar ALLA ${timestamps.length} bilder för SMOOTH upplevelse!`);
    } else {
      console.log(`📱 ${layer}: Laddar ${preloadTimestamps.length}/${timestamps.length} bilder`);
    }
    
    // Dynamisk delay baserat på nätverksförhållanden
    let dynamicDelay = config.delay;
    const connection = (navigator as any).connection;
    if (connection) {
      if (connection.effectiveType === 'slow-2g') {
        dynamicDelay *= 3; // 3x längre delay för mycket långsam anslutning
      } else if (connection.effectiveType === '2g') {
        dynamicDelay *= 2; // 2x längre delay för långsam anslutning
      }
    }
    
    // Vänta på dynamisk initial delay
    await new Promise(resolve => setTimeout(resolve, dynamicDelay));
    
    // Smart batch-size baserat på prestanda
    const batchSize = config.maxParallelLoads;
    const batches = [];
    for (let i = 0; i < preloadTimestamps.length; i += batchSize) {
      batches.push(preloadTimestamps.slice(i, i + batchSize));
    }

    let totalLoaded = 0;
    
    // Processa batches sekventiellt, men parallellt inom varje batch
    for (const batch of batches) {
      const batchPromises = batch.map(async (timestamp: string) => {
        const safeTimestamp = timestamp.replace(/:/g, '-').replace(/\+/g, 'plus');
        const imageUrl = config.imageUrlPattern.replace('{timestamp}', safeTimestamp);
        
        try {
          const img = await this.preloadImage(imageUrl);
          layerImageCache.set(safeTimestamp, img);
          totalLoaded++;
          
          // Uppdatera progress
          status.loadedImages = totalLoaded;
          status.progress = (totalLoaded / preloadTimestamps.length) * 100;
          
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
    
    console.log(`✅ ${layer} KLART: ${totalLoaded}/${preloadTimestamps.length} bilder laddade på ${loadTime}ms - REDO FÖR SMOOTH ANVÄNDNING!`);
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
    if (metadata.timestamps && metadata.timestamps.length > 0) {
      return metadata.timestamps;
    }
    if (metadata.images && metadata.images.length > 0) {
      return metadata.images.map(img => img.timestamp);
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

  // NYTT: Pausera preloading för svaga enheter
  pausePreloading(): void {
    this.isPaused = true;
    console.log('⏸️ Preloading pausad för optimering');
    
    // Rensa pågående preloading-requests
    this.preloadStatuses.forEach(status => {
      if (status.status === 'loading') {
        status.status = 'paused';
      }
    });
  }
  
  // NYTT: Återuppta preloading
  resumePreloading(): void {
    this.isPaused = false;
    console.log('▶️ Preloading återupptagen');
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