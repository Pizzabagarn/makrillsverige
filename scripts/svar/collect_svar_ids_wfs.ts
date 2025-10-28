/*
  SVAR ID collector via WFS (Web Feature Service)
  
  Fetches all Swedish lakes with SVAR IDs from SMHI's WFS endpoint.
  Much faster and more reliable than Playwright scraping!
  
  Usage:
    npm run svar:collect:wfs
    
  Output:
    scripts/svar/all_svar_ids.json
    
  Format:
    [
      {
        "sjoid": "647666-129906",
        "name": "Vänern", 
        "vyid": "655167-132360",
        "lat": 58.95,
        "lon": 13.50,
        "area_km2": 5510.78731
      },
      ...
    ]
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import proj4 from 'proj4';

type SvarLake = {
  sjoid: string;
  vyid: string;
  name: string;
  lat: number;
  lon: number;
  area_km2: number;
};

type CliFlags = {
  out: string;
  maxFeatures: number;
};

const DEFAULTS: CliFlags = {
  out: 'scripts/svar/all_svar_ids.json',
  maxFeatures: 999999, // Get all lakes
};

function parseFlags(argv: string[]): CliFlags {
  const flags: Partial<CliFlags> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--out' && next) { flags.out = next; i++; continue; }
    if (a === '--max' && next) { flags.maxFeatures = Math.max(1, Number(next)); i++; continue; }
  }
  return { ...DEFAULTS, ...flags };
}

function fetchWFS(maxFeatures: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // Fetch WFS data (coordinates will be in EPSG:3786 SWEREF99 TM, we'll convert them)
    const url = `https://vattenwebb.smhi.se/svarwebb/svar.map?service=WFS&version=1.0.0&request=GetFeature&typeName=lakes&maxFeatures=${maxFeatures}`;
    
    console.log(`📡 Fetching WFS data (max ${maxFeatures} features)...`);
    console.log(`   URL: ${url}`);
    
    https.get(url, {
      headers: {
        'User-Agent': 'MakrillSverige/1.0 (https://makrillsverige.se; alexander.westman3@gmail.com)',
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      
      // Don't set encoding - collect raw buffers and decode properly
      const buffers: Buffer[] = [];
      res.on('data', chunk => buffers.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(buffers);
        // Server claims UTF-8 but actually sends ISO-8859-1 (Latin1)
        // Decode as latin1 to preserve byte values, which are actually UTF-8 mis-encoded
        const data = buffer.toString('utf8');
        resolve(data);
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseWFSXML(xml: string): SvarLake[] {
  const lakes: SvarLake[] = [];
  
  // Define EPSG:3786 (SWEREF99 TM) projection
  proj4.defs('EPSG:3786', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
  const sweref99 = 'EPSG:3786';
  const wgs84 = 'EPSG:4326';
  
  // Parse XML using simple regex (good enough for structured WFS responses)
  // Match each <ms:lakes> feature
  const featureRegex = /<ms:lakes[^>]*>([\s\S]*?)<\/ms:lakes>/g;
  const features = xml.match(featureRegex) || [];
  
  console.log(`📊 Parsing ${features.length} features...`);
  
  for (const feature of features) {
    try {
      // Extract fields using regex
      const sjoid = feature.match(/<ms:SJOID>([^<]+)<\/ms:SJOID>/)?.[1];
      const vyid = feature.match(/<ms:VYID>([^<]+)<\/ms:VYID>/)?.[1];
      let vynamn = feature.match(/<ms:VYNAMN>([^<]*)<\/ms:VYNAMN>/)?.[1];
      const area = feature.match(/<ms:AREA>([^<]+)<\/ms:AREA>/)?.[1];
      
      // Fix double-encoded UTF-8: convert from corrupt "Ã¤" back to "ä"
      if (vynamn) {
        try {
          // If string contains double-encoded UTF-8, fix it
          // by converting UTF-8 → Latin1 bytes → UTF-8 again
          vynamn = Buffer.from(vynamn, 'latin1').toString('utf8');
        } catch (e) {
          // If conversion fails, keep original
        }
      }
      
      // Extract coordinates from geometry
      const coordsMatch = feature.match(/<gml:coordinates>([^<]+)<\/gml:coordinates>/);
      const coords = coordsMatch?.[1];
      
      if (!sjoid || !vyid || !coords) {
        continue; // Skip incomplete records
      }
      
      // Parse coordinates (format: "lon,lat lon,lat lon,lat..." in WGS84)
      const coordPairs = coords.trim().split(/\s+/);
      if (coordPairs.length === 0) continue;
      
      // Calculate centroid (average of all coordinates)
      let sumLon = 0, sumLat = 0, count = 0;
      for (const pair of coordPairs) {
        const [lon, lat] = pair.split(',').map(Number);
        if (!isNaN(lon) && !isNaN(lat)) {
          sumLon += lon;
          sumLat += lat;
          count++;
        }
      }
      
      if (count === 0) continue;
      
      const eastingSweref = sumLon / count;
      const northingSweref = sumLat / count;
      
      // Convert from EPSG:3786 (SWEREF99 TM) to WGS84
      // SWEREF99 format: [easting, northing] in meters
      // WGS84 format: [longitude, latitude] in degrees
      const [lon, lat] = proj4(sweref99, wgs84, [eastingSweref, northingSweref]);
      
      // Validate coordinates are in reasonable range for Sweden
      // Sweden is roughly: lat 55-70, lon 10-25
      if (isNaN(lat) || isNaN(lon) || lat < 54 || lat > 71 || lon < 9 || lon > 26) {
        continue;
      }
      
      lakes.push({
        sjoid,
        vyid,
        name: vynamn || '',
        lat: lat,
        lon: lon,
        area_km2: area ? parseFloat(area) : 0,
      });
      
    } catch (err) {
      console.warn('Failed to parse feature:', err);
      continue;
    }
  }
  
  return lakes;
}

async function main() {
  const flags = parseFlags(process.argv);
  const startTime = Date.now();
  
  console.log('🌊 SVAR ID Collection via WFS');
  console.log('================================\n');
  
  try {
    // Fetch WFS data
    const xml = await fetchWFS(flags.maxFeatures);
    console.log(`   ✅ Received ${(xml.length / 1024 / 1024).toFixed(2)} MB of data\n`);
    
    // Parse XML
    const lakes = parseWFSXML(xml);
    console.log(`   ✅ Parsed ${lakes.length} lakes\n`);
    
    if (lakes.length === 0) {
      console.error('❌ No lakes found in WFS response!');
      process.exitCode = 1;
      return;
    }
    
    // Remove duplicates (keep first occurrence)
    const uniqueLakes = new Map<string, SvarLake>();
    for (const lake of lakes) {
      if (!uniqueLakes.has(lake.sjoid)) {
        uniqueLakes.set(lake.sjoid, lake);
      }
    }
    
    const finalLakes = Array.from(uniqueLakes.values());
    console.log(`   ℹ️  Unique SJOIDs: ${finalLakes.length}\n`);
    
    // Sort by SJOID for easier debugging
    finalLakes.sort((a, b) => a.sjoid.localeCompare(b.sjoid));
    
    // Save to file
    const outPath = path.resolve(flags.out);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(finalLakes, null, 2), 'utf8');
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('✅ SUCCESS!');
    console.log(`   📁 Saved to: ${outPath}`);
    console.log(`   📊 Total lakes: ${finalLakes.length}`);
    console.log(`   ⏱️  Time: ${elapsed}s`);
    
    // Show sample
    console.log('\n📋 Sample (first 3):');
    for (const lake of finalLakes.slice(0, 3)) {
      console.log(`   - ${lake.name || '(unnamed)'} (${lake.sjoid})`);
      console.log(`     VYID: ${lake.vyid}, Area: ${lake.area_km2.toFixed(2)} km²`);
      console.log(`     Coords: ${lake.lat.toFixed(4)}, ${lake.lon.toFixed(4)}`);
    }
    
  } catch (error) {
    console.error('\n❌ ERROR:', error);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

