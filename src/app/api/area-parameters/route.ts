import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import path from 'path';

// Global memory cache for area parameters data - BEGRÄNSAD för minnesäkerhet
let cachedAreaData: any = null;
let cachedResponseJson: string = '';  // Pre-serialized JSON string
let cacheTimestamp: number = 0;
const CACHE_DURATION = 1000 * 60 * 30; // 30 minuter cache (reducerat för att frigöra minne oftare)
const MAX_CACHE_SIZE_MB = 100; // Maximal cache-storlek i MB

// Cache-rensningsfunktion för minneshantering
function clearAreaParametersCache() {
  console.log('🧹 Rensar area-parameters cache för att frigöra minne');
  cachedAreaData = null;
  cachedResponseJson = '';
  cacheTimestamp = 0;
  
  // Tvinga garbage collection om tillgängligt
  if (global.gc) {
    global.gc();
    console.log('🗑️ Garbage collection utfört');
  }
}

// Auto-rensning av cache vid minnespress
function scheduleMemoryCleanup() {
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const memUsedMB = memUsage.heapUsed / (1024 * 1024);
    
    // Rensa cache om minnesanvändningen är över 1GB
    if (memUsedMB > 1024) {
      console.warn(`⚠️ Hög minnesanvändning detekterad: ${memUsedMB.toFixed(1)}MB`);
      clearAreaParametersCache();
    }
  }, 5 * 60 * 1000); // Kontrollera var 5:e minut
}

// Starta minnesövervakning
scheduleMemoryCleanup();

// Pre-load data on server startup
let isPreloading = false;
async function preloadAreaData() {
  if (isPreloading || cachedAreaData) return;
  isPreloading = true;
  
  console.log('🚀 Pre-loading area-parameters data on server startup...');
  try {
    await loadAreaData();
    console.log('✅ Area-parameters data pre-loaded successfully');
  } catch (error) {
    console.error('❌ Failed to pre-load area-parameters data:', error);
  } finally {
    isPreloading = false;
  }
}

// Load data function
async function loadAreaData() {
  const filePath = path.join(process.cwd(), 'public', 'data', 'area-parameters-extended.json.gz');
  
  // Check if file exists
  try {
    await fs.access(filePath);
  } catch {
    throw new Error('Area parameters file not found');
  }

        // console.log('📥 Loading area-parameters from disk...');
  const startTime = Date.now();
  
  const data = await new Promise<any>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const readStream = createReadStream(filePath);
    const gunzip = createGunzip({
      chunkSize: 64 * 1024,
      level: 6
    });
    
    readStream
      .pipe(gunzip)
      .on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      })
      .on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          const jsonString = buffer.toString('utf8');
          const jsonData = JSON.parse(jsonString);
          const loadTime = Date.now() - startTime;
          // console.log(`✅ Area data loaded in ${loadTime}ms (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);
          resolve(jsonData);
        } catch (parseError) {
          // console.error('❌ JSON parsing error:', parseError);
          reject(parseError);
        }
      })
      .on('error', (error) => {
        console.error('❌ Decompression error:', error);
        reject(error);
      });
  });

  // Kontrollera cache-storlek innan lagring
  const jsonString = JSON.stringify(data);
  const cacheSizeMB = Buffer.byteLength(jsonString, 'utf8') / (1024 * 1024);
  
  if (cacheSizeMB > MAX_CACHE_SIZE_MB) {
    console.warn(`⚠️ Cache-storlek ${cacheSizeMB.toFixed(1)}MB överskrider limit ${MAX_CACHE_SIZE_MB}MB - skippar cache`);
    return data; // Returnera data utan att cacha för att undvika minnesexplodering
  }
  
  cachedAreaData = data;
  cachedResponseJson = jsonString;  // Pre-serialize for faster responses
  cacheTimestamp = Date.now();
  console.log(`💾 Area-parameters cachad: ${cacheSizeMB.toFixed(1)}MB`);
  return data;
}

// Start pre-loading immediately when module loads
preloadAreaData();

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'data', 'area-parameters-extended.json.gz');
    
    // Check if file has been updated since last cache
    let fileModified = 0;
    try {
      const fileStat = await fs.stat(filePath);
      fileModified = fileStat.mtime.getTime();
    } catch (error) {
      // console.error('❌ Could not check file modification time:', error);
      return NextResponse.json({ error: 'Area parameters file not found' }, { status: 404 });
    }

    // Check if we have cached data and file hasn't been updated
    const now = Date.now();
    const cacheValid = cachedAreaData && cachedResponseJson &&
                      (now - cacheTimestamp) < CACHE_DURATION && 
                      fileModified <= cacheTimestamp;

    if (cacheValid) {
      console.log('⚡ Serving area-parameters from memory cache (pre-serialized)');
      return new NextResponse(cachedResponseJson, {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Cache expired, missing, or file updated - reload data
    if (fileModified > cacheTimestamp) {
      console.log('🔄 File updated by cronjob, reloading area-parameters...');
    } else {
      console.log('🔄 Cache expired, reloading area-parameters...');
    }
    
    const data = await loadAreaData();
    
    return NextResponse.json(data);
  } catch (error) {
    // console.error('❌ Failed to load area-parameters:', error);
    return NextResponse.json(
      { error: 'Failed to load area parameters data' }, 
      { status: 500 }
    );
  }
} 