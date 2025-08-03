import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🌊 VISS Vattenförekomster API Test - Leta efter rätta tjänster');

// VISS ArcGIS REST Services - utan API-nyckel först
const ARCGIS_BASE_URL = 'https://ext-geodata-applikationer.lansstyrelsen.se/arcgis/rest/services';

// 🔍 Leta efter vattenrelaterade tjänster
async function findWaterServices(): Promise<void> {
  console.log('\n🔍 Letar efter vattenrelaterade ArcGIS-tjänster...\n');
  
  try {
    // Utforska huvudkatalogen för alla mappade tjänster
    const catalogUrl = `${ARCGIS_BASE_URL}?f=json`;
    console.log(`📡 Utforskar katalog: ${catalogUrl}`);
    
    const response = await fetch(catalogUrl, {
      headers: {
        'User-Agent': 'MakrillSverige-FiskeApp/1.0'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Tillgängliga mappar och tjänster:', JSON.stringify(data, null, 2));
      
      // Leta specifikt efter vattenrelaterade namn
      const waterRelatedKeywords = [
        'vatten', 'water', 'viss', 'vattenforekost', 'lakes', 'rivers', 
        'marine', 'aquatic', 'hydro', 'kvalitet', 'recipent'
      ];
      
      if (data.folders) {
        console.log('\n🗂️ Analyserar mappar för vattenrelaterat innehåll...');
        
        for (const folder of data.folders) {
          const folderLower = folder.toLowerCase();
          const isWaterRelated = waterRelatedKeywords.some(keyword => 
            folderLower.includes(keyword)
          );
          
          if (isWaterRelated) {
            console.log(`🎯 POTENTIELL VATTENMAPP: ${folder}`);
            await exploreFolder(folder);
          } else {
            console.log(`📁 ${folder} - (inte vattenrelaterad)`);
          }
        }
        
        // Utforska alla mappar om inga explicita vattenmappar hittades
        if (!data.folders.some((folder: string) => 
          waterRelatedKeywords.some(keyword => folder.toLowerCase().includes(keyword))
        )) {
          console.log('\n🔄 Inga explicita vattenmappar hittade, utforskar alla mappar...');
          
          for (const folder of data.folders.slice(0, 5)) { // Begränsa till första 5
            console.log(`\n📂 Utforskar mapp: ${folder}`);
            await exploreFolder(folder);
          }
        }
      }
      
      if (data.services) {
        console.log('\n🌐 Tillgängliga root-tjänster:');
        for (const service of data.services) {
          console.log(`   • ${service.name} (${service.type})`);
        }
      }
      
    } else {
      console.log(`❌ Katalogfel: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`❌ Katalogfel:`, error instanceof Error ? error.message : 'Okänt fel');
  }
}

// 📂 Utforska en specifik mapp
async function exploreFolder(folderName: string): Promise<void> {
  const folderUrl = `${ARCGIS_BASE_URL}/${folderName}?f=json`;
  
  try {
    console.log(`   📡 Testar mapp: ${folderUrl}`);
    
    const response = await fetch(folderUrl, {
      headers: {
        'User-Agent': 'MakrillSverige-FiskeApp/1.0'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ ${folderName} innehåll:`, JSON.stringify(data, null, 2));
      
      if (data.services) {
        for (const service of data.services) {
          // Testa bara MapServer-tjänster som kan innehålla vattendata
          if (service.type === 'MapServer') {
            console.log(`   🗺️ Testar MapServer: ${service.name}`);
            await testMapServerForWaterData(`${folderName}/${service.name}`);
          }
        }
      }
    } else {
      console.log(`   ❌ ${folderName} fel: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`   ❌ ${folderName} fel:`, error instanceof Error ? error.message : 'Okänt fel');
  }
}

// 🗺️ Testa MapServer för vattendata
async function testMapServerForWaterData(servicePath: string): Promise<void> {
  const serviceUrl = `${ARCGIS_BASE_URL}/${servicePath}/MapServer?f=json`;
  
  try {
    const response = await fetch(serviceUrl, {
      headers: {
        'User-Agent': 'MakrillSverige-FiskeApp/1.0'
      }
    });

    if (response.ok) {
      const data = await response.json();
      
      // Analysera metadata för vattenrelaterat innehåll
      const description = (data.description || '').toLowerCase();
      const serviceDescription = (data.serviceDescription || '').toLowerCase();
      const keywords = (data.documentInfo?.Keywords || '').toLowerCase();
      
      const allText = `${description} ${serviceDescription} ${keywords}`;
      
      const waterKeywords = [
        'vatten', 'water', 'sjö', 'lake', 'river', 'vattendrag', 'kvalitet',
        'vattenförekomst', 'recipent', 'syrgasförh', 'temperatur', 'syre'
      ];
      
      const hasWaterContent = waterKeywords.some(keyword => allText.includes(keyword));
      
      if (hasWaterContent) {
        console.log(`     🎯 VATTENRELATERAD TJÄNST HITTAD: ${servicePath}`);
        console.log(`     📄 Beskrivning: ${data.serviceDescription || 'Ingen beskrivning'}`);
        console.log(`     🏷️ Keywords: ${data.documentInfo?.Keywords || 'Inga keywords'}`);
        
        if (data.layers) {
          console.log(`     📋 Layers:`);
          for (const layer of data.layers.slice(0, 3)) { // Visa bara första 3
            console.log(`        • ${layer.id}: ${layer.name}`);
          }
          
          // Testa query på första layern om det finns
          if (data.layers.length > 0) {
            await testWaterQuery(servicePath, data.layers[0].id);
          }
        }
      } else {
        console.log(`     📋 ${servicePath} - (inte vattenrelaterad)`);
      }
      
    } else {
      console.log(`     ❌ ${servicePath} fel: ${response.status}`);
    }
  } catch (error) {
    console.log(`     ❌ ${servicePath} fel:`, error instanceof Error ? error.message : 'Okänt fel');
  }
}

// 🔍 Testa vattenquery utan API-nyckel
async function testWaterQuery(servicePath: string, layerId: number): Promise<void> {
  console.log(`     🔍 Testar query för Vombsjön i layer ${layerId}...`);
  
  // Enkla queries utan API-nyckel
  const queryTests = [
    // Utan API-nyckel
    {
      params: new URLSearchParams({
        'f': 'json',
        'where': "UPPER(NAME) LIKE UPPER('%VOMB%') OR UPPER(NAMN) LIKE UPPER('%VOMB%')",
        'outFields': '*',
        'returnGeometry': 'false',
        'maxRecordCount': '5'
      }),
      description: 'Utan API-nyckel'
    },
    // Generisk query för att se vilka fält som finns
    {
      params: new URLSearchParams({
        'f': 'json',
        'where': '1=1',
        'outFields': '*',
        'returnGeometry': 'false',
        'maxRecordCount': '1',
        'returnFieldNames': 'true'
      }),
      description: 'Fältanalys'
    }
  ];
  
  for (const test of queryTests) {
    const queryUrl = `${ARCGIS_BASE_URL}/${servicePath}/MapServer/${layerId}/query?${test.params.toString()}`;
    
    try {
      console.log(`        📡 ${test.description}: ${queryUrl.substring(0, 120)}...`);
      
      const response = await fetch(queryUrl, {
        headers: {
          'User-Agent': 'MakrillSverige-FiskeApp/1.0'
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.error) {
          console.log(`        ❌ ${test.description} fel:`, data.error.message);
        } else if (data.features) {
          console.log(`        ✅ ${test.description} - Hittade ${data.features.length} resultat`);
          
          if (data.features.length > 0) {
            console.log(`        📊 Exempel på attribut:`, Object.keys(data.features[0].attributes || {}));
            
            // Visa första resultatet om det innehåller "vomb"
            const firstFeature = data.features[0];
            const attrs = firstFeature.attributes || {};
            const hasVomb = Object.values(attrs).some(value => 
              String(value).toLowerCase().includes('vomb')
            );
            
            if (hasVomb) {
              console.log(`        🎯 VOMB-RELATERAT RESULTAT:`, JSON.stringify(attrs, null, 2));
            }
          }
          
          if (data.fields) {
            console.log(`        📋 Tillgängliga fält: ${data.fields.map((f: any) => f.name).join(', ')}`);
          }
        }
      } else {
        console.log(`        ❌ ${test.description} HTTP-fel: ${response.status}`);
      }
    } catch (error) {
      console.log(`        ❌ ${test.description} nätverksfel:`, error instanceof Error ? error.message : 'Okänt fel');
    }
  }
}

// 🚀 Huvudfunktion
async function main() {
  try {
    console.log('🚀 Startar VISS vattenförekomster API-test...\n');
    
    // Leta efter vattenrelaterade tjänster
    await findWaterServices();
    
    console.log('\n🎣 Sammanfattning:');
    console.log('• Vi utforskade VISS ArcGIS-tjänster utan API-nyckel');
    console.log('• VBK = Vindbrukskollen (vindkraft, inte vatten)');
    console.log('• Letade efter riktiga vattenförekomsttjänster');
    
  } catch (error) {
    console.error('💥 Huvudfel:', error instanceof Error ? error.message : 'Okänt fel');
  }
}

// Kör testet
main();