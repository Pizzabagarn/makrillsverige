import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import path from 'path';

// Global memory cache for area parameters data
let cachedAreaData: any = null;
let cachedResponseJson: string = '';  // Pre-serialized JSON string
let cacheTimestamp: number = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour cache

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

  cachedAreaData = data;
  cachedResponseJson = JSON.stringify(data);  // Pre-serialize for faster responses
  cacheTimestamp = Date.now();
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