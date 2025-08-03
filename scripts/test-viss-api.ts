import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ladda miljövariabler från .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const VISS_API_KEY = process.env.VISS_API_KEY;
if (!VISS_API_KEY) {
  throw new Error('VISS_API_KEY saknas i .env.local');
}

console.log('🔍 VISS API Test - Vombsjön Fiskedata');
console.log('🔑 API Key loaded ✅');

// VISS API endpoints och konfiguration
const VISS_BASE_URL = 'https://viss.lansstyrelsen.se/api';
// Alternativ baserat på vad jag såg: https://ext-geodata-applikationer.lansstyrelsen.se/arcgis/rest/services

interface VISSWaterBody {
  name: string;
  eu_cd: string;
  type: string;
  status?: string;
  coordinates?: {
    lat: number;
    lon: number;
  };
}

interface WaterQualityParameter {
  parameter: string;
  value: number;
  unit: string;
  date: string;
  status?: string;
}

// 🌊 Sök efter Vombsjön
async function searchWaterBodies(searchTerm: string): Promise<VISSWaterBody[]> {
  console.log(`🔍 Söker efter: "${searchTerm}"`);
  
  // Testa olika möjliga endpoints
  const possibleEndpoints = [
    `${VISS_BASE_URL}/waters/search?q=${searchTerm}`,
    `${VISS_BASE_URL}/search?query=${searchTerm}&type=water`,
    `${VISS_BASE_URL}/vattenforekomster?namn=${searchTerm}`,
    // Fallback till öppna API om det finns
    `https://viss.lansstyrelsen.se/api/waters?search=${searchTerm}`
  ];

  for (const endpoint of possibleEndpoints) {
    try {
      console.log(`📡 Testar endpoint: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${VISS_API_KEY}`,
          'Content-Type': 'application/json',
          'User-Agent': 'MakrillSverige-FiskeApp/1.0'
        }
      });

      console.log(`📊 Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Data mottagen:', JSON.stringify(data, null, 2));
        return data.waters || data.results || data || [];
      } else {
        const errorText = await response.text();
        console.log(`❌ Fel från ${endpoint}:`, errorText);
      }
    } catch (error) {
      console.log(`❌ Nätverksfel för ${endpoint}:`, error instanceof Error ? error.message : 'Okänt fel');
    }
  }

  return [];
}

// 🎣 Hämta fiskrelevanta parametrar för en vattenförekomst
async function getFishingParameters(waterBodyId: string): Promise<WaterQualityParameter[]> {
  console.log(`🎣 Hämtar fiskedata för: ${waterBodyId}`);
  
  // Viktiga parametrar för fiske
  const fishingRelevantParameters = [
    'syrgasforhallanden',      // Syreförhållanden
    'water-temperature',        // Vattentemperatur
    'temperature',             // Temperatur
    'oxygen',                  // Syre
    'ph',                      // pH-värde
    'salinity',                // Salinitet
    'turbidity',               // Turbiditet/siktdjup
    'chlorophyll',             // Klorofyll (algförekomst)
    'phosphorus',              // Fosfor
    'nitrogen',                // Kväve
    'visibility'               // Siktdjup
  ];

  const possibleEndpoints = [
    `${VISS_BASE_URL}/waters/${waterBodyId}/parameters`,
    `${VISS_BASE_URL}/waters/${waterBodyId}/status`,
    `${VISS_BASE_URL}/vattenforekomster/${waterBodyId}/kvalitet`,
    `https://viss.lansstyrelsen.se/api/waters/${waterBodyId}/measurements`
  ];

  for (const endpoint of possibleEndpoints) {
    try {
      console.log(`📡 Testar parameterendpoint: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${VISS_API_KEY}`,
          'Content-Type': 'application/json',
          'User-Agent': 'MakrillSverige-FiskeApp/1.0'
        }
      });

      console.log(`📊 Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Parameterdata mottagen:', JSON.stringify(data, null, 2));
        return data.parameters || data.measurements || data || [];
      } else {
        const errorText = await response.text();
        console.log(`❌ Fel från parameterendpoint:`, errorText);
      }
    } catch (error) {
      console.log(`❌ Nätverksfel för parameterendpoint:`, error instanceof Error ? error.message : 'Okänt fel');
    }
  }

  return [];
}

// 🌡️ Test VISS API med olika endpoints
async function testVISSEndpoints() {
  console.log('\n🧪 Testar VISS API endpoints...\n');
  
  // Testa grundläggande API-tillgång
  const testEndpoints = [
    'https://viss.lansstyrelsen.se/api',
    'https://viss.lansstyrelsen.se/api/waters',
    'https://ext-geodata-applikationer.lansstyrelsen.se/arcgis/rest/services',
    'https://ext-geodata-applikationer.lansstyrelsen.se/arcgis/rest/services/VBK',
  ];

  for (const endpoint of testEndpoints) {
    try {
      console.log(`🔗 Testar: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${VISS_API_KEY}`,
          'Accept': 'application/json',
          'User-Agent': 'MakrillSverige-FiskeApp/1.0'
        }
      });

      console.log(`📊 Status: ${response.status} ${response.statusText}`);
      console.log(`📋 Headers:`, Object.fromEntries(response.headers.entries()));

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        
        if (contentType?.includes('application/json')) {
          const data = await response.json();
          console.log('✅ JSON Response:', JSON.stringify(data, null, 2));
        } else {
          const text = await response.text();
          console.log('📄 Text Response (first 500 chars):', text.substring(0, 500));
        }
      } else {
        const errorText = await response.text();
        console.log(`❌ Error Response:`, errorText.substring(0, 200));
      }
      
      console.log('─'.repeat(80));
    } catch (error) {
      console.log(`❌ Network Error:`, error instanceof Error ? error.message : 'Unknown error');
      console.log('─'.repeat(80));
    }
  }
}

// 🎯 Huvudfunktion
async function main() {
  try {
    console.log('🚀 Startar VISS API-test...\n');

    // 1. Testa grundläggande API-endpoints
    await testVISSEndpoints();

    // 2. Sök efter Vombsjön
    console.log('\n🔍 Söker efter Vombsjön...');
    const waterBodies = await searchWaterBodies('Vombsjön');
    
    if (waterBodies.length > 0) {
      console.log(`✅ Hittade ${waterBodies.length} vattenförekomst(er):`);
      
      for (const waterBody of waterBodies) {
        console.log(`📍 ${waterBody.name} (${waterBody.eu_cd})`);
        
        // 3. Hämta fiskedata för varje funnen vattenförekomst
        const parameters = await getFishingParameters(waterBody.eu_cd);
        
        if (parameters.length > 0) {
          console.log(`🎣 Fiskedata för ${waterBody.name}:`);
          parameters.forEach(param => {
            console.log(`   • ${param.parameter}: ${param.value} ${param.unit} (${param.date})`);
          });
        } else {
          console.log(`📋 Inga parametrar hittades för ${waterBody.name}`);
        }
      }
    } else {
      console.log('❌ Ingen vattenförekomst hittades för "Vombsjön"');
      
      // Prova med alternativa söktermer
      const alternatives = ['Vomb', 'vombsjön', 'SE*vomb*'];
      for (const alt of alternatives) {
        console.log(`🔄 Provar "${alt}"...`);
        const altResults = await searchWaterBodies(alt);
        if (altResults.length > 0) {
          console.log(`✅ Hittade ${altResults.length} resultat för "${alt}"`);
          break;
        }
      }
    }

  } catch (error) {
    console.error('💥 Huvudfel:', error instanceof Error ? error.message : 'Okänt fel');
  }
}

// Kör testet
main();