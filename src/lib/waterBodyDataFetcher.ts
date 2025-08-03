/**
 * Komplett system för att hämta all tillgänglig data för svenska vattendrag
 * Kombinerar data från VISS, SMHI och SvenskaFiskekartan
 */

export interface WaterBodyData {
  // Grundläggande information
  basic: {
    name: string;
    eu_cd: string;
    ms_cd: string;
    type: 'lake' | 'river' | 'coastal' | 'groundwater';
    area_m2?: number;
    coordinates: { lat: number; lon: number };
    county: string;
    district: string;
    viss_url: string;
  };

  // VISS Vattenkvalitetsdata
  waterQuality: {
    // Fysikalisk-kemiska parametrar
    oxygen: {
      status: string;
      conditions: string;
    };
    nutrients: {
      status: string;
      chlorophyll: string;
      phosphorus?: string;
      nitrogen?: string;
    };
    acidity: {
      ph_status: string;
      acid_neutralizing: string;
    };
    transparency: {
      light_conditions: string;
      visibility: string;
    };
    // Ekologisk och kemisk status
    ecological_status: string;
    chemical_status: string;
    overall_risk: string;
  };

  // Fiskdata från VISS och SvenskaFiskekartan
  fishData: {
    // VISS fiskstatus
    fish_community_status: string;
    fish_indices: {
      eqr8?: string;
      aindex_w3?: string;
      aindex_w5?: string;
      vix?: string;
      vix_h?: string;
    };
    // SvenskaFiskekartan arter
    species?: Array<{
      name: string;
      scientific_name?: string;
      status?: string;
      abundance?: string;
    }>;
    fishing_regulations?: {
      closed_seasons?: string[];
      size_limits?: { [species: string]: string };
      bag_limits?: { [species: string]: string };
    };
  };

  // SMHI Realtidsdata
  currentConditions: {
    water_temperature?: {
      value: number;
      unit: string;
      date: string;
      station_name: string;
      station_distance_km?: number;
    };
    weather?: {
      air_temperature: number;
      wind_speed: number;
      precipitation: number;
      date: string;
    };
    // S-HYPE modelldata
    hydrological?: {
      water_flow: number;
      water_level?: number;
      forecast_10_days?: Array<{
        date: string;
        flow: number;
        temperature?: number;
      }>;
    };
  };

  // Metadata
  metadata: {
    last_updated: string;
    data_sources: string[];
    quality_assessment: {
      viss_data_age: string;
      smhi_data_freshness: string;
      completeness_score: number; // 0-100%
    };
  };
}

export class WaterBodyDataFetcher {
  private readonly VISS_BASE_URL = 'https://ext-geodata-applikationer.lansstyrelsen.se/arcgis/rest/services';
  private readonly SMHI_BASE_URL = 'https://opendata-download-metobs.smhi.se/api/version/latest';

  /**
   * Hämtar komplett data för ett vattendrag baserat på namn
   */
  async fetchWaterBodyData(waterBodyName: string): Promise<WaterBodyData | null> {
    try {
      console.log(`🔍 Söker data för: ${waterBodyName}`);

      // 1. Hitta vattenförekomsten i VISS
      const basicInfo = await this.findWaterBody(waterBodyName);
      if (!basicInfo) {
        console.log('❌ Vattenförekomst inte hittad');
        return null;
      }

      console.log(`✅ Hittade: ${basicInfo.name} (${basicInfo.eu_cd})`);

      // 2. Hämta all data parallellt för bättre prestanda
      const [waterQuality, fishData, currentConditions] = await Promise.all([
        this.fetchWaterQuality(basicInfo.eu_cd, basicInfo.ms_cd),
        this.fetchFishData(basicInfo.eu_cd, basicInfo.ms_cd, basicInfo.coordinates),
        this.fetchCurrentConditions(basicInfo.coordinates, basicInfo.name)
      ]);

      // 3. Sammanställ all data
      const result: WaterBodyData = {
        basic: basicInfo,
        waterQuality,
        fishData,
        currentConditions,
        metadata: {
          last_updated: new Date().toISOString(),
          data_sources: ['VISS', 'SMHI', 'SvenskaFiskekartan'],
          quality_assessment: this.assessDataQuality(waterQuality, fishData, currentConditions)
        }
      };

      console.log('🎯 Komplett data hämtad!');
      return result;

    } catch (error) {
      console.error('❌ Fel vid datahämtning:', error);
      return null;
    }
  }

  /**
   * Hitta vattenförekomst i VISS
   */
  private async findWaterBody(name: string): Promise<WaterBodyData['basic'] | null> {
    // Testa flera layers för olika vattentyper
    const layers = [
      { id: 56, type: 'lake' as const, field: 'SJONAMN' },
      { id: 55, type: 'river' as const, field: 'NAMN' }, 
      { id: 57, type: 'coastal' as const, field: 'NAMN' }
    ];

    for (const layer of layers) {
      try {
        const url = `${this.VISS_BASE_URL}/VISS/lst_viss_api/MapServer/${layer.id}/query`;
        const params = new URLSearchParams({
          'where': `UPPER(${layer.field}) LIKE UPPER('%${name}%')`,
          'f': 'json',
          'maxRecordCount': '5',
          'outFields': '*',
          'returnGeometry': 'true'
        });

        const response = await fetch(`${url}?${params}`, {
          headers: { 'User-Agent': 'MakrillSverige-FiskeApp/1.0' }
        });

        if (!response.ok) continue;

        const data = await response.json();
        if (data.features && data.features.length > 0) {
          const feature = data.features[0];
          const attrs = feature.attributes;
          
          // Konvertera koordinater från SWEREF99 till WGS84 (approximation)
          const lat = this.swerefToWgs84Lat(attrs.CORD_SWY || 0);
          const lon = this.swerefToWgs84Lon(attrs.CORD_SWX || 0);

          return {
            name: attrs[layer.field] || attrs.NAME_VISS || name,
            eu_cd: attrs.EU_CD,
            ms_cd: attrs.MS_CD,
            type: layer.type,
            area_m2: attrs.HARO || attrs['SHAPE.area'],
            coordinates: { lat, lon },
            county: attrs.RESP_COU || 'Okänt',
            district: attrs.DISTRICT || attrs.COMP_AUT || 'Okänt',
            viss_url: attrs.URL_VISS || `https://viss.lansstyrelsen.se/Waters.aspx?waterMSCD=${attrs.MS_CD}`
          };
        }
      } catch (error) {
        console.warn(`Fel vid sökning i layer ${layer.id}:`, error);
        continue;
      }
    }

    return null;
  }

  /**
   * Hämta vattenkvalitetsdata från VISS
   */
  private async fetchWaterQuality(euCd: string, msCd: string): Promise<WaterBodyData['waterQuality']> {
    const qualityLayers = [
      { id: 87, type: 'oxygen' },
      { id: 78, type: 'nutrients' },
      { id: 83, type: 'acidity' },
      { id: 85, type: 'transparency' }
    ];

    const results: any = {};

    for (const layer of qualityLayers) {
      try {
        const url = `${this.VISS_BASE_URL}/VISS/lst_viss_status_fys_kem_2017_2021/MapServer/${layer.id}/query`;
        const params = new URLSearchParams({
          'where': `EU_CD='${euCd}' OR MS_CD='${msCd}'`,
          'f': 'json',
          'maxRecordCount': '1',
          'outFields': '*',
          'returnGeometry': 'false'
        });

        const response = await fetch(`${url}?${params}`, {
          headers: { 'User-Agent': 'MakrillSverige-FiskeApp/1.0' }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.features && data.features.length > 0) {
            results[layer.type] = data.features[0].attributes;
          }
        }
      } catch (error) {
        console.warn(`Fel vid hämtning av ${layer.type}:`, error);
      }
    }

    // Mappa VISS-koderna till läsbar status
    return {
      oxygen: {
        status: this.mapVissStatus(results.oxygen?.OXYGEN_CON || 'Okänt'),
        conditions: results.oxygen?.ECO_STAT || 'Okänt'
      },
      nutrients: {
        status: this.mapVissStatus(results.nutrients?.NUTRIENTS || 'Okänt'),
        chlorophyll: this.mapVissStatus(results.nutrients?.CHLOROPH || 'Okänt'),
        phosphorus: results.nutrients?.PHOSPHORUS,
        nitrogen: results.nutrients?.NITROGEN
      },
      acidity: {
        ph_status: this.mapVissStatus(results.acidity?.PH_BENT_AC || 'Okänt'),
        acid_neutralizing: results.acidity?.ACID_NEUT || 'Okänt'
      },
      transparency: {
        light_conditions: this.mapVissStatus(results.transparency?.TRANSP || 'Okänt'),
        visibility: results.transparency?.LIGHT_CONDITIONS || 'Okänt'
      },
      ecological_status: this.mapVissStatus(results.oxygen?.ECO_STAT || 'Okänt'),
      chemical_status: results.oxygen?.CHEM_STAT_SW || 'Okänt',
      overall_risk: results.oxygen?.ECO_STATPOT_SW || 'Okänt'
    };
  }

  /**
   * Hämta fiskdata från VISS och SvenskaFiskekartan
   */
  private async fetchFishData(euCd: string, msCd: string, coordinates: { lat: number; lon: number }): Promise<WaterBodyData['fishData']> {
    const fishData: WaterBodyData['fishData'] = {
      fish_community_status: 'Okänt',
      fish_indices: {}
    };

    // 1. VISS fiskstatus
    try {
      const url = `${this.VISS_BASE_URL}/VISS/lst_viss_status_biologi_2017_2021/MapServer/72/query`;
      const params = new URLSearchParams({
        'where': `EU_CD='${euCd}' OR MS_CD='${msCd}'`,
        'f': 'json',
        'maxRecordCount': '1',
        'outFields': '*',
        'returnGeometry': 'false'
      });

      const response = await fetch(`${url}?${params}`, {
        headers: { 'User-Agent': 'MakrillSverige-FiskeApp/1.0' }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          const attrs = data.features[0].attributes;
          fishData.fish_community_status = this.mapVissStatus(attrs.FISH || 'Okänt');
          fishData.fish_indices = {
            eqr8: attrs.FISH_EQR8,
            aindex_w3: attrs.FISK_AINDW3,
            aindex_w5: attrs.FISK_AINDW5
          };
        }
      }
    } catch (error) {
      console.warn('Fel vid hämtning av VISS fiskdata:', error);
    }

    // 2. SvenskaFiskekartan arter
    try {
      fishData.species = await this.fetchFishSpecies(coordinates);
    } catch (error) {
      console.warn('Fel vid hämtning av fiskarter:', error);
    }

    // 3. Fiskeregler från SvenskaFiskeregler
    try {
      fishData.fishing_regulations = await this.fetchFishingRegulations(coordinates);
    } catch (error) {
      console.warn('Fel vid hämtning av fiskeregler:', error);
    }

    return fishData;
  }

  /**
   * Hämta fiskarter från SvenskaFiskekartan
   */
  private async fetchFishSpecies(coordinates: { lat: number; lon: number }): Promise<Array<{ name: string; scientific_name?: string; status?: string }> | undefined> {
    try {
      // Konvertera WGS84 tillbaka till SWEREF99 för spatial query
      const swerefX = this.wgs84ToSwerefX(coordinates.lon);
      const swerefY = this.wgs84ToSwerefY(coordinates.lat);
      
      const url = `${this.VISS_BASE_URL}/SvenskaFiskekartan/lst_svenskafiskekartan/MapServer/0/query`;
      const params = new URLSearchParams({
        'geometry': `${swerefX},${swerefY}`,
        'geometryType': 'esriGeometryPoint',
        'spatialRel': 'esriSpatialRelIntersects',
        'f': 'json',
        'maxRecordCount': '50',
        'outFields': '*',
        'returnGeometry': 'false'
      });

      const response = await fetch(`${url}?${params}`, {
        headers: { 'User-Agent': 'MakrillSverige-FiskeApp/1.0' }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          return data.features.map((feature: any) => ({
            name: feature.attributes.ARTNAMN || feature.attributes.SPECIES_NAME || 'Okänd art',
            scientific_name: feature.attributes.SCIENTIFIC_NAME,
            status: feature.attributes.STATUS || feature.attributes.ABUNDANCE,
            abundance: feature.attributes.ABUNDANCE
          }));
        }
      }
    } catch (error) {
      console.warn('Fel vid hämtning av fiskarter:', error);
    }
    return undefined;
  }

  /**
   * Hämta fiskeregler
   */
  private async fetchFishingRegulations(coordinates: { lat: number; lon: number }): Promise<WaterBodyData['fishData']['fishing_regulations'] | undefined> {
    try {
      const swerefX = this.wgs84ToSwerefX(coordinates.lon);
      const swerefY = this.wgs84ToSwerefY(coordinates.lat);
      
      const url = `${this.VISS_BASE_URL}/SvenskaFiskeregler/lst_svenskafiskeregler/MapServer/0/query`;
      const params = new URLSearchParams({
        'geometry': `${swerefX},${swerefY}`,
        'geometryType': 'esriGeometryPoint',
        'spatialRel': 'esriSpatialRelIntersects',
        'f': 'json',
        'maxRecordCount': '10',
        'outFields': '*',
        'returnGeometry': 'false'
      });

      const response = await fetch(`${url}?${params}`, {
        headers: { 'User-Agent': 'MakrillSverige-FiskeApp/1.0' }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          // Parse regulations data - structure depends on actual API response
          return {
            closed_seasons: [], // Parse from response
            size_limits: {}, // Parse from response
            bag_limits: {} // Parse from response
          };
        }
      }
    } catch (error) {
      console.warn('Fel vid hämtning av fiskeregler:', error);
    }
    return undefined;
  }

  /**
   * Hämta aktuella förhållanden från SMHI
   */
  private async fetchCurrentConditions(coordinates: { lat: number; lon: number }, waterBodyName: string): Promise<WaterBodyData['currentConditions']> {
    const conditions: WaterBodyData['currentConditions'] = {};

    // 1. Vattentemperatur BORTTAGEN - var missvisande data från lufttemperatur-stationer
    // Vi har ingen verklig vattentemperatur för specifika sjöar

    // 2. Väderdata
    try {
      conditions.weather = await this.fetchWeatherData(coordinates);
    } catch (error) {
      console.warn('Fel vid hämtning av väderdata:', error);
    }

    // 3. Hydrologiska data från S-HYPE
    try {
      conditions.hydrological = await this.fetchHydrologicalData(coordinates, waterBodyName);
    } catch (error) {
      console.warn('Fel vid hämtning av hydrologiska data:', error);
    }

    return conditions;
  }

  /**
   * TEMPERATUR BORTTAGEN - var missvisande lufttemperatur från väderstationer
   */
  private async fetchWaterTemperature(coordinates: { lat: number; lon: number }): Promise<undefined> {
    // Returnerar alltid undefined - vi har ingen verklig vattentemperatur
    return undefined;
  }

  /**
   * Hämta väderdata från SMHI
   */
  private async fetchWeatherData(coordinates: { lat: number; lon: number }): Promise<WaterBodyData['currentConditions']['weather'] | undefined> {
    // Implementation för väderdata från SMHI
    // Detta kräver att identifiera närmaste väderstation och hämta senaste mätningar
    return undefined; // Placeholder
  }

  /**
   * Hämta hydrologiska data från S-HYPE
   */
  private async fetchHydrologicalData(coordinates: { lat: number; lon: number }, waterBody: string): Promise<WaterBodyData['currentConditions']['hydrological'] | undefined> {
    // Implementation för S-HYPE data från SMHI Vattenwebb
    return undefined; // Placeholder
  }

  // Hjälpfunktioner
  private mapVissStatus(code: string): string {
    const statusMap: { [key: string]: string } = {
      'H': 'Hög/Bra',
      'G': 'God',
      'M': 'Måttlig', 
      'B': 'Bra',
      'P': 'Dålig/Risk',
      'Risk': 'Risk',
      'Uppnås ej': 'Uppnås ej',
      'Osäkert': 'Osäkert'
    };
    return statusMap[code] || code;
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // Approximativa koordinatkonverteringar (för produktion, använd proj4js)
  private swerefToWgs84Lat(swerefY: number): number {
    return 55.0 + (swerefY - 6100000) / 111320;
  }

  private swerefToWgs84Lon(swerefX: number): number {
    return 11.0 + (swerefX - 350000) / 71500;
  }

  private wgs84ToSwerefY(lat: number): number {
    return 6100000 + (lat - 55.0) * 111320;
  }

  private wgs84ToSwerefX(lon: number): number {
    return 350000 + (lon - 11.0) * 71500;
  }

  private assessDataQuality(waterQuality: any, fishData: any, currentConditions: any): WaterBodyData['metadata']['quality_assessment'] {
    const scores: number[] = [];
    
    // Bedöm datakomplethet
    if (waterQuality.oxygen.status !== 'Okänt') scores.push(25);
    if (fishData.fish_community_status !== 'Okänt') scores.push(25);
    if (currentConditions.water_temperature) scores.push(25);
    if (fishData.species && fishData.species.length > 0) scores.push(25);
    
    const completeness_score = scores.reduce((a, b) => a + b, 0);
    
    return {
      viss_data_age: '2017-2021 cykel',
      smhi_data_freshness: currentConditions.water_temperature ? 'Senaste dygnet' : 'Ej tillgänglig',
      completeness_score
    };
  }
}

// Exportera för enkel användning
export async function getWaterBodyData(waterBodyName: string): Promise<WaterBodyData | null> {
  const fetcher = new WaterBodyDataFetcher();
  return await fetcher.fetchWaterBodyData(waterBodyName);
}