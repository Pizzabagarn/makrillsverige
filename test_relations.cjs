const https = require('https');

// TEST SKÅNE DIREKT FÖR VOMBSJÖN OCH ANDRA STORA SJÖAR
async function testVombRelations() {
  console.log('🧪 TESTAR RELATIONS FÖR VOMBSJÖN OCH STORA SJÖAR I SKÅNE...\n');
  
  const skane_bbox = '55.3,12.5,56.6,14.4'; // Hela Skåne
  
  const query = `
[out:json][timeout:60];
(
  // BARA RELATIONS - STORA SJÖAR
  relation["natural"="water"]["name"~"Vomb"](${skane_bbox});
  relation["water"="lake"]["name"~"Vomb"](${skane_bbox});
  relation["place"="lake"]["name"~"Vomb"](${skane_bbox});
  
  relation["natural"="water"]["name"~"Snogeholm"](${skane_bbox});
  relation["water"="lake"]["name"~"Snogeholm"](${skane_bbox});
  relation["place"="lake"]["name"~"Snogeholm"](${skane_bbox});
  
  relation["natural"="water"]["name"~"Ivö"](${skane_bbox});
  relation["water"="lake"]["name"~"Ivö"](${skane_bbox});
  relation["place"="lake"]["name"~"Ivö"](${skane_bbox});
  
  relation["natural"="water"]["name"~"Finja"](${skane_bbox});
  relation["water"="lake"]["name"~"Finja"](${skane_bbox});
  relation["place"="lake"]["name"~"Finja"](${skane_bbox});
);
out geom;
`;

  try {
    console.log('📡 Skickar Overpass query...');
    
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

      req.on('error', (e) => {
        reject(e);
      });

      req.write(postData);
      req.end();
    });
    
    console.log(`\n📊 RESULTAT:`);
    console.log(`Total elements: ${data.elements.length}`);
    
    if (data.elements.length === 0) {
      console.log('❌ INGA RELATIONS HITTADE! Detta förklarar problemet.');
      
      // Testa om de finns som WAYS istället
      console.log('\n🔍 TESTAR SOM WAYS ISTÄLLET...');
      
      const wayQuery = `
[out:json][timeout:60];
(
  way["natural"="water"]["name"~"Vomb"](${skane_bbox});
  way["water"="lake"]["name"~"Vomb"](${skane_bbox});
  way["natural"="water"]["name"~"Snogeholm"](${skane_bbox});
  way["water"="lake"]["name"~"Snogeholm"](${skane_bbox});
);
out geom;
`;
      
      const wayData = await new Promise((resolve, reject) => {
        const postData = wayQuery;
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

        req.on('error', (e) => {
          reject(e);
        });

        req.write(postData);
        req.end();
      });
      
      console.log(`Ways found: ${wayData.elements.length}`);
      
      wayData.elements.forEach(element => {
        console.log(`  ✅ "${element.tags.name}" (${element.type}, ID: ${element.id})`);
      });
      
    } else {
      data.elements.forEach(element => {
        console.log(`  ✅ "${element.tags.name}" (${element.type}, ID: ${element.id})`);
      });
    }
    
  } catch (error) {
    console.log(`❌ Fel: ${error.message}`);
  }
}

testVombRelations(); 