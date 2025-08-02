const https = require('https');

async function testRunnDalarna() {
  console.log('🔍 TESTAR "RUNN" I DALARNA...\n');
  
  // Dalarna bbox - både syd och nord
  const dalarna_bbox = '59.9,13.4,61.9,16.1'; 
  
  const query = `
[out:json][timeout:60];
(
  way["natural"="water"]["name"~"Runn"](${dalarna_bbox});
  way["water"="lake"]["name"~"Runn"](${dalarna_bbox});
  way["waterway"="river"]["name"~"Runn"](${dalarna_bbox});
  way["waterway"="stream"]["name"~"Runn"](${dalarna_bbox});
  
  relation["natural"="water"]["name"~"Runn"](${dalarna_bbox});
  relation["water"="lake"]["name"~"Runn"](${dalarna_bbox});
);
out geom;
`;

  try {
    const data = await new Promise((resolve, reject) => {
      const postData = query;
      const options = {
        hostname: 'overpass-api.de',
        port: 443,
        path: '/api/interpreter',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          try {
            const parsedData = JSON.parse(rawData);
            resolve(parsedData);
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', (e) => reject(e));
      req.write(postData);
      req.end();
    });

    console.log(`✅ Hittade ${data.elements.length} vattendrag med "Runn" i Dalarna:`);
    
    if (data.elements.length === 0) {
      console.log('❌ INGA "Runn" hittades i Dalarna!');
      console.log('   Detta kan betyda:');
      console.log('   1. "Runn" finns inte som namngett vattendrag i OSM');
      console.log('   2. "Runn" är utanför vårt Dalarna bbox');
      console.log('   3. "Runn" har inte taggen "name" i OSM');
    } else {
      data.elements.forEach((element, i) => {
        console.log(`${i+1}. "${element.tags.name || 'Inget namn'}" (${element.type}, ID: ${element.id})`);
        if (element.tags.water) console.log(`   - water: ${element.tags.water}`);
        if (element.tags.waterway) console.log(`   - waterway: ${element.tags.waterway}`);
        if (element.tags.natural) console.log(`   - natural: ${element.tags.natural}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Fel:', error.message);
  }
}

testRunnDalarna(); 