#!/usr/bin/env ts-node

/**
 * SNABB CACHED WATERWAYS PROCESSOR
 * Använder befintlig geocoding cache + minimal ny geocoding
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const projectRoot = process.cwd();
config({ path: join(projectRoot, '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const BATCH_SIZE = 1000;
const INSERT_BATCH_SIZE = 100;
const CACHE_FILE = join(projectRoot, 'node_place_cache.json');

interface CachedPlace {
  name: string | null;
  timestamp: number;
  accuracy: 'high' | 'medium' | 'low';
}

interface WaterBody {
  id: number;
  name: string;
  lat: number;
  lon: number;
  area_km2?: number;
  water_type?: string;
  data_source?: string;
  source_priority?: number;
  depth_mean?: number;
  depth_max?: number;
  volume_m3?: number;
  ecological_status?: string;
  fishing_regulations?: any;
  water_quality_status?: string;
  region?: string;
  tags?: any;
  [key: string]: any;
}

// File-based geocoding cache for Node.js
class FilePlaceNameCache {
  private cache = new Map<string, CachedPlace>();
  private readonly COORDINATE_PRECISION = 3; // Same as browser cache
  
  constructor() {
    this.loadFromFile();
  }
  
  private getCacheKey(lat: number, lon: number): string {
    const precision = this.COORDINATE_PRECISION;
    const roundedLat = Math.round(lat * Math.pow(10, precision)) / Math.pow(10, precision);
    const roundedLon = Math.round(lon * Math.pow(10, precision)) / Math.pow(10, precision);
    return `${roundedLat},${roundedLon}`;
  }
  
  private loadFromFile(): void {
    try {
      if (existsSync(CACHE_FILE)) {
        const data = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
        Object.entries(data).forEach(([key, value]) => {
          this.cache.set(key, value as CachedPlace);
        });
        console.log(`📋 Loaded ${this.cache.size} cached places from file`);
      }
    } catch (error) {
      console.warn('⚠️ Could not load place cache:', error);
    }
  }
  
  private saveToFile(): void {
    try {
      const data: Record<string, CachedPlace> = {};
      this.cache.forEach((value, key) => {
        data[key] = value;
      });
      writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('⚠️ Could not save place cache:', error);
    }
  }
  
  async getPlaceName(lat: number, lon: number): Promise<{ placeName: string | null }> {
    const cacheKey = this.getCacheKey(lat, lon);
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { placeName: cached.name };
    }
    
    // Fallback to API (but with minimal calls)
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1&accept-language=sv,en`,
        {
          headers: {
            'User-Agent': 'MakrillSverige-UnifiedProcessing/1.0 (https://makrillsverige.se)'
          }
        }
      );
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      const placeName = data?.display_name || null;
      
      // Cache the result
      this.cache.set(cacheKey, {
        name: placeName,
        timestamp: Date.now(),
        accuracy: 'medium'
      });
      
      // Save to file periodically
      if (this.cache.size % 10 === 0) {
        this.saveToFile();
      }
      
      return { placeName };
      
    } catch (error) {
      console.warn(`⚠️ Geocoding failed for ${lat}, ${lon}:`, error);
      
      // Cache the failure too
      this.cache.set(cacheKey, {
        name: null,
        timestamp: Date.now(),
        accuracy: 'low'
      });
      
      return { placeName: null };
    }
  }
  
  getCacheStats() {
    return {
      size: this.cache.size,
      hitRate: 0 // Could be calculated if needed
    };
  }
  
  saveCache() {
    this.saveToFile();
  }
}

const placeCache = new FilePlaceNameCache();

/**
 * Extrahera kommun från platsnamn
 */
function extractMunicipality(placeName: string | null): string {
  if (!placeName) return 'Okänd kommun';
  
  const parts = placeName.split(',').map(p => p.trim());
  
  for (const part of parts) {
    if (part.includes('kommun') || part.includes('stad') || part.includes('Municipality')) {
      return part;
    }
  }
  
  return parts[0] || 'Okänd kommun';
}

/**
 * Beräkna avstånd mellan två punkter
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Geografisk klustring för samma namn
 */
function performGeographicClustering(segments: WaterBody[], maxDistanceKm: number = 5): WaterBody[][] {
  const clusters: WaterBody[][] = [];
  const processed = new Set<number>();
  
  for (const segment of segments) {
    if (processed.has(segment.id)) continue;
    
    const cluster = [segment];
    processed.add(segment.id);
    
    for (const otherSegment of segments) {
      if (processed.has(otherSegment.id)) continue;
      
      const distance = calculateDistance(
        segment.lat, segment.lon,
        otherSegment.lat, otherSegment.lon
      );
      
      if (distance <= maxDistanceKm) {
        cluster.push(otherSegment);
        processed.add(otherSegment.id);
      }
    }
    
    clusters.push(cluster);
  }
  
  return clusters;
}

/**
 * Hämta ALLA vattendrag med cursor-baserad pagination
 */
async function fetchAllWaterwaysWithCursor(): Promise<WaterBody[]> {
  console.log('📊 HÄMTAR ALLA VATTENDRAG...');
  
  let allWaterways: WaterBody[] = [];
  let lastId = 0;
  let hasMore = true;
  let batchNumber = 1;
  
  while (hasMore) {
    if (batchNumber % 20 === 0) {
      console.log(`   📦 Batch ${batchNumber}: Hämtat ${allWaterways.length.toLocaleString()} hittills...`);
    }
    
    const { data, error } = await supabase
      .from('water_bodies_integrated')
      .select('*')
      .not('name', 'is', null)
      .not('geometry', 'is', null)
      .gt('id', lastId)
      .order('id')
      .limit(BATCH_SIZE);
    
    if (error) {
      throw new Error(`Hämtning misslyckades: ${error.message}`);
    }
    
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allWaterways = allWaterways.concat(data);
      lastId = data[data.length - 1].id;
      
      if (data.length < BATCH_SIZE) {
        hasMore = false;
      }
    }
    
    batchNumber++;
    
    if (batchNumber > 200) {
      console.warn('⚠️ Säkerhetsbrytare: Max 200 batches');
      break;
    }
  }
  
  console.log(`✅ TOTALT HÄMTAT: ${allWaterways.length.toLocaleString()} vattendrag`);
  return allWaterways;
}

/**
 * SMART processning med minimal geocoding
 */
async function processAllWaterwaysWithCache(allWaterways: WaterBody[]): Promise<any[]> {
  console.log('🧠 PROCESSAR MED CACHED GEOCODING...');
  
  // Gruppera efter namn
  const nameGroups: { [key: string]: WaterBody[] } = {};
  allWaterways.forEach(waterway => {
    if (!nameGroups[waterway.name]) {
      nameGroups[waterway.name] = [];
    }
    nameGroups[waterway.name].push(waterway);
  });
  
  console.log(`   📊 ${Object.keys(nameGroups).length} unika namn att processa`);
  
  const unifiedWaterways: any[] = [];
  let nameIndex = 0;
  let geocodingCalls = 0;
  let cacheHits = 0;
  
  for (const [name, segments] of Object.entries(nameGroups)) {
    nameIndex++;
    
    if (nameIndex % 1000 === 0 || nameIndex % 100 === 0) {
      const cacheHitRate = geocodingCalls > 0 ? Math.round((cacheHits / geocodingCalls) * 100) : 0;
      console.log(`   📋 ${nameIndex}/${Object.keys(nameGroups).length}: "${name}" - ${unifiedWaterways.length} unified, ${geocodingCalls} API calls, ${cacheHitRate}% cache hit rate`);
    }
    
    try {
      console.log(`   🔍 Processing "${name}" (${segments.length} segments)...`);
      if (segments.length === 1) {
        // Enkelt vattendrag - ingen geocoding
        const unified = createUnifiedWaterway(name, segments);
        unifiedWaterways.push(unified);
        
      } else {
        // Multipla segment - smart logik
        const clusters = performGeographicClustering(segments, 5);
        
                        if (clusters.length === 1) {
                  // SAMMA vattendrag - kolla om det är för långt och ska delas
                  const cluster = clusters[0];
                  
                  // Beräkna längd av vattendraget
                  let maxDistance = 0;
                  for (let i = 0; i < cluster.length; i++) {
                    for (let j = i + 1; j < cluster.length; j++) {
                      const distance = calculateDistance(
                        cluster[i].lat, cluster[i].lon,
                        cluster[j].lat, cluster[j].lon
                      );
                      maxDistance = Math.max(maxDistance, distance);
                    }
                  }
                  
                  // Om vattendraget är längre än 50km, dela upp det
                  if (maxDistance > 50 && cluster.length > 10) {
                    console.log(`   🔧 Delar upp långt vattendrag "${name}" (${maxDistance.toFixed(1)}km, ${cluster.length} segment)`);
                    
                    // Dela upp i geografiska sektioner (enkel implementation)
                    const midLat = cluster.reduce((sum, seg) => sum + seg.lat, 0) / cluster.length;
                    const northernSegments = cluster.filter(seg => seg.lat > midLat);
                    const southernSegments = cluster.filter(seg => seg.lat <= midLat);
                    
                    // Geocoda båda delarna
                    if (northernSegments.length > 0) {
                      const northCentroid = {
                        lat: northernSegments.reduce((sum, seg) => sum + seg.lat, 0) / northernSegments.length,
                        lon: northernSegments.reduce((sum, seg) => sum + seg.lon, 0) / northernSegments.length
                      };
                      
                      const northLocation = await placeCache.getPlaceName(northCentroid.lat, northCentroid.lon);
                      if (northLocation.placeName) cacheHits++;
                      const northMunicipality = extractMunicipality(northLocation.placeName);
                      const northName = `${name} (${northMunicipality.replace(' kommun', '')})`;
                      
                      const northUnified = createUnifiedWaterway(name, northernSegments, northName, northMunicipality);
                      northUnified.disambiguation_source = 'long_waterway_split';
                      northUnified.is_split_section = true;
                      northUnified.split_parent_name = name;
                      northUnified.split_section_order = 1;
                      unifiedWaterways.push(northUnified);
                      
                      geocodingCalls++;
                      await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    
                    if (southernSegments.length > 0) {
                      const southCentroid = {
                        lat: southernSegments.reduce((sum, seg) => sum + seg.lat, 0) / southernSegments.length,
                        lon: southernSegments.reduce((sum, seg) => sum + seg.lon, 0) / southernSegments.length
                      };
                      
                      const southLocation = await placeCache.getPlaceName(southCentroid.lat, southCentroid.lon);
                      if (southLocation.placeName) cacheHits++;
                      const southMunicipality = extractMunicipality(southLocation.placeName);
                      const southName = `${name} (${southMunicipality.replace(' kommun', '')})`;
                      
                      const southUnified = createUnifiedWaterway(name, southernSegments, southName, southMunicipality);
                      southUnified.disambiguation_source = 'long_waterway_split';
                      southUnified.is_split_section = true;
                      southUnified.split_parent_name = name;
                      southUnified.split_section_order = 2;
                      unifiedWaterways.push(southUnified);
                      
                      geocodingCalls++;
                      await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    
                  } else {
                    // Normalt vattendrag - ingen splitting
                    const unified = createUnifiedWaterway(name, cluster);
                    unifiedWaterways.push(unified);
                  }
                  
                } else {
          // OLIKA vattendrag - GEOCODA ALLA (fullständig logik)
          for (let i = 0; i < clusters.length; i++) {
            const cluster = clusters[i];
            
            try {
              // Geocoda för ALLA kluster som är olika vattendrag
              const centroid = {
                lat: cluster.reduce((sum, seg) => sum + seg.lat, 0) / cluster.length,
                lon: cluster.reduce((sum, seg) => sum + seg.lon, 0) / cluster.length
              };
              
              const location = await placeCache.getPlaceName(centroid.lat, centroid.lon);
              
              if (location.placeName) {
                cacheHits++;
                const municipality = extractMunicipality(location.placeName);
                const disambiguatedName = `${name} (${municipality.replace(' kommun', '')})`;
                
                const unified = createUnifiedWaterway(name, cluster, disambiguatedName, municipality);
                unified.disambiguation_source = 'cached_geocoding';
                unifiedWaterways.push(unified);
              } else {
                // Fallback med område-nummer
                const fallbackName = `${name} (Område ${i + 1})`;
                const unified = createUnifiedWaterway(name, cluster, fallbackName);
                unifiedWaterways.push(unified);
              }
              
              geocodingCalls++;
              
              // Snabbare delay (100ms istället för 1000ms)
              await new Promise(resolve => setTimeout(resolve, 100));
              
            } catch (error) {
              // Fallback utan geocoding
              const fallbackName = `${name} (Område ${i + 1})`;
              const unified = createUnifiedWaterway(name, cluster, fallbackName);
              unifiedWaterways.push(unified);
            }
          }
        }
      }
      
    } catch (error) {
      console.error(`❌ Fel vid processning av "${name}" (${nameIndex}/${Object.keys(nameGroups).length}):`, error);
      console.error(`   Stack trace:`, error instanceof Error ? error.stack : 'No stack');
      // Fortsätt med nästa namn istället för att krascha helt
    }
  }
  
  // Spara cache
  placeCache.saveCache();
  
  console.log(`🎉 PROCESSNING KLAR:`);
  console.log(`   📊 ${unifiedWaterways.length.toLocaleString()} unified waterways`);
  console.log(`   🌐 ${geocodingCalls} geocoding calls`);
  console.log(`   📋 ${cacheHits} cache hits`);
  console.log(`   ⚡ Cache hit rate: ${geocodingCalls > 0 ? Math.round((cacheHits / geocodingCalls) * 100) : 0}%`);
  
  return unifiedWaterways;
}

/**
 * Skapa unified waterway från segment
 */
function createUnifiedWaterway(name: string, segments: WaterBody[], displayName?: string, municipality?: string): any {
  const centroid = {
    lat: segments.reduce((sum, seg) => sum + seg.lat, 0) / segments.length,
    lon: segments.reduce((sum, seg) => sum + seg.lon, 0) / segments.length
  };
  
  const totalArea = segments.reduce((sum, seg) => sum + (seg.area_km2 || 0), 0);
  
  const finalDisplayName = displayName || name;
  
  // Enkla söktermer: bara namn + kommun (om det finns)
  const searchTermsArray = [name];
  
  // Lägg till kommun om det finns (för disambiguering)
  if (municipality) {
    const cleanMunicipality = municipality.replace(' kommun', '').replace(' stad', '');
    searchTermsArray.push(cleanMunicipality);
  }
  
  const searchTerms = searchTermsArray
    .filter(term => term && term.length > 0)
    .join(' ');
  
  return {
    name: name,
    display_name: finalDisplayName,
    search_terms: searchTerms,
    municipality: municipality,
    lat: centroid.lat,
    lon: centroid.lon,
    total_area_km2: totalArea,
    original_segment_count: segments.length,
    original_segment_ids: segments.map(s => s.id),
    unification_method: segments.length > 1 ? 'gap_preserving_merge' : 'single',
    gap_handling: segments.length > 1 ? 'preserved' : 'none',
    is_split_section: false,
    split_parent_name: null,
    split_section_order: null,
    water_type: segments[0].water_type,
    data_source: segments[0].data_source,
    source_priority: segments[0].source_priority || 1,
    depth_mean: segments[0].depth_mean,
    depth_max: segments[0].depth_max,
    volume_m3: segments[0].volume_m3,
    ecological_status: segments[0].ecological_status,
    fishing_regulations: segments[0].fishing_regulations,
    water_quality_status: segments[0].water_quality_status,
    region: segments[0].region,
    tags: segments[0].tags,
    processing_notes: segments.length > 1 ? 
      `Merged from ${segments.length} segments` : 
      'Single segment waterway',
    disambiguation_source: displayName && displayName !== name ? 'cached_geocoding' : 'none'
  };
}

/**
 * Batch-infoga i water_bodies_unified
 */
async function insertUnifiedWaterways(unifiedWaterways: any[]): Promise<void> {
  console.log('💾 INFOGAR I WATER_BODIES_UNIFIED...');
  
  // Rensa befintlig data först
  console.log('🗑️ Rensar befintlig data...');
  const { error: clearError } = await supabase
    .from('water_bodies_unified')
    .delete()
    .neq('id', 0);
  
  if (clearError) {
    throw new Error(`Rensning misslyckades: ${clearError.message}`);
  }
  
  // Infoga i batches
  let insertedCount = 0;
  
  for (let i = 0; i < unifiedWaterways.length; i += INSERT_BATCH_SIZE) {
    const batch = unifiedWaterways.slice(i, i + INSERT_BATCH_SIZE);
    
    const { error } = await supabase
      .from('water_bodies_unified')
      .insert(batch);
    
    if (error) {
      console.error(`❌ Batch insertion error at ${i}:`, error);
      throw new Error(`Batch insertion failed: ${error.message}`);
    }
    
    insertedCount += batch.length;
    
    if (insertedCount % 1000 === 0 || insertedCount === unifiedWaterways.length) {
      console.log(`   📊 Infogade: ${insertedCount.toLocaleString()}/${unifiedWaterways.length.toLocaleString()}`);
    }
  }
  
  console.log(`✅ ALLA INFOGADE: ${insertedCount.toLocaleString()} unified waterways`);
}

/**
 * HUVUDPROCESS MED CACHE-OPTIMERING
 */
async function runFastCachedProcess(): Promise<void> {
  console.log('🚀 SNABB CACHED WATERWAYS PROCESSOR');
  console.log('='.repeat(60));
  
  try {
    // STEG 1: Hämta alla
    const allWaterways = await fetchAllWaterwaysWithCursor();
    
    if (allWaterways.length < 140000) {
      throw new Error(`För få vattendrag: ${allWaterways.length} (förväntat ~142,739)`);
    }
    
    // STEG 2: Processa med cache
    const unifiedWaterways = await processAllWaterwaysWithCache(allWaterways);
    
    // STEG 3: Infoga alla
    await insertUnifiedWaterways(unifiedWaterways);
    
    // Verifiera slutresultat
    const { count: finalCount } = await supabase
      .from('water_bodies_unified')
      .select('*', { count: 'exact', head: true });
      
    console.log('\n🎉 SNABB CACHED PROCESS SLUTFÖRD!');
    console.log('='.repeat(60));
    console.log(`📊 RESULTAT:`);
    console.log(`   Original: ${allWaterways.length.toLocaleString()}`);
    console.log(`   Unified: ${finalCount?.toLocaleString()}`);
    console.log(`   Cache stats: ${placeCache.getCacheStats().size} platser`);
    console.log(`   Status: ${finalCount && finalCount >= 140000 ? '✅ SUCCESS' : '❌ NEEDS INVESTIGATION'}`);
    
  } catch (error) {
    console.error('❌ FAST CACHED PROCESS MISSLYCKADES:', error);
    throw error;
  }
}

// Kör processing
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  runFastCachedProcess()
    .then(() => {
      console.log('\n✅ Fast cached processing slutförd!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Fast cached processing misslyckades:', error);
      process.exit(1);
    });
}

export { runFastCachedProcess };