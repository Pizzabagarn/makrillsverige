import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import path from 'path';

// Cache för makrill-värden (per timestamp) - FÖRBÄTTRAD CACHING
const mackerelValuesCache = new Map<string, any>();
const cacheTimestamps = new Map<string, number>();
const CACHE_DURATION = 1000 * 60 * 60 * 2; // 2 timmar cache (längre för bättre prestanda)

// Ladda och dekomprimera makrill-värden
async function loadMackerelValues(timestamp: string): Promise<any> {
  // Konvertera timestamp till säkert filnamn
  const safeTimestamp = timestamp.replace(/:/g, '-').replace('+', 'plus');
  const filePath = path.join(
    process.cwd(), 
    'public', 
    'data', 
    'mackerel-probability-images-mercator', 
    'mackerel-values', 
    `mackerel_values_${safeTimestamp}.json.gz`
  );

  // Kontrollera om filen finns
  try {
    await fs.access(filePath);
  } catch {
    // Fallback till okomprimerad fil
    const jsonPath = filePath.replace('.gz', '');
    try {
      await fs.access(jsonPath);
      console.log(`📄 Laddar okomprimerad makrill-värden: ${safeTimestamp}`);
      const data = await fs.readFile(jsonPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      throw new Error(`Makrill-värden fil hittades inte: ${safeTimestamp}`);
    }
  }

  console.log(`🗜️ Laddar komprimerad makrill-värden: ${safeTimestamp}`);
  const startTime = Date.now();

  const data = await new Promise<any>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const readStream = createReadStream(filePath);
    const gunzip = createGunzip({
      chunkSize: 16 * 1024,
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
          console.log(`✅ Makrill-värden laddad på ${loadTime}ms`);
          resolve(jsonData);
        } catch (parseError) {
          reject(parseError);
        }
      })
      .on('error', (error) => {
        console.error('❌ Dekomprimering av makrill-värden misslyckades:', error);
        reject(error);
      });
  });

  return data;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ timestamp: string }> }
) {
  try {
    const { timestamp } = await params;
    
    if (!timestamp) {
      return NextResponse.json({ error: 'Timestamp krävs' }, { status: 400 });
    }

    const cacheKey = timestamp;
    const now = Date.now();
    
    // Kontrollera cache
    if (mackerelValuesCache.has(cacheKey)) {
      const cacheTime = cacheTimestamps.get(cacheKey) || 0;
      if (now - cacheTime < CACHE_DURATION) {
        console.log(`⚡ Serving makrill-värden från cache: ${timestamp}`);
        return NextResponse.json(mackerelValuesCache.get(cacheKey));
      }
    }

    // Ladda data
    const data = await loadMackerelValues(timestamp);
    
    // Cache resultatet
    mackerelValuesCache.set(cacheKey, data);
    cacheTimestamps.set(cacheKey, now);
    
    // Begränsa cache-storlek (behåll max 50 timestamps)
    if (mackerelValuesCache.size > 50) {
      const oldestKey = Array.from(cacheTimestamps.entries())
        .sort(([,a], [,b]) => a - b)[0][0];
      mackerelValuesCache.delete(oldestKey);
      cacheTimestamps.delete(oldestKey);
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('❌ Fel vid laddning av makrill-värden:', error);
    return NextResponse.json(
      { error: 'Kunde inte ladda makrill-värden' }, 
      { status: 500 }
    );
  }
} 