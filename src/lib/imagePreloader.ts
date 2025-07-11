// Centralized image preloader for marine data
// Prioritizes images based on active layer and selected time

export type ImageType = 'current' | 'salinity' | 'temperature';

interface PreloadConfig {
  activeLayer: ImageType;
  selectedHour: number;
  baseTime: number;
  availableTimestamps: string[];
}

class ImagePreloader {
  private preloadedImages = new Map<string, HTMLImageElement>();
  private preloadQueue: Array<{ url: string; priority: number }> = [];
  private isPreloading = false;
  private activePreloads = new Set<string>();

  // Get the image directory for each type
  private getImageDirectory(type: ImageType): string {
    const directories = {
      current: '/data/current-magnitude-images',
      salinity: '/data/salinity-images',
      temperature: '/data/temperature-images'
    };
    return directories[type];
  }

  // Get the image filename prefix for each type
  private getImagePrefix(type: ImageType): string {
    const prefixes = {
      current: 'current_magnitude_',
      salinity: 'salinity_',
      temperature: 'temperature_'
    };
    return prefixes[type];
  }

  // Convert timestamp to safe filename
  private toSafeTimestamp(timestamp: string): string {
    return timestamp.replaceAll(':', '-').replaceAll('+', 'plus');
  }

  // Get priority for an image based on config
  private getImagePriority(imageType: ImageType, timestamp: string, config: PreloadConfig): number {
    const targetTime = new Date(config.baseTime + config.selectedHour * 3600_000);
    const imageTime = new Date(timestamp);
    const timeDiff = Math.abs(targetTime.getTime() - imageTime.getTime());
    
    // Base priority
    let priority = 1000;
    
    // Higher priority for active layer
    if (imageType === config.activeLayer) {
      priority += 1000;
    }
    
    // Higher priority for current selected time
    if (timeDiff < 3600_000) { // Within 1 hour
      priority += 500;
    }
    
    // Reduce priority based on time distance
    priority -= Math.floor(timeDiff / 3600_000); // Reduce by 1 for each hour away
    
    return priority;
  }

  // Preload a single image
  private async preloadImage(url: string): Promise<HTMLImageElement | null> {
    if (this.preloadedImages.has(url)) {
      return this.preloadedImages.get(url)!;
    }

    if (this.activePreloads.has(url)) {
      return null; // Already preloading
    }

    return new Promise((resolve) => {
      this.activePreloads.add(url);
      
      const img = new Image();
      img.onload = () => {
        this.preloadedImages.set(url, img);
        this.activePreloads.delete(url);
        console.log('✅ Preloaded image:', url);
        resolve(img);
      };
      
      img.onerror = () => {
        this.activePreloads.delete(url);
        console.warn('⚠️ Failed to preload image:', url);
        resolve(null);
      };
      
      img.src = url;
    });
  }

  // Process the preload queue
  private async processPreloadQueue(): Promise<void> {
    if (this.isPreloading || this.preloadQueue.length === 0) {
      return;
    }

    this.isPreloading = true;
    
    // Sort queue by priority (highest first)
    this.preloadQueue.sort((a, b) => b.priority - a.priority);
    
    // Process queue in batches to avoid overwhelming the browser
    const batchSize = 3;
    while (this.preloadQueue.length > 0) {
      const batch = this.preloadQueue.splice(0, batchSize);
      
      // Preload batch in parallel
      await Promise.all(
        batch.map(item => this.preloadImage(item.url))
      );
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    this.isPreloading = false;
  }

  // Add images to preload queue
  public queueImages(config: PreloadConfig): void {
    const { activeLayer, availableTimestamps } = config;
    
    // Clear existing queue for new prioritization
    this.preloadQueue = [];
    
    // Generate preload queue for all image types
    const imageTypes: ImageType[] = ['current', 'salinity', 'temperature'];
    
    for (const imageType of imageTypes) {
      const directory = this.getImageDirectory(imageType);
      const prefix = this.getImagePrefix(imageType);
      
      for (const timestamp of availableTimestamps) {
        const safeTimestamp = this.toSafeTimestamp(timestamp);
        const url = `${directory}/${prefix}${safeTimestamp}.png`;
        const priority = this.getImagePriority(imageType, timestamp, config);
        
        this.preloadQueue.push({ url, priority });
      }
    }
    
    // Start processing queue
    this.processPreloadQueue();
  }

  // Get preloaded image
  public getPreloadedImage(type: ImageType, timestamp: string): HTMLImageElement | null {
    const directory = this.getImageDirectory(type);
    const prefix = this.getImagePrefix(type);
    const safeTimestamp = this.toSafeTimestamp(timestamp);
    const url = `${directory}/${prefix}${safeTimestamp}.png`;
    
    return this.preloadedImages.get(url) || null;
  }

  // Check if image is preloaded
  public isImagePreloaded(type: ImageType, timestamp: string): boolean {
    const directory = this.getImageDirectory(type);
    const prefix = this.getImagePrefix(type);
    const safeTimestamp = this.toSafeTimestamp(timestamp);
    const url = `${directory}/${prefix}${safeTimestamp}.png`;
    
    return this.preloadedImages.has(url);
  }

  // Get preload status
  public getPreloadStatus() {
    return {
      preloadedCount: this.preloadedImages.size,
      queueLength: this.preloadQueue.length,
      isPreloading: this.isPreloading,
      activePreloads: this.activePreloads.size
    };
  }

  // Clear all preloaded images
  public clearCache(): void {
    this.preloadedImages.clear();
    this.preloadQueue = [];
    this.activePreloads.clear();
    console.log('🗑️ Image preloader cache cleared');
  }
}

// Create singleton instance
export const imagePreloader = new ImagePreloader();

// React hook for using the preloader
export function useImagePreloader() {
  const queueImages = (config: PreloadConfig) => imagePreloader.queueImages(config);
  const getPreloadedImage = (type: ImageType, timestamp: string) => 
    imagePreloader.getPreloadedImage(type, timestamp);
  const isImagePreloaded = (type: ImageType, timestamp: string) =>
    imagePreloader.isImagePreloaded(type, timestamp);
  const getPreloadStatus = () => imagePreloader.getPreloadStatus();
  const clearCache = () => imagePreloader.clearCache();

  return {
    queueImages,
    getPreloadedImage,
    isImagePreloaded,
    getPreloadStatus,
    clearCache
  };
} 