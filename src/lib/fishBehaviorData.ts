/**
 * Fish Behavior Data Processing Utilities
 * Processes data from fish_behavior.json for interactive visualizations
 */

export interface FishBehaviorData {
  id: string;
  svenskt_namn: string;
  latinskt_namn: string;
  activity: ActivityData[];
  diet_preferences: DietData[];
  recommended_methods: MethodData[];
  spatial_distribution: SpatialData[];
  fishing_tactics: TacticData[];
  regulations?: RegulationData;
  source?: string;
  confidence?: string;
  last_updated?: string;
}

export interface ActivityData {
  parameter: string;
  range: any;
  activity_index: { low: number; high: number };
  notes: string;
  refs?: number[];
}

export interface DietData {
  parameter: string;
  range: any;
  diet: Record<string, number>;
  notes: string;
  refs?: number[];
}

export interface MethodData {
  method: string;
  best_time?: string[];
  best_temp?: { min: number; max: number; unit: string };
  notes: string;
}

export interface SpatialData {
  parameter: string;
  range: any;
  depth: { min: number; max: number; unit: string };
  zone: string;
  notes: string;
}

export interface TacticData {
  parameter: string;
  range: any;
  retrieve_speed: string;
  notes: string;
}

export interface RegulationData {
  closed_season: Array<{ start: string; end: string; area: string }>;
  notes: string;
}

/**
 * Load and process fish behavior data
 */
export async function loadFishBehaviorData(): Promise<Record<string, FishBehaviorData>> {
  try {
    const response = await fetch('/data/fish_behavior.json');
    const data = await response.json();
    
    // Convert species array to lookup object by svenskt_namn
    const fishLookup: Record<string, FishBehaviorData> = {};
    
    if (data.species && Array.isArray(data.species)) {
      data.species.forEach((species: FishBehaviorData) => {
        fishLookup[species.svenskt_namn] = species;
      });
    }
    
    return fishLookup;
  } catch (error) {
    console.error('Error loading fish behavior data:', error);
    return {};
  }
}

/**
 * Process activity data for visualization
 */
export function processActivityData(fishData: FishBehaviorData) {
  const processedData = {
    temperature: null as any,
    timeOfDay: [] as any[],
    weather: [] as any[],
    moonPhase: [] as any[],
    pressure: null as any,
    salinity: null as any
  };

  fishData.activity?.forEach(activity => {
    switch (activity.parameter) {
      case 'water_temperature':
        if (activity.range.type === 'numeric') {
          processedData.temperature = {
            min: activity.range.min,
            max: activity.range.max,
            unit: activity.range.unit,
            optimal: Math.round((activity.range.min + activity.range.max) / 2),
            activityIndex: activity.activity_index,
            notes: activity.notes
          };
        }
        break;
        
      case 'time_of_day':
        if (activity.range.type === 'categorical') {
          activity.range.values.forEach((time: string) => {
            processedData.timeOfDay.push({
              time,
              activityLevel: activity.activity_index.high,
              notes: activity.notes
            });
          });
        }
        break;
        
      case 'weather':
        if (activity.range.type === 'categorical') {
          activity.range.values.forEach((weather: string) => {
            processedData.weather.push({
              condition: weather,
              activityLevel: activity.activity_index.high,
              notes: activity.notes
            });
          });
        }
        break;
        
      case 'moon_phase':
        if (activity.range.type === 'categorical') {
          activity.range.values.forEach((phase: string) => {
            processedData.moonPhase.push({
              phase,
              activityLevel: activity.activity_index.high,
              notes: activity.notes
            });
          });
        }
        break;
        
      case 'salinity':
        if (activity.range.type === 'numeric') {
          processedData.salinity = {
            min: activity.range.min,
            max: activity.range.max,
            unit: activity.range.unit,
            activityIndex: activity.activity_index,
            notes: activity.notes
          };
        }
        break;
    }
  });

  return processedData;
}

/**
 * Process diet preferences for pie chart visualization
 */
export function processDietData(fishData: FishBehaviorData) {
  const dietScenarios: Array<{
    scenario: string;
    condition: string;
    dietData: Array<{ name: string; value: number }>;
    notes: string;
  }> = [];

  fishData.diet_preferences?.forEach(diet => {
    let scenarioName = '';
    let conditionDesc = '';

    // Create scenario description
    if (diet.parameter === 'water_temperature') {
      const range = diet.range;
      scenarioName = `${range.min}-${range.max}${range.unit}`;
      conditionDesc = range.min < 12 ? 'Kallt vatten' : 'Varmt vatten';
    } else if (diet.parameter === 'time_of_day') {
      scenarioName = diet.range.values?.[0] || diet.parameter;
      conditionDesc = scenarioName === 'day' ? 'Dagtid' : 'Nattetid';
    } else {
      scenarioName = diet.parameter;
      conditionDesc = scenarioName;
    }

    // Convert diet object to chart data
    const dietChartData = Object.entries(diet.diet).map(([key, value]) => ({
      name: translateDietItem(key),
      value: Math.round(value * 100) // Convert to percentage
    }));

    dietScenarios.push({
      scenario: scenarioName,
      condition: conditionDesc,
      dietData: dietChartData,
      notes: diet.notes
    });
  });

  return dietScenarios;
}

/**
 * Process spatial distribution data
 */
export function processSpatialData(fishData: FishBehaviorData) {
  const spatialData: Array<{
    scenario: string;
    depth: { min: number; max: number; unit: string };
    zone: string;
    notes: string;
  }> = [];

  fishData.spatial_distribution?.forEach(spatial => {
    let scenarioName = '';
    
    if (spatial.parameter === 'season') {
      const seasons = Array.isArray(spatial.range) ? spatial.range : [spatial.range];
      scenarioName = seasons.map(translateSeason).join('/');
    } else if (spatial.parameter === 'time_of_day') {
      const times = Array.isArray(spatial.range) ? spatial.range : [spatial.range];
      scenarioName = times.map(translateTimeOfDay).join('/');
    } else {
      scenarioName = spatial.parameter;
    }

    spatialData.push({
      scenario: scenarioName,
      depth: spatial.depth,
      zone: translateZone(spatial.zone),
      notes: spatial.notes
    });
  });

  return spatialData;
}

/**
 * Translation helpers
 */
function translateDietItem(item: string): string {
  const translations: Record<string, string> = {
    'plankton': 'Plankton',
    'insects': 'Insekter',
    'small_fish': 'Småfisk',
    'fish': 'Fisk',
    'crustaceans': 'Kräftdjur',
    'mollusks': 'Mollusker',
    'molluscs': 'Mollusker',
    'worms': 'Maskar',
    'benthic_invertebrates': 'Bottendjur',
    'amphibians': 'Grodor',
    'surface_insects': 'Ytinsekter',
    'nymphs': 'Nymfer',
    'larvae': 'Larver',
    'echinoderms': 'Pigghudingar',
    'cephalopods': 'Bläckfiskar',
    'zooplankton': 'Djurplankton',
    'plants': 'Växter',
    'plant_material': 'Växtmaterial',
    'detritus': 'Detritus',
    'fish_roe': 'Fiskrom',
    'birds': 'Småfåglar',
    'none': 'Ingen föda'
  };
  
  return translations[item] || item;
}

function translateSeason(season: string): string {
  const translations: Record<string, string> = {
    'spring': 'Vår',
    'summer': 'Sommar',
    'autumn': 'Höst',
    'winter': 'Vinter'
  };
  
  return translations[season] || season;
}

function translateTimeOfDay(time: string): string {
  const translations: Record<string, string> = {
    'dawn': 'Gryning',
    'day': 'Dag',
    'dusk': 'Skymning',
    'night': 'Natt'
  };
  
  return translations[time] || time;
}

function translateZone(zone: string): string {
  const translations: Record<string, string> = {
    'inshore': 'Kustnära',
    'offshore': 'Utomskärs'
  };
  
  return translations[zone] || zone;
}

/**
 * Get activity level color
 */
export function getActivityColor(level: number): string {
  if (level >= 0.8) return '#10b981'; // Green for high activity
  if (level >= 0.6) return '#f59e0b'; // Amber for medium activity
  if (level >= 0.3) return '#ef4444'; // Red for low activity
  return '#6b7280'; // Gray for very low activity
}

/**
 * Get method timing icons
 */
export function getMethodTimingIcon(timing: string[]): string {
  if (!timing) return '🎣';
  if (timing.includes('dawn') || timing.includes('dusk')) return '🌅';
  if (timing.includes('night')) return '🌙';
  if (timing.includes('day')) return '☀️';
  return '🎣';
} 