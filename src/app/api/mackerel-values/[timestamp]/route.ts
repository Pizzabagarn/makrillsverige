import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import path from 'path';

// 🚀 GLOBAL FIL-CACHE - Laddar hela filen EN gång, extraherar data från minnet
let globalMackerelData: any = null;
let globalDataTimestamp: number = 0;
let isLoadingGlobalData: boolean = false;
const GLOBAL_CACHE_DURATION = 1000 * 60 * 60 * 4; // 4 timmar global cache

// Cache för extraherade timestamp-data (snabbare än att söka i stora objektet)
const extractedDataCache = new Map<string, any>();
const EXTRACTED_CACHE_DURATION = 1000 * 60 * 60 * 8; // 8 timmar för extraherad data

// Ladda HELA filen EN gång och cacha globalt
async function loadGlobalMackerelData(): Promise<any> {
  // Returnera befintlig cache om den är färsk
  const now = Date.now();
  if (globalMackerelData && (now - globalDataTimestamp) < GLOBAL_CACHE_DURATION) {
    return globalMackerelData;
  }

  // Om redan laddar, vänta på befintlig laddning
  if (isLoadingGlobalData) {
    while (isLoadingGlobalData) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return globalMackerelData;
  }

  isLoadingGlobalData = true;
  console.log(`🗜️ Laddar HELA makrill-datafilen till global cache...`);
  const startTime = Date.now();

  try {
    const filePath = path.join(
      process.cwd(), 
      'public', 
      'data', 
      'mackerel-probability-images-mercator', 
      'mackerel-values', 
      'all_mackerel_values.json.gz'
    );

    // Kontrollera att filen finns
    await fs.access(filePath);

    // Ladda och dekomprimera filen
    const allData = await new Promise<any>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const readStream = createReadStream(filePath);
      const gunzip = createGunzip({
        chunkSize: 32 * 1024, // Större chunks för snabbare laddning
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
            resolve(jsonData);
          } catch (parseError) {
            reject(parseError);
          }
        })
        .on('error', (error) => {
          reject(error);
        });
    });

    // Cacha globalt
    globalMackerelData = allData;
    globalDataTimestamp = now;
    
    const loadTime = Date.now() - startTime;
    const timestamps = Object.keys(allData?.timestamps || {}).length;
    console.log(`✅ Global makrill-cache laddad: ${timestamps} timestamps på ${loadTime}ms`);
    
    return allData;

  } catch (error) {
    console.error('❌ Fel vid laddning av global makrill-data:', error);
    throw new Error(`Makrill-värden fil kunde inte laddas: ${error}`);
  } finally {
    isLoadingGlobalData = false;
  }
}

// Extrahera data för specifik timestamp från global cache
async function getMackerelDataForTimestamp(timestamp: string): Promise<any> {
  // Kolla extraherad cache först (ännu snabbare)
  if (extractedDataCache.has(timestamp)) {
    return extractedDataCache.get(timestamp);
  }

  // Ladda global data om behövs
  const allData = await loadGlobalMackerelData();

  // Extrahera data för denna timestamp
  const timestampData = allData?.timestamps?.[timestamp];
  if (!timestampData) {
    throw new Error(`Ingen data hittades för timestamp: ${timestamp}`);
  }

  // Formatera data i förväntat format
  const formattedData = {
    timestamp: timestamp,
    bbox: timestampData.bbox || allData.wgs84_bbox,
    total_points: timestampData.total_points,
    values: timestampData.values
  };

  // Cacha extraherad data för snabbare framtida access
  extractedDataCache.set(timestamp, formattedData);
  
  // Begränsa cache-storlek
  if (extractedDataCache.size > 100) {
    const firstKey = extractedDataCache.keys().next().value;
    if (firstKey) {
      extractedDataCache.delete(firstKey);
    }
  }

  return formattedData;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ timestamp: string }> }
) {
  try {
    const resolvedParams = await params;
    const { timestamp } = resolvedParams;
    
    if (!timestamp) {
      return NextResponse.json({ error: 'Timestamp krävs' }, { status: 400 });
    }

    // Använd global cache - laddar hela filen EN gång, extraherar från minnet
    const data = await getMackerelDataForTimestamp(timestamp);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('❌ Fel vid laddning av makrill-värden:', error);
    return NextResponse.json(
      { 
        error: 'Kunde inte ladda makrill-värden',
        details: error.message 
      }, 
      { status: 500 }
    );
  }
} 