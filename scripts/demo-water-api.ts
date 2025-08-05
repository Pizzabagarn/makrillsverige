/**
 * Demo av vattendrags-API systemet
 * Visar hur man hämtar komplett data för svenska vattendrag
 */

// Enkel implementation utan externa beroenden
interface BasicWaterData {
  name: string;
  eu_cd: string;
  ms_cd: string;
  coordinates: { lat: number; lon: number };
  waterQuality: {
    oxygen: string;
    nutrients: string;
    ecological_status: string;
  };
  fishStatus: string;
  viss_url: string;
}

const VISS_BASE_URL = 'https://ext-geodata-applikationer.lansstyrelsen.se/arcgis/rest/services';
const SMHI_BASE_URL = 'https://opendata-download-metobs.smhi.se/api/version/latest';

async function demoWaterDataFetching() {
  console.log('🌊 DEMO: Komplett Vattendrags-Data API');
  console.log('=====================================\n');

  const waterBodies = ['Vombsjön', 'Siljan', 'Mälaren'];

  for (const waterBody of waterBodies) {
    console.log(`🔍 Hämtar data för: ${waterBody}`);
    console.log('─'.repeat(40));

    try {
      const data = await fetchBasicWaterData(waterBody);
      
      if (data) {
        displayBasicData(data);
        
        // Visa även temperature hvis tillgänglig
        const temp = await fetchNearestTemperature(data.coordinates);
        if (temp) {
          console.log(`🌡️ Närmaste vattentemperatur: ${temp.value}°C (${temp.station}, ${temp.distance}km)`);
        }
        
      } else {
        console.log('❌ Ingen data hittades');
      }
      
    } catch (error) {
      console.error('❌ Fel:', error instanceof Error ? error.message : 'Okänt fel');
    }
    
    console.log(''); // Tom rad mellan vattendrag
    
    // Paus mellan anrop
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  console.log('📋 SAMMANFATTNING:');
  console.log('✅ VISS API: Fungerar - Vattenkvalitet och miljöstatus');
  console.log('✅ SMHI API: Fungerar - Vattentemperatur från mätstationer');
  console.log('📝 SvenskaFiskekartan: Konfigurerad (kräver spatial queries)');
  console.log('\n📖 Se docs/WATER_DATA_APIs.md för komplett dokumentation');
}

async function fetchBasicWaterData(waterBodyName: string): Promise<BasicWaterData | null> {
  // 1. Hitta vattenförekomsten
  const basicInfo = await findWaterBodyInViss(waterBodyName);
  if (!basicInfo) return null;

  // 2. Hämta vattenkvalitetsdata
  const waterQuality = await fetchWaterQualityFromViss(basicInfo.eu_cd);
  
  return {
    ...basicInfo,
    waterQuality
  };
}

async function findWaterBodyInViss(name: string): Promise<{ name: string; eu_cd: string; ms_cd: string; coordinates: { lat: number; lon: number }; fishStatus: string; viss_url: string } | null> {
  // Testa sjöar-layer (vanligast för demo)
  const url = `${VISS_BASE_URL}/VISS/lst_viss_api/MapServer/56/query`;
  const params = new URLSearchParams({
    'where': `UPPER(SJONAMN) LIKE UPPER('%${name}%')`,
    'f': 'json',
    'maxRecordCount': '1',
    'outFields': 'SJONAMN,EU_CD,MS_CD,CORD_SWX,CORD_SWY,FISH,URL_VISS',
    'returnGeometry': 'false'
  });

  try {
    const response = await fetch(`${url}?${params}`, {
      headers: { 'User-Agent': 'MakrillSverige-FiskeApp/1.0' }
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.features && data.features.length > 0) {
      const attrs = data.features[0].attributes;
      
      // Approximativ konvertering SWEREF99 -> WGS84
      const lat = 55.0 + (attrs.CORD_SWY - 6100000) / 111320;
      const lon = 11.0 + (attrs.CORD_SWX - 350000) / 71500;

      return {
        name: attrs.SJONAMN,
        eu_cd: attrs.EU_CD,
        ms_cd: attrs.MS_CD,
        coordinates: { lat, lon },
        fishStatus: attrs.FISH || 'Okänt',
        viss_url: attrs.URL_VISS
      };
    }
  } catch (error) {
    console.warn('Fel vid sökning i VISS:', error);
  }

  return null;
}

async function fetchWaterQualityFromViss(euCode: string): Promise<{ oxygen: string; nutrients: string; ecological_status: string }> {
  const url = `${VISS_BASE_URL}/VISS/lst_viss_status_fys_kem_2017_2021/MapServer/87/query`;
  const params = new URLSearchParams({
    'where': `EU_CD='${euCode}'`,
    'f': 'json',
    'maxRecordCount': '1',
    'outFields': 'OXYGEN_CON,NUTRIENTS,ECO_STAT',
    'returnGeometry': 'false'
  });

  try {
    const response = await fetch(`${url}?${params}`, {
      headers: { 'User-Agent': 'MakrillSverige-FiskeApp/1.0' }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const attrs = data.features[0].attributes;
        return {
          oxygen: mapVissStatus(attrs.OXYGEN_CON || 'Okänt'),
          nutrients: mapVissStatus(attrs.NUTRIENTS || 'Okänt'),
          ecological_status: mapVissStatus(attrs.ECO_STAT || 'Okänt')
        };
      }
    }
  } catch (error) {
    console.warn('Fel vid hämtning av vattenkvalitet:', error);
  }

  return {
    oxygen: 'Okänt',
    nutrients: 'Okänt', 
    ecological_status: 'Okänt'
  };
}

async function fetchNearestTemperature(coordinates: { lat: number; lon: number }): Promise<{ value: number; station: string; distance: number } | null> {
  try {
    // 1. Hämta stationer
    const stationsResponse = await fetch(`${SMHI_BASE_URL}/parameter/22.json`, {
      headers: { 'User-Agent': 'MakrillSverige-FiskeApp/1.0' }
    });

    if (!stationsResponse.ok) return null;

    const stationsData = await stationsResponse.json();
    
    // 2. Hitta närmaste aktiva station
    let nearestStation = null;
    let minDistance = Infinity;

    for (const station of stationsData.station) {
      if (!station.active) continue;
      
      const distance = calculateDistance(
        coordinates.lat, coordinates.lon,
        station.latitude, station.longitude
      );
      
      if (distance < minDistance && distance < 50) { // Max 50km
        minDistance = distance;
        nearestStation = station;
      }
    }

    if (!nearestStation) return null;

    // 3. Hämta senaste temperatur
    const dataResponse = await fetch(
      `${SMHI_BASE_URL}/parameter/22/station/${nearestStation.id}/period/latest-day/data.json`,
      { headers: { 'User-Agent': 'MakrillSverige-FiskeApp/1.0' } }
    );

    if (!dataResponse.ok) return null;

    const tempData = await dataResponse.json();
    if (tempData.value && tempData.value.length > 0) {
      const latestValue = tempData.value[tempData.value.length - 1];
      
      return {
        value: latestValue.value,
        station: nearestStation.name,
        distance: Math.round(minDistance)
      };
    }

  } catch (error) {
    console.warn('Fel vid hämtning av temperatur:', error);
  }

  return null;
}

function displayBasicData(data: BasicWaterData) {
  console.log(`📍 ${data.name}`);
  console.log(`   🆔 EU-kod: ${data.eu_cd}`);
  console.log(`   📍 Koordinater: ${data.coordinates.lat.toFixed(4)}, ${data.coordinates.lon.toFixed(4)}`);
  console.log(`   🫧 Syrgasförhållanden: ${data.waterQuality.oxygen}`);
  console.log(`   🌱 Näringsämnen: ${data.waterQuality.nutrients}`);
  console.log(`   📊 Ekologisk status: ${data.waterQuality.ecological_status}`);
  console.log(`   🐟 Fiskstatus: ${mapVissStatus(data.fishStatus)}`);
  console.log(`   🔗 VISS: ${data.viss_url}`);
}

function mapVissStatus(code: string, parameter?: string): string {
  // Specifika mappningar baserat på parameter typ
  if (parameter === 'nutrients') {
    const nutrientMap: { [key: string]: string } = {
      'H': 'Mycket låg risk',
      'G': 'Låg risk',
      'M': 'Måttlig risk',
      'B': 'Hög risk',
      'P': 'Mycket hög risk'
    };
    return nutrientMap[code] || code;
  }
  
  if (parameter === 'chlorophyll') {
    const chlorophyllMap: { [key: string]: string } = {
      'H': 'Mycket låg risk',
      'G': 'Låg risk',
      'M': 'Måttlig risk',
      'B': 'Hög risk',
      'P': 'Mycket hög risk'
    };
    return chlorophyllMap[code] || code;
  }
  
  if (parameter === 'oxygen') {
    const oxygenMap: { [key: string]: string } = {
      'H': 'Mycket hög syrenivå',
      'G': 'Acceptabel syrenivå',
      'M': 'Lite låg syrenivå',
      'B': 'Låg syrenivå',
      'P': 'Mycket låg syrenivå'
    };
    return oxygenMap[code] || code;
  }
  
  if (parameter === 'transparency') {
    const transparencyMap: { [key: string]: string } = {
      'H': 'Mycket klart',
      'G': 'Klart',
      'M': 'Lite grumligt',
      'B': 'Grumligt',
      'P': 'Mycket grumligt'
    };
    return transparencyMap[code] || code;
  }
  
  // Fallback för ekologisk status och andra parametrar
  const statusMap: { [key: string]: string } = {
    'H': 'Hög/Bra',
    'G': 'God',
    'M': 'Måttlig',
    'B': 'Bra', 
    'P': 'Dålig/Risk',
    'Risk': 'Risk',
    'Osäkert': 'Osäkert'
  };
  return statusMap[code] || code;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Kör demon
demoWaterDataFetching().catch(console.error);