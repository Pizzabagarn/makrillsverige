import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import { extract } from 'zip-lib';

interface SvarMap {
  name: string;
  path: string;
  area?: string;
  type: 'tif' | 'jpg' | 'png' | 'pdf';
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'MakrillSverige/1.0 (https://makrillsverige.se; alexander.westman3@gmail.com)',
      }
    }, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }

      const fileStream = require('fs').createWriteStream(outputPath);
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });

      fileStream.on('error', (err: Error) => {
        require('fs').unlinkSync(outputPath);
        reject(err);
      });
    }).on('error', reject);
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sjoid = searchParams.get('sjoid');

  if (!sjoid) {
    return NextResponse.json(
      { error: 'Missing required parameter: sjoid' },
      { status: 400 }
    );
  }

  try {
    const cacheDir = path.join(process.cwd(), 'public', 'data', 'svar', 'cache', sjoid);
    const metadataPath = path.join(cacheDir, 'metadata.json');

    // Check if already cached
    try {
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
      return NextResponse.json({
        sjoid,
        lakeName: metadata.lakeName || '',
        maps: metadata.maps,
        cached: true,
      });
    } catch (error) {
      // Not cached, proceed to download
    }

    // Download from SMHI
    const downloadUrl = `https://www.smhi.se/polopoly_fs/1.164979.1519657859!/sjo/${sjoid}.zip`;
    const zipPath = path.join(process.cwd(), 'temp', `${sjoid}.zip`);

    // Ensure temp directory exists
    await fs.mkdir(path.dirname(zipPath), { recursive: true });

    console.log(`📥 Downloading map for SJOID ${sjoid}...`);
    await downloadFile(downloadUrl, zipPath);

    // Extract
    await fs.mkdir(cacheDir, { recursive: true });
    await extract(zipPath, cacheDir);

    // Clean up zip
    await fs.unlink(zipPath);

    // Find all map files
    const files = await fs.readdir(cacheDir);
    const maps: SvarMap[] = [];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase().slice(1);
      if (['tif', 'tiff', 'jpg', 'jpeg', 'png', 'pdf'].includes(ext)) {
        const areaMatch = file.match(/\(([^)]+)\)/);
        maps.push({
          name: file,
          path: `/data/svar/cache/${sjoid}/${file}`,
          area: areaMatch ? areaMatch[1] : undefined,
          type: ext as SvarMap['type'],
        });
      }
    }

    // Save metadata
    const metadata = {
      sjoid,
      lakeName: '',
      maps,
      downloadedAt: new Date().toISOString(),
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    console.log(`✅ Downloaded ${maps.length} maps for SJOID ${sjoid}`);

    return NextResponse.json({
      sjoid,
      lakeName: metadata.lakeName,
      maps,
      cached: false,
    });

  } catch (error) {
    console.error('Error in get-maps API:', error);
    
    // Return empty maps list if download fails (lake might not have maps)
    return NextResponse.json({
      sjoid,
      lakeName: '',
      maps: [],
      cached: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
