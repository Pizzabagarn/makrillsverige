/*
  SVAR ID collector - Lakes with downloadable maps
  
  Fetches ONLY Swedish lakes that have downloadable maps from SMHI's REST API.
  This is much more efficient than fetching all ~40k lakes when only ~4k have maps!
  
  Usage:
    npm run svar:collect:wfs
    
  Output:
    scripts/svar/all_svar_ids.json
    
  Format:
    [
      {
        "sjoid": "647666-129906",
        "name": "", 
        "vyid": "",
        "lat": 58.95,
        "lon": 13.50,
        "area_km2": 0
      },
      ...
    ]
    
  Note: The REST API only provides sjoid and coordinates. Name, vyid, and area are not available.
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

type LakemapsResponse = {
  sjoid: string;
  east: string;
  north: string;
};

type CliFlags = {
  out: string;
};

const DEFAULTS: CliFlags = {
  out: 'scripts/svar/all_svar_ids.json',
};

function parseFlags(argv: string[]): CliFlags {
  const flags: Partial<CliFlags> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--out' && next) { flags.out = next; i++; continue; }
  }
  return { ...DEFAULTS, ...flags };
}

function fetchLakemaps(): Promise<string> {
  return new Promise((resolve, reject) => {
    // Fetch lakes with downloadable maps from REST API
    const url = 'https://vattenwebb.smhi.se/svarwebb/rest/search/lakemaps';
    
    console.log(`📡 Fetching lakes with downloadable maps...`);
    console.log(`   URL: ${url}`);
    
    https.get(url, {
      headers: {
        'User-Agent': 'MakrillSverige/1.0 (https://makrillsverige.se; alexander.westman3@gmail.com)',
        'Accept': 'application/json',
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      
      const buffers: Buffer[] = [];
      res.on('data', chunk => buffers.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(buffers);
        const data = buffer.toString('utf8');
        resolve(data);
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseLakemapsJSON(json: string): SvarLake[] {
  const lakes: SvarLake[] = [];
  
  // Define EPSG:3006 (SWEREF99 TM) projection
  // The coordinates from the API appear to be in SWEREF99 TM (EPSG:3006)
  proj4.defs('EPSG:3006', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');
  const sweref99 = 'EPSG:3006';
  const wgs84 = 'EPSG:4326';
  
  console.log(`📊 Parsing JSON response...`);
  
  let data: LakemapsResponse[];
  try {
    data = JSON.parse(json);
  } catch (err) {
    console.error('Failed to parse JSON:', err);
    return lakes;
  }
  
  if (!Array.isArray(data)) {
    console.error('Response is not an array');
    return lakes;
  }
  
  console.log(`   Found ${data.length} lakes with maps`);
  
  for (const item of data) {
    try {
      const { sjoid, east, north } = item;
      
      if (!sjoid || !east || !north) {
        continue; // Skip incomplete records
      }
      
      // Parse coordinates (they come as strings)
      const eastNum = parseFloat(east);
      const northNum = parseFloat(north);
      
      if (isNaN(eastNum) || isNaN(northNum)) {
        continue;
      }
      
      // Convert from SWEREF99 TM to WGS84
      // SWEREF99 format: [easting, northing] in meters
      // WGS84 format: [longitude, latitude] in degrees
      const [lon, lat] = proj4(sweref99, wgs84, [eastNum, northNum]);
      
      // Validate coordinates are in reasonable range for Sweden
      // Sweden is roughly: lat 55-70, lon 10-25
      if (isNaN(lat) || isNaN(lon) || lat < 54 || lat > 71 || lon < 9 || lon > 26) {
        console.warn(`Skipping ${sjoid}: coordinates out of range (${lat}, ${lon})`);
        continue;
      }
      
      lakes.push({
        sjoid,
        vyid: '', // Not provided by this API
        name: '', // Not provided by this API
        lat: lat,
        lon: lon,
        area_km2: 0, // Not provided by this API
      });
      
    } catch (err) {
      console.warn('Failed to parse lake:', err);
      continue;
    }
  }
  
  return lakes;
}

async function main() {
  const flags = parseFlags(process.argv);
  const startTime = Date.now();
  
  console.log('🌊 SVAR ID Collection - Lakes with Maps Only');
  console.log('==============================================\n');
  
  try {
    // Fetch lakemaps data
    const json = await fetchLakemaps();
    console.log(`   ✅ Received ${(json.length / 1024).toFixed(2)} KB of data\n`);
    
    // Parse JSON
    const lakes = parseLakemapsJSON(json);
    console.log(`   ✅ Parsed ${lakes.length} lakes with downloadable maps\n`);
    
    if (lakes.length === 0) {
      console.error('❌ No lakes found in API response!');
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

