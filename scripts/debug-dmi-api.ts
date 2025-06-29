import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const API_KEY = process.env.DMI_API_KEY;
if (!API_KEY) throw new Error('DMI_API_KEY saknas i .env.local');

// 🔍 Kolla tillgängliga collections
async function checkCollections() {
  console.log('🔍 Kollar tillgängliga collections...');
  
  const url = `https://dmigw.govcloud.dk/v1/forecastedr/collections?api-key=${API_KEY}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`❌ Fel: ${res.status} - ${res.statusText}`);
      return;
    }
    
    const data = await res.json() as any;
    
    console.log(`📋 Hittade ${data.collections?.length || 0} collections:`);
    
    if (data.collections) {
      // Sök efter DKSS-relaterade collections
      const dkssCollections = data.collections.filter((c: any) => 
        c.id?.toLowerCase().includes('dkss')
      );
      
      console.log('\n🌊 DKSS (Storm Surge) Collections:');
      dkssCollections.forEach((c: any) => {
        console.log(`  • ${c.id}: ${c.title || 'Ingen titel'}`);
        console.log(`    Område: ${c.extent?.spatial?.bbox || 'Okänt'}`);
        if (c.parameter_names?.length > 0) {
          console.log(`    Parametrar: ${c.parameter_names.slice(0, 5).join(', ')}${c.parameter_names.length > 5 ? '...' : ''}`);
        }
        console.log('');
      });
      
      // Visa även andra collections
      console.log('\n📊 Alla Collections:');
      data.collections.forEach((c: any) => {
        console.log(`  • ${c.id}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Fel vid hämtning av collections:', error);
  }
}

// 🔍 Kolla specifik collection
async function checkSpecificCollection(collectionId: string) {
  console.log(`\n🔍 Kollar collection: ${collectionId}`);
  
  const url = `https://dmigw.govcloud.dk/v1/forecastedr/collections/${collectionId}?api-key=${API_KEY}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`❌ Collection ${collectionId} finns inte eller är otillgänglig: ${res.status}`);
      return;
    }
    
    const data = await res.json() as any;
    
    console.log(`📋 Collection: ${data.id}`);
    console.log(`📝 Titel: ${data.title || 'Ingen titel'}`);
    console.log(`📝 Beskrivning: ${data.description || 'Ingen beskrivning'}`);
    console.log(`🌍 Område: ${JSON.stringify(data.extent?.spatial?.bbox || 'Okänt')}`);
    console.log(`🗓️  Tid: ${JSON.stringify(data.extent?.temporal || 'Okänt')}`);
    
    if (data.parameter_names?.length > 0) {
      console.log(`\n📊 Tillgängliga parametrar (${data.parameter_names.length}):`);
      data.parameter_names.forEach((param: string, i: number) => {
        console.log(`  ${i + 1}. ${param}`);
      });
    }
    
    // Kolla vilka queries som stöds
    if (data.links) {
      console.log('\n🔗 Tillgängliga endpoints:');
      data.links.forEach((link: any) => {
        if (link.rel && link.href) {
          console.log(`  • ${link.rel}: ${link.href.split('?')[0]}`);
        }
      });
    }
    
  } catch (error) {
    console.error(`❌ Fel vid hämtning av collection ${collectionId}:`, error);
  }
}

// 🔍 Kolla instanser
async function checkInstances(collectionId: string) {
  console.log(`\n🔍 Kollar instanser för: ${collectionId}`);
  
  const url = `https://dmigw.govcloud.dk/v1/forecastedr/collections/${collectionId}/instances?api-key=${API_KEY}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`❌ Kunde inte hämta instanser: ${res.status}`);
      return;
    }
    
    const data = await res.json() as any;
    
    console.log(`📅 Hittade ${data.instances?.length || 0} instanser:`);
    
    if (data.instances?.length > 0) {
      console.log('🕐 Senaste instanser:');
      data.instances.slice(0, 5).forEach((instance: any, i: number) => {
        console.log(`  ${i + 1}. ${instance.id}`);
      });
    }
    
  } catch (error) {
    console.error(`❌ Fel vid hämtning av instanser:`, error);
  }
}

// 🧪 Testa ett enkelt position-anrop
async function testPositionCall(collectionId: string, params: string[]) {
  console.log(`\n🧪 Testar position-anrop för ${collectionId}...`);
  
  const url = new URL(`https://dmigw.govcloud.dk/v1/forecastedr/collections/${collectionId}/position`);
  url.searchParams.set('coords', 'POINT(12.5 55.7)'); // Malmö-området
  url.searchParams.set('crs', 'crs84');
  url.searchParams.set('parameter-name', params.slice(0, 2).join(','));
  url.searchParams.set('api-key', API_KEY!);
  
  try {
    console.log(`🔗 Test URL: ${url.toString().replace(API_KEY!, '[API_KEY]')}`);
    
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error(`❌ Position-anrop misslyckades: ${res.status} - ${res.statusText}`);
      const errorText = await res.text();
      console.error(`Error body: ${errorText.slice(0, 200)}...`);
      return;
    }
    
    const data = await res.json() as any;
    console.log(`✅ Position-anrop lyckades!`);
    console.log(`📊 Data-typ: ${data.type || 'Okänd'}`);
    
    if (data.domain?.axes?.t?.values) {
      console.log(`📅 Tidssteg: ${data.domain.axes.t.values.length}`);
      console.log(`📅 Första tid: ${data.domain.axes.t.values[0]}`);
      console.log(`📅 Sista tid: ${data.domain.axes.t.values[data.domain.axes.t.values.length - 1]}`);
    }
    
  } catch (error) {
    console.error(`❌ Fel vid position-test:`, error);
  }
}

// 🚀 Huvudfunktion
async function main() {
  console.log('🔍 DMI API Debug Tool');
  console.log('====================');
  
  // 1. Kolla alla collections
  await checkCollections();
  
  // 2. Kolla specifika collections som kan vara intressanta
  const collectionsToCheck = ['dkss_idw', 'dkss_nsbs', 'dkss_ws'];
  
  for (const collection of collectionsToCheck) {
    await checkSpecificCollection(collection);
    await checkInstances(collection);
    await testPositionCall(collection, ['current-u', 'current-v']);
    console.log('\n' + '='.repeat(50));
  }
}

main().catch(console.error); 