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

console.log('🔍 VISS ArcGIS REST API Test - Vombsjön Fiskedata');
console.log('🔑 API Key loaded ✅');

// VISS ArcGIS REST Services
const ARCGIS_BASE_URL = 'https://ext-geodata-applikationer.lansstyrelsen.se/arcgis/rest/services';

interface ArcGISFeature {
  attributes: {
    [key: string]: any;
  };
  geometry?: any;
}

interface ArcGISQueryResult {
  features: ArcGISFeature[];
  fields?: Array<{
    name: string;
    type: string;
    alias: string;
  }>;
}

// 🗺️ Utforska tillgängliga ArcGIS-tjänster
async function exploreArcGISServices(): Promise<void> {
  console.log('\n🗺️ Utforskar ArcGIS-tjänster...\n');
  
  try {
    // Testa huvudkatalogen
    const catalogUrl = `${ARCGIS_BASE_URL}?f=json`;
    console.log(`📡 Testar katalog: ${catalogUrl}`);
    
    const response = await fetch(catalogUrl, {
      headers: {
        'User-Agent': 'MakrillSverige-FiskeApp/1.0'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Katalogsvar:', JSON.stringify(data, null, 2));
      
      // Kolla efter VBK-mappen specifikt
      if (data.folders && data.folders.includes('VBK')) {
        console.log('🎯 VBK-mapp hittad! Utforskar...');
        await exploreVBKServices();
      }
    } else {
      console.log(`❌ Katalogfel: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`❌ Katalogfel:`, error instanceof Error ? error.message : 'Okänt fel');
  }
}

// 🎯 Utforska VBK-tjänsterna
async function exploreVBKServices(): Promise<void> {
  console.log('\n🎯 Utforskar VBK-tjänster...\n');
  
  const vbkUrl = `${ARCGIS_BASE_URL}/VBK?f=json`;
  
  try {
    console.log(`📡 Testar VBK: ${vbkUrl}`);
    
    const response = await fetch(vbkUrl, {
      headers: {
        'User-Agent': 'MakrillSverige-FiskeApp/1.0'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ VBK-tjänster:', JSON.stringify(data, null, 2));
      
      // Leta efter MapServer-tjänster
      if (data.services) {
        for (const service of data.services) {
          if (service.type === 'MapServer') {
            console.log(`🗺️ Hittade MapServer: ${service.name}`);
            await exploreMapService(`VBK/${service.name}`, service.name);
          }
        }
      }
    } else {
      console.log(`❌ VBK-fel: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`❌ VBK-fel:`, error instanceof Error ? error.message : 'Okänt fel');
  }
}

// 🗺️ Utforska en specifik MapServer-tjänst
async function exploreMapService(servicePath: string, serviceName: string): Promise<void> {
  console.log(`\n🗺️ Utforskar MapServer: ${serviceName}\n`);
  
  const serviceUrl = `${ARCGIS_BASE_URL}/${servicePath}/MapServer?f=json`;
  
  try {
    console.log(`📡 Testar service: ${serviceUrl}`);
    
    const response = await fetch(serviceUrl, {
      headers: {
        'User-Agent': 'MakrillSverige-FiskeApp/1.0'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ ${serviceName} info:`, JSON.stringify(data, null, 2));
      
      // Lista layers
      if (data.layers) {
        console.log(`\n📋 Layers i ${serviceName}:`);
        for (const layer of data.layers) {
          console.log(`   • ${layer.id}: ${layer.name}`);
        }
        
        // Testa query på första layern
        if (data.layers.length > 0) {
          await queryLayer(servicePath, data.layers[0].id, 'Vombsjön');
        }
      }
    } else {
      console.log(`❌ Service-fel: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`❌ Service-fel:`, error instanceof Error ? error.message : 'Okänt fel');
  }
}

// 🔍 Sök i ett specifikt layer
async function queryLayer(servicePath: string, layerId: number, searchTerm: string): Promise<ArcGISQueryResult | null> {
  console.log(`\n🔍 Söker "${searchTerm}" i layer ${layerId}...\n`);
  
  // ArcGIS Query-parametrar
  const queryParams = new URLSearchParams({
    'f': 'json',
    'where': `UPPER(NAME) LIKE UPPER('%${searchTerm}%') OR UPPER(NAMN) LIKE UPPER('%${searchTerm}%')`,
    'outFields': '*',
    'returnGeometry': 'true',
    'maxRecordCount': '10'
  });
  
  // Prova också med API-nyckel om den behövs
  if (VISS_API_KEY) {
    queryParams.append('token', VISS_API_KEY);
  }
  
  const queryUrl = `${ARCGIS_BASE_URL}/${servicePath}/MapServer/${layerId}/query?${queryParams.toString()}`;
  
  try {
    console.log(`📡 Query URL: ${queryUrl}`);
    
    const response = await fetch(queryUrl, {
      headers: {
        'User-Agent': 'MakrillSverige-FiskeApp/1.0'
      }
    });

    if (response.ok) {
      const data: ArcGISQueryResult = await response.json();
      console.log(`✅ Query-resultat:`, JSON.stringify(data, null, 2));
      
      if (data.features && data.features.length > 0) {
        console.log(`🎯 Hittade ${data.features.length} vattenförekomst(er):`);
        
        data.features.forEach((feature, index) => {
          console.log(`\n📍 Resultat ${index + 1}:`);
          console.log(`   Attribut:`, JSON.stringify(feature.attributes, null, 2));
          
          // Försök identifiera viktiga fält
          const attrs = feature.attributes;
          const possibleNameFields = ['NAME', 'NAMN', 'WATERBODY_NAME', 'EU_CD'];
          const name = possibleNameFields.find(field => attrs[field]) ? 
                      attrs[possibleNameFields.find(field => attrs[field])!] : 'Okänt namn';
          
          console.log(`   🏷️ Namn: ${name}`);
          
          // Leta efter EU_CD eller liknande identifierare
          const possibleIdFields = ['EU_CD', 'WATERBODY_ID', 'ID', 'OBJECTID'];
          const id = possibleIdFields.find(field => attrs[field]) ? 
                    attrs[possibleIdFields.find(field => attrs[field])!] : 'Okänt ID';
          
          console.log(`   🆔 ID: ${id}`);
        });
        
        return data;
      } else {
        console.log(`📋 Inga resultat hittades för "${searchTerm}"`);
        return null;
      }
      
    } else {
      const errorText = await response.text();
      console.log(`❌ Query-fel: ${response.status} ${response.statusText}`);
      console.log(`❌ Felmedelande:`, errorText);
      return null;
    }
  } catch (error) {
    console.log(`❌ Query-fel:`, error instanceof Error ? error.message : 'Okänt fel');
    return null;
  }
}

// 🎣 Hämta vattenkvalitetsdata för en specifik vattenförekomst
async function getWaterQualityData(servicePath: string, layerId: number, whereClause: string): Promise<void> {
  console.log(`\n🎣 Hämtar vattenkvalitetsdata...\n`);
  
  const queryParams = new URLSearchParams({
    'f': 'json',
    'where': whereClause,
    'outFields': '*',
    'returnGeometry': 'false'
  });
  
  if (VISS_API_KEY) {
    queryParams.append('token', VISS_API_KEY);
  }
  
  const queryUrl = `${ARCGIS_BASE_URL}/${servicePath}/MapServer/${layerId}/query?${queryParams.toString()}`;
  
  try {
    console.log(`📡 Kvalitetsdata URL: ${queryUrl}`);
    
    const response = await fetch(queryUrl);
    
    if (response.ok) {
      const data: ArcGISQueryResult = await response.json();
      
      if (data.features && data.features.length > 0) {
        console.log('🎣 Vattenkvalitetsdata:');
        
        data.features.forEach((feature, index) => {
          console.log(`\n📊 Kvalitetsdata ${index + 1}:`);
          
          // Leta efter fiskrelevanta parametrar
          const attrs = feature.attributes;
          const fishingParams = [
            'TEMPERATURE', 'TEMP', 'VATTENTEMPERATUR',
            'OXYGEN', 'SYRE', 'SYRGASFORHALLANDEN', 
            'PH', 'PH_VALUE',
            'SALINITY', 'SALINITET',
            'TURBIDITY', 'SIKTDJUP', 'TRANSPARENCY',
            'CHLOROPHYLL', 'KLOROFYLL',
            'NITROGEN', 'KVAVE', 'PHOSPHORUS', 'FOSFOR'
          ];
          
          fishingParams.forEach(param => {
            if (attrs[param] !== undefined && attrs[param] !== null) {
              console.log(`   🎯 ${param}: ${attrs[param]}`);
            }
          });
          
          // Visa alla attribut om inga specifika parametrar hittades
          const foundParams = fishingParams.filter(param => attrs[param] !== undefined && attrs[param] !== null);
          if (foundParams.length === 0) {
            console.log('   📋 Alla attribut:', JSON.stringify(attrs, null, 2));
          }
        });
      } else {
        console.log('📋 Ingen kvalitetsdata hittades');
      }
    } else {
      console.log(`❌ Kvalitetsdata-fel: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`❌ Kvalitetsdata-fel:`, error instanceof Error ? error.message : 'Okänt fel');
  }
}

// 🚀 Huvudfunktion
async function main() {
  try {
    console.log('🚀 Startar VISS ArcGIS REST API-test...\n');

    // 1. Utforska ArcGIS-tjänster
    await exploreArcGISServices();

    // 2. Testa direkta queries mot kända VBK-tjänster (om de inte fungerade ovan)
    console.log('\n🔄 Testar direkta VBK-queries...\n');
    
    const knownServices = [
      'VBK/lst_vbk_read',
      'VBK/lst_vbk_wms_vindbrukskollen'
    ];
    
    for (const service of knownServices) {
      console.log(`🎯 Testar service: ${service}`);
      const serviceUrl = `${ARCGIS_BASE_URL}/${service}/MapServer?f=json`;
      
      try {
        const response = await fetch(serviceUrl, {
          headers: {
            'User-Agent': 'MakrillSverige-FiskeApp/1.0'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log(`✅ ${service} tillgänglig:`, JSON.stringify(data, null, 2));
          
          // Testa query mot första layern
          if (data.layers && data.layers.length > 0) {
            await queryLayer(service, data.layers[0].id, 'Vomb');
          }
        } else {
          console.log(`❌ ${service} inte tillgänglig: ${response.status}`);
        }
      } catch (error) {
        console.log(`❌ ${service} fel:`, error instanceof Error ? error.message : 'Okänt fel');
      }
    }

  } catch (error) {
    console.error('💥 Huvudfel:', error instanceof Error ? error.message : 'Okänt fel');
  }
}

// Kör testet
main();