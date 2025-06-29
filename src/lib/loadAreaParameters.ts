// Helper för att dekomprimera area-parameters data
import pako from 'pako';

// Cache för att undvika omkomprimering
let cachedData: any = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minuter

export async function loadAreaParameters(): Promise<any> {
  // Returnera cached data om den finns och inte är för gammal
  if (cachedData && Date.now() - cacheTimestamp < CACHE_DURATION) {
    // console.log('🔄 Använder cachad area-parameters data');
    return cachedData;
  }

  try {
    // console.log('📦 Laddar komprimerad area-parameters data...');
    const startTime = performance.now();
    
    const response = await fetch('/data/area-parameters-extended.json.gz');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const compressedData = await response.arrayBuffer();
    const downloadTime = performance.now() - startTime;
    
    // console.log(`📊 Nedladdad: ${(compressedData.byteLength / 1024 / 1024).toFixed(2)} MB på ${downloadTime.toFixed(0)}ms`);
    
    // Dekomprimera
    const decompressStart = performance.now();
    const decompressedData = pako.inflate(new Uint8Array(compressedData), { to: 'string' });
    const decompressTime = performance.now() - decompressStart;
    
    // console.log(`🗜️ Dekomprimerad: ${(decompressedData.length / 1024 / 1024).toFixed(2)} MB på ${decompressTime.toFixed(0)}ms`);
    
    // Parse JSON
    const parseStart = performance.now();
    const parsedData = JSON.parse(decompressedData);
    const parseTime = performance.now() - parseStart;
    
    const totalTime = performance.now() - startTime;
    // console.log(`📋 Parsad: ${parsedData.points?.length || 0} punkter på ${parseTime.toFixed(0)}ms`);
    // console.log(`🏆 Total tid: ${totalTime.toFixed(0)}ms (${(totalTime/1000).toFixed(1)}s)`);
    
    // Cachea resultatet
    cachedData = parsedData;
    cacheTimestamp = Date.now();
    
    return parsedData;
  } catch (error) {
    // console.error('❌ Fel vid laddning av area-parameters:', error);
    throw error;
  }
}

// Rensa cache manuellt om behövs
export function clearAreaParametersCache() {
  cachedData = null;
  cacheTimestamp = 0;
  // console.log('🗑️ Area-parameters cache rensad');
}
