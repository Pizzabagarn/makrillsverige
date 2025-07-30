/**
 * Advanced Dynamic Behavior Calculations for Fish Species
 * Based on comprehensive scientific research and technical reports
 * Implements size-specific behavior modeling and environmental parameter integration
 */

import { FishBehaviorData } from './fishBehaviorData';

export interface ParameterState {
  water_temperature: number;
  salinity: number;
  current_speed: number;
  air_pressure_change: number;
  time_of_day: string;
  season: string;
  weather: string;
  moon_phase: string;
  oxygen_level: number;
  wind_speed: number;
}

export interface ActivityBreakdown {
  [key: string]: {
    value: number;
    optimal: boolean;
    notes: string;
  };
}

export interface SpatialBehavior {
  preferred_depth: {
    optimal: number;
    min: number;
    max: number;
  };
  horizontal_movement: number;
  vertical_movement: number;
  aggregation_tendency: number;
  territory_size: number;
  habitat_description: string;
}

export interface PhysiologicalState {
  metabolism_rate: number;
  stress_level: number;
  energy_expenditure: number;
  immune_function: number;
}

export interface FishingRecommendation {
  method: string;
  effectiveness: number;
  optimal_timing: string;
  technique_notes: string;
  bait_recommendations: string[];
  confidence: number;
}

export interface CalculatedBehavior {
  overallActivity: number;
  activityBreakdown: ActivityBreakdown;
  dietComposition: { [key: string]: number };
  spatialBehavior: SpatialBehavior;
  physiologicalState: PhysiologicalState;
  fishingRecommendations: FishingRecommendation[];
}

// Hjälpfunktioner för parametereffekter
class ParameterEffects {
  
  // Vattentemperatur - kritisk för abborrens aktivitet
  static temperatureResponse(temp: number, sizeClass: string): { value: number; optimal: boolean; notes: string } {
    let optimal_min: number, optimal_max: number, critical_min: number, critical_max: number;
    
    switch (sizeClass) {
      case 'small':
        optimal_min = 18; optimal_max = 25;
        critical_min = 5; critical_max = 30;
        break;
      case 'large':
        optimal_min = 15; optimal_max = 20;
        critical_min = 3; critical_max = 27;
        break;
      default: // medium
        optimal_min = 15; optimal_max = 25;
        critical_min = 4; critical_max = 28;
    }
    
    // Utanför kritiska gränser = nästan ingen aktivitet
    if (temp < critical_min || temp > critical_max) {
      return {
        value: 0.05,
        optimal: false,
        notes: temp < critical_min ? 'Extremt kallt - abborre nästan inaktiv' : 'Extremt varmt - abborre stressad och undviker området'
      };
    }
    
    // Inom optimala gränser
    if (temp >= optimal_min && temp <= optimal_max) {
      return {
        value: 1.0,
        optimal: true,
        notes: 'Optimal temperatur för aktiv jakt'
      };
    }
    
    // Gradvis försämring utanför optimal zon
    let value: number;
    let notes: string;
    
    if (temp < optimal_min) {
      value = 0.2 + 0.8 * Math.max(0, (temp - critical_min) / (optimal_min - critical_min));
      notes = temp < 10 ? 'Kallt vatten - abborre seg och står djupt' : 'Något kallt - begränsad aktivitet';
    } else {
      value = 0.2 + 0.8 * Math.max(0, (critical_max - temp) / (critical_max - optimal_max));
      notes = temp > 25 ? 'Varmt vatten - abborre söker djupare, svalare zoner' : 'Något varmt - aktivitet på morgon/kväll';
    }
    
    return { value, optimal: false, notes };
  }
  
  // Syrehalt - kritisk för överlevnad
  static oxygenResponse(oxygen: number): { value: number; optimal: boolean; notes: string } {
    if (oxygen < 3) {
      return {
        value: 0.01,
        optimal: false,
        notes: 'Kritisk syrebrist - abborre flyr området'
      };
    }
    
    if (oxygen < 5) {
      return {
        value: 0.1 + 0.4 * ((oxygen - 3) / 2),
        optimal: false,
        notes: 'Låg syrehalt - abborre apatisk och mindre aktiv'
      };
    }
    
    if (oxygen >= 7) {
      return {
        value: 1.0,
        optimal: true,
        notes: 'Utmärkt syrenivå för hög aktivitet'
      };
    }
    
    return {
      value: 0.5 + 0.5 * ((oxygen - 5) / 2),
      optimal: false,
      notes: 'Acceptabel syrehalt men kan begränsa jaktaktivitet'
    };
  }
  
  // Salthalt - toleransgräns är kritisk
  static salinityResponse(salinity: number, sizeClass: string): { value: number; optimal: boolean; notes: string } {
    // Små abborrar tål minst salt
    const tolerance = sizeClass === 'small' ? 6 : sizeClass === 'large' ? 15 : 10;
    
    if (salinity > tolerance) {
      return {
        value: Math.max(0.01, 0.5 * Math.exp(-0.3 * (salinity - tolerance))),
        optimal: false,
        notes: `Över salttolerans (${tolerance}‰) - få eller inga abborrar`
      };
    }
    
    if (salinity <= 5) {
      return {
        value: 1.0,
        optimal: true,
        notes: 'Optimal salthalt för abborre'
      };
    }
    
    return {
      value: 1.0 - 0.3 * ((salinity - 5) / (tolerance - 5)),
      optimal: false,
      notes: 'Måttlig salthalt - abborre använder energi för saltbalans'
    };
  }
  
  // Lufttryck - abborre mycket känslig
  static pressureResponse(pressureChange: number): { value: number; optimal: boolean; notes: string } {
    if (pressureChange < -5) {
      return {
        value: 0.1,
        optimal: false,
        notes: 'Kraftigt fallande lufttryck - abborre "låser sig" nära botten'
      };
    }
    
    if (pressureChange < -2) {
      return {
        value: 0.3,
        optimal: false,
        notes: 'Fallande lufttryck - abborre blir passiv och svårflörtad'
      };
    }
    
    if (pressureChange > 2) {
      return {
        value: 1.0,
        optimal: true,
        notes: 'Stigande lufttryck - abborre aktiv och sprider ut sig'
      };
    }
    
    return {
      value: 0.8,
      optimal: pressureChange >= 0,
      notes: pressureChange >= 0 ? 'Stabilt lufttryck - normala förhållanden' : 'Lätt fallande tryck - något minskad aktivitet'
    };
  }
  
  // Tid på dagen - abborrens dygnsrytm
  static timeOfDayResponse(timeOfDay: string, season: string): { value: number; optimal: boolean; notes: string } {
    const responses = {
      dawn: { value: 1.0, optimal: true, notes: 'Gryning - abborrens bästa jaktperiod' },
      dusk: { value: 1.0, optimal: true, notes: 'Skymning - intensiv jaktaktivitet' },
      day: { 
        value: season === 'summer' ? 0.4 : 0.7, 
        optimal: season !== 'summer', 
        notes: season === 'summer' ? 'Solig dag - abborre står djupare och är mindre aktiv' : 'Dagtid - måttlig aktivitet'
      },
      night: { value: 0.05, optimal: false, notes: 'Natt - abborre nästan helt inaktiv (dåligt mörkerseende)' }
    };
    
    return responses[timeOfDay as keyof typeof responses] || responses.day;
  }
  
  // Årstid - påverkar basaktivitet
  static seasonResponse(season: string): { value: number; optimal: boolean; notes: string } {
    const responses = {
      spring: { value: 0.9, optimal: true, notes: 'Vår - aktiv efter lek, behöver äta upp sig' },
      summer: { value: 0.7, optimal: false, notes: 'Sommar - aktivitet främst morgon/kväll' },
      autumn: { value: 1.0, optimal: true, notes: 'Höst - bästa tiden, äter upp sig inför vintern' },
      winter: { value: 0.3, optimal: false, notes: 'Vinter - trög men fångbar med pimpel i djuphålor' }
    };
    
    return responses[season as keyof typeof responses] || responses.summer;
  }
  
  // Väder
  static weatherResponse(weather: string): { value: number; optimal: boolean; notes: string } {
    const responses = {
      clear: { value: 0.8, optimal: true, notes: 'Klart väder - bra fiske men abborre kan vara skygg på dagen' },
      overcast: { value: 1.0, optimal: true, notes: 'Mulet - utmärkt för abborre, mindre skygg' },
      light_rain: { value: 0.9, optimal: true, notes: 'Lätt regn - syresätter vattnet, ofta bra fiske' },
      rain: { value: 0.6, optimal: false, notes: 'Regn - abborre söker skydd, fiska djupare' },
      storm: { value: 0.2, optimal: false, notes: 'Storm - abborre inaktiv, vänta på lugnare väder' }
    };
    
    return responses[weather as keyof typeof responses] || responses.clear;
  }
  
  // Strömhastighet - abborre tål inte stark ström
  static currentResponse(currentSpeed: number): { value: number; optimal: boolean; notes: string } {
    if (currentSpeed > 0.5) {
      return {
        value: 0.1,
        optimal: false,
        notes: 'För stark ström - abborre endast i bakvatten om alls'
      };
    }
    
    if (currentSpeed > 0.3) {
      return {
        value: 0.4,
        optimal: false,
        notes: 'Måttlig ström - abborre söker lugnvatten bakom hinder'
      };
    }
    
    return {
      value: 1.0,
      optimal: true,
      notes: 'Lätt eller ingen ström - optimala förhållanden'
    };
  }

  // Vindhastighet - påverkar abborrens beteende
  static windResponse(windSpeed: number): { value: number; optimal: boolean; notes: string } {
    if (windSpeed > 10) {
      return {
        value: 0.3,
        optimal: false,
        notes: 'Kraftig vind - abborre söker lä i skyddade områden'
      };
    }
    
    if (windSpeed > 6) {
      return {
        value: 0.7,
        optimal: false,
        notes: 'Måttlig vind - abborre kan söka vindskydd'
      };
    }
    
    if (windSpeed > 2) {
      return {
        value: 1.0,
        optimal: true,
        notes: 'Lätt vind - syresätter vattnet och koncentrerar byten'
      };
    }
    
    return {
      value: 0.8,
      optimal: true,
      notes: 'Lugnt väder - abborre kan vara mer skygg i klart vatten'
    };
  }

  // Månfas - subtil påverkan på abborrens aktivitet
  static moonPhaseResponse(moonPhase: string): { value: number; optimal: boolean; notes: string } {
    const responses = {
      new_moon: { value: 0.9, optimal: false, notes: 'Nymåne - mörka nätter ger hungrigare abborre på dagen' },
      waxing_crescent: { value: 0.95, optimal: true, notes: 'Tilltagande skära - gynnsamt för abborrfiske' },
      first_quarter: { value: 1.0, optimal: true, notes: 'Första kvarteret - balanserat ljus, bra aktivitet' },
      waxing_gibbous: { value: 1.0, optimal: true, notes: 'Tilltagande måne - topp före fullmåne' },
      full_moon: { value: 0.85, optimal: false, notes: 'Fullmåne - abborre kan ha jagat mer på natten, något trögare' },
      waning_gibbous: { value: 0.9, optimal: false, notes: 'Avtagande måne - återgår till normal aktivitet' },
      last_quarter: { value: 0.95, optimal: true, notes: 'Sista kvarteret - stabila förhållanden' },
      waning_crescent: { value: 0.9, optimal: false, notes: 'Avtagande skära - förbereder för nymåne' }
    };
    
    return responses[moonPhase as keyof typeof responses] || responses.new_moon;
  }
}

// Huvudfunktion för att beräkna abborrens beteende
export async function calculateComprehensiveBehavior(
  fishData: FishBehaviorData,
  parameters: ParameterState,
  sizeClass: 'small' | 'medium' | 'large'
): Promise<CalculatedBehavior> {
  
  // Beräkna aktivitet för varje parameter
  const activityBreakdown: ActivityBreakdown = {};
  
  // Vattentemperatur (högst vikt)
  const tempResponse = ParameterEffects.temperatureResponse(parameters.water_temperature, sizeClass);
  activityBreakdown.water_temperature = {
    value: tempResponse.value,
    optimal: tempResponse.optimal,
    notes: tempResponse.notes
  };
  
  // Syrehalt (kritisk)
  const oxygenResponse = ParameterEffects.oxygenResponse(parameters.oxygen_level);
  activityBreakdown.oxygen_level = {
    value: oxygenResponse.value,
    optimal: oxygenResponse.optimal,
    notes: oxygenResponse.notes
  };
  
  // Salthalt (toleransgräns)
  const salinityResponse = ParameterEffects.salinityResponse(parameters.salinity, sizeClass);
  activityBreakdown.salinity = {
    value: salinityResponse.value,
    optimal: salinityResponse.optimal,
    notes: salinityResponse.notes
  };
  
  // Lufttryck (mycket viktigt för abborre)
  const pressureResponse = ParameterEffects.pressureResponse(parameters.air_pressure_change);
  activityBreakdown.air_pressure_change = {
    value: pressureResponse.value,
    optimal: pressureResponse.optimal,
    notes: pressureResponse.notes
  };
  
  // Tid på dagen
  const timeResponse = ParameterEffects.timeOfDayResponse(parameters.time_of_day, parameters.season);
  activityBreakdown.time_of_day = {
    value: timeResponse.value,
    optimal: timeResponse.optimal,
    notes: timeResponse.notes
  };
  
  // Årstid
  const seasonResponse = ParameterEffects.seasonResponse(parameters.season);
  activityBreakdown.season = {
    value: seasonResponse.value,
    optimal: seasonResponse.optimal,
    notes: seasonResponse.notes
  };
  
  // Väder
  const weatherResponse = ParameterEffects.weatherResponse(parameters.weather);
  activityBreakdown.weather = {
    value: weatherResponse.value,
    optimal: weatherResponse.optimal,
    notes: weatherResponse.notes
  };
  
  // Strömhastighet
  const currentResponse = ParameterEffects.currentResponse(parameters.current_speed);
  activityBreakdown.current_speed = {
    value: currentResponse.value,
    optimal: currentResponse.optimal,
    notes: currentResponse.notes
  };

  // Vindhastighet
  const windResponse = ParameterEffects.windResponse(parameters.wind_speed);
  activityBreakdown.wind_speed = {
    value: windResponse.value,
    optimal: windResponse.optimal,
    notes: windResponse.notes
  };

  // Månfas
  const moonResponse = ParameterEffects.moonPhaseResponse(parameters.moon_phase);
  activityBreakdown.moon_phase = {
    value: moonResponse.value,
    optimal: moonResponse.optimal,
    notes: moonResponse.notes
  };
  
  // Beräkna total aktivitet (kritiska faktorer kan stoppa all aktivitet)
  const criticalFactors = [
    activityBreakdown.water_temperature.value,
    activityBreakdown.oxygen_level.value,
    activityBreakdown.salinity.value
  ];
  
  // Om någon kritisk faktor är under 0.2, begränsa total aktivitet kraftigt
  const minCritical = Math.min(...criticalFactors);
  let baseActivity = minCritical;
  
  // Tid på dagen är också en kritisk begränsande faktor för abborre
  // Om det är natt (< 0.1) eller mycket låg aktivitet, begränsa starkt
  const timeActivity = activityBreakdown.time_of_day.value;
  if (timeActivity < 0.1) {
    // Natt eller extremt låg tid-aktivitet dominerar
    baseActivity = Math.min(baseActivity, timeActivity * 2); // Max 20% även om andra faktorer är bra
  }
  
  // Modifiera med andra faktorer (exklusive tid som redan hanteras ovan)
  const modifyingFactors = [
    activityBreakdown.air_pressure_change.value,
    activityBreakdown.season.value,
    activityBreakdown.weather.value,
    activityBreakdown.current_speed.value,
    activityBreakdown.wind_speed.value,
    activityBreakdown.moon_phase.value
  ];
  
  // För extremt låg tid (natt), använd tid direkt som basnivå
  let overallActivity: number;
  if (timeActivity < 0.1) {
    const nightModifier = modifyingFactors.reduce((a, b) => a + b, 0) / modifyingFactors.length;
    overallActivity = Math.min(0.15, timeActivity * (1 + nightModifier * 0.5)); // Max 15% på natten
  } else {
    // Normal beräkning för dag/gryning/skymning
    const avgModifying = [...modifyingFactors, timeActivity].reduce((a, b) => a + b, 0) / (modifyingFactors.length + 1);
    overallActivity = Math.min(1.0, baseActivity * (0.5 + 0.5 * avgModifying));
  }
  
  // Spatial beteende baserat på storlek och förhållanden
  const spatialBehavior: SpatialBehavior = {
    preferred_depth: getSizeSpecificDepth(sizeClass, parameters),
    horizontal_movement: overallActivity * 0.8,
    vertical_movement: parameters.time_of_day === 'dawn' || parameters.time_of_day === 'dusk' ? 0.9 : 0.4,
    aggregation_tendency: sizeClass === 'small' ? 0.9 : sizeClass === 'medium' ? 0.7 : 0.3,
    territory_size: sizeClass === 'large' ? 150 : sizeClass === 'medium' ? 75 : 30,
    habitat_description: getHabitatDescription(sizeClass, parameters)
  };
  
  // Fysiologiskt tillstånd
  const physiologicalState: PhysiologicalState = {
    metabolism_rate: Math.min(1.0, (parameters.water_temperature / 20) * (parameters.oxygen_level / 8)),
    stress_level: 1 - Math.min(oxygenResponse.value, salinityResponse.value, tempResponse.value),
    energy_expenditure: parameters.current_speed > 0.3 ? 0.8 : 0.4,
    immune_function: Math.max(0.3, 1 - (Math.abs(parameters.water_temperature - 18) / 15))
  };
  
  // Diet baserat på storlek
  const dietComposition = getDietComposition(sizeClass, parameters);
  
  // Fiskerekommendationer (UTAN levande agn)
  const fishingRecommendations = getFishingRecommendations(overallActivity, sizeClass, parameters);
  
  return {
    overallActivity,
    activityBreakdown,
    dietComposition,
    spatialBehavior,
    physiologicalState,
    fishingRecommendations
  };
}

function getSizeSpecificDepth(sizeClass: string, parameters: ParameterState) {
  const baseDepths = {
    small: { optimal: 2, min: 0.5, max: 4 },
    medium: { optimal: 4, min: 1, max: 8 },
    large: { optimal: 8, min: 3, max: 15 }
  };
  
  const base = baseDepths[sizeClass as keyof typeof baseDepths] || baseDepths.medium;
  
  // Justera för temperatur - varmt vatten = djupare
  if (parameters.water_temperature > 22) {
    return {
      optimal: base.optimal + 2,
      min: base.min + 1,
      max: base.max + 3
    };
  }
  
  return base;
}

function getHabitatDescription(sizeClass: string, parameters: ParameterState): string {
  const temp = parameters.water_temperature;
  
  if (sizeClass === 'small') {
    return temp > 20 ? 'Grunt vatten nära växtlighet och skydd' : 'Skyddade vikar med måttligt djup';
  } else if (sizeClass === 'large') {
    return temp > 22 ? 'Djupa områden nära strukturer' : 'Varierar mellan grund och djupt beroende på byten';
  } else {
    return 'Mellandjup längs kanter och strukturer';
  }
}

function getDietComposition(sizeClass: string, parameters: ParameterState): { [key: string]: number } {
  const season = parameters.season;
  const temperature = parameters.water_temperature;
  const timeOfDay = parameters.time_of_day;
  
  // Alla storleksklasser har samma keys för konsekvens
  const baseDiet = {
    plankton: 0,
    insects: 0,
    larvae: 0,
    small_crustaceans: 0,
    small_fish: 0,
    crustaceans: 0,
    other_fish: 0,
    bottom_fauna: 0
  };
  
  if (sizeClass === 'small') {
    // Små abborrar (<15 cm): huvudsakligen plankton, små kräftdjur, insektslarver
    let diet = {
      ...baseDiet,
      plankton: 0.4,
      small_crustaceans: 0.3,
      larvae: 0.2,
      insects: 0.1
    };
    
    // Säsongsanpassning
    if (season === 'summer') {
      diet.insects = 0.2; // Mer insekter på sommaren
      diet.plankton = 0.5; // Planktonblomning
      diet.larvae = 0.2;
      diet.small_crustaceans = 0.1;
    } else if (season === 'spring') {
      diet.larvae = 0.4; // Massor av larver på våren
      diet.plankton = 0.3;
      diet.small_crustaceans = 0.2;
      diet.insects = 0.1;
    }
    
    return diet;
    
  } else if (sizeClass === 'large') {
    // Stora abborrar (>30 cm): främst fisk och kräftor - opportunistiska toppredatorer
    let diet = {
      ...baseDiet,
      small_fish: 0.5,
      other_fish: 0.2,
      crustaceans: 0.2,
      bottom_fauna: 0.1
    };
    
    // Säsongsanpassning
    if (season === 'autumn') {
      diet.crustaceans = 0.4; // Signalkräftor mycket aktiva på hösten
      diet.small_fish = 0.4;
      diet.other_fish = 0.1;
      diet.bottom_fauna = 0.1;
    } else if (season === 'spring') {
      diet.small_fish = 0.6; // Yngelfiske efter lek
      diet.other_fish = 0.2;
      diet.crustaceans = 0.1;
      diet.bottom_fauna = 0.1;
    } else if (season === 'winter') {
      diet.bottom_fauna = 0.3; // Mer bottenlevande föda under vintern
      diet.small_fish = 0.4;
      diet.crustaceans = 0.2;
      diet.other_fish = 0.1;
    }
    
    // Temperaturjustering
    if (temperature < 10) {
      // Kalla temperaturer = mindre aktivt fiske, mer opportunistiskt
      diet.bottom_fauna *= 1.5;
      diet.small_fish *= 0.8;
    }
    
    // Normalisera så värdena summerar till 1.0
    const total = Object.values(diet).reduce((sum, val) => sum + val, 0);
    if (total > 0) {
      Object.keys(diet).forEach(key => {
        diet[key as keyof typeof diet] = diet[key as keyof typeof diet] / total;
      });
    }
    
    return diet;
    
  } else {
    // Medelstora abborrar (15-30 cm): allätare/opportunister - blandning av allt
    let diet = {
      ...baseDiet,
      small_fish: 0.3,
      crustaceans: 0.2,
      insects: 0.2,
      bottom_fauna: 0.1,
      larvae: 0.1,
      small_crustaceans: 0.1
    };
    
    // Säsongsanpassning
    if (season === 'summer') {
      diet.insects = 0.3; // Frossande på insekter sommartid
      diet.small_fish = 0.3;
      diet.larvae = 0.2;
      diet.crustaceans = 0.1;
      diet.bottom_fauna = 0.1;
    } else if (season === 'autumn') {
      diet.small_fish = 0.4; // Årets yngel är lagom stora nu
      diet.crustaceans = 0.3; 
      diet.insects = 0.1;
      diet.bottom_fauna = 0.2;
    } else if (season === 'spring') {
      diet.larvae = 0.3; // Mycket larver på våren
      diet.small_fish = 0.3;
      diet.insects = 0.2;
      diet.crustaceans = 0.1;
      diet.bottom_fauna = 0.1;
    }
    
         // Tid på dagen påverkar vad de kan fånga
     if (timeOfDay === 'dawn' || timeOfDay === 'dusk') {
       diet.insects *= 1.3; // Mer insekter under gryning/skymning
       diet.small_fish *= 1.2; // Småfisk mer aktiv då
     } else if (timeOfDay === 'night') {
       diet.bottom_fauna *= 2; // Endast bottenföda på natten (kräftor etc)
       diet.small_fish *= 0.3;
       diet.insects = 0;
     }
     
     // Normalisera så värdena summerar till 1.0
     const total = Object.values(diet).reduce((sum, val) => sum + val, 0);
     if (total > 0) {
       Object.keys(diet).forEach(key => {
         diet[key as keyof typeof diet] = diet[key as keyof typeof diet] / total;
       });
     }
     
     return diet;
  }
}

function getFishingRecommendations(
  activity: number, 
  sizeClass: string, 
  parameters: ParameterState
): FishingRecommendation[] {
  const recommendations: FishingRecommendation[] = [];
  
  // Baseffektivitet från aktivitet
  const baseEffectiveness = Math.max(0.1, activity);
  
  // Spinnfiske - bäst när abborren är aktiv
  if (activity > 0.4) {
    recommendations.push({
      method: 'Spinnfiske',
      effectiveness: baseEffectiveness * 0.95,
      optimal_timing: parameters.time_of_day === 'dawn' || parameters.time_of_day === 'dusk' ? 
        'Perfekt timing - gryning/skymning' : 'Bäst på morgon eller kväll',
      technique_notes: parameters.water_temperature > 22 ? 
        'Fiska djupare med jigg när vattnet är varmt' : 'Spinnare nära ytan fungerar utmärkt',
      bait_recommendations: activity > 0.7 ? 
        ['Spinnare (storlek 2-4)', 'Jigg med mjukbete', 'Wobbler 5-7cm'] :
        ['Jigg nära botten', 'Dropshot-rigg', 'Små spinnare'],
      confidence: 0.9
    });
  }
  
  // Mete - bäst när abborre är passiv
  if (activity < 0.6 || parameters.air_pressure_change < -2) {
    recommendations.push({
      method: 'Mete (naturligt bete)',
      effectiveness: Math.max(0.3, baseEffectiveness * 1.2),
      optimal_timing: 'När abborre är svårflörtad - fungerar även mitt på dagen',
      technique_notes: 'Långsam presentation nära botten där abborre står och väntar',
      bait_recommendations: ['Daggmask', 'Färsk räka', 'Små fiskbitar (död fisk)', 'Mygglaver'],
      confidence: 0.8
    });
  }
  
  // Pimpelfiske - vinterfiske
  if (parameters.season === 'winter') {
    recommendations.push({
      method: 'Pimpelfiske (isfiske)',
      effectiveness: baseEffectiveness * 0.8,
      optimal_timing: 'Mitt på dagen när det är som ljusast',
      technique_notes: 'Hitta djuphålor där abborre samlas i stim under isen',
      bait_recommendations: ['Balanspiror', 'Mormyska med maggot', 'Små jiggpiror', 'Pirkar i koppar/orange'],
      confidence: 0.85
    });
  }
  
  // Finesse-tekniker för svåra förhållanden
  if (activity < 0.4) {
    recommendations.push({
      method: 'Finesse-fiske',
      effectiveness: baseEffectiveness * 1.1,
      optimal_timing: 'När andra metoder misslyckas',
      technique_notes: 'Mycket långsam presentation med små beten',
      bait_recommendations: ['Dropshot med mask', 'Ned Rig', 'Ultralätta jiggar', 'Carolina Rig'],
      confidence: 0.7
    });
  }
  
  // Topwater - när abborre jagar aktivt vid ytan
  if (activity > 0.7 && (parameters.time_of_day === 'dawn' || parameters.time_of_day === 'dusk') && parameters.season === 'summer') {
    recommendations.push({
      method: 'Ytbeten (topwater)',
      effectiveness: baseEffectiveness * 0.9,
      optimal_timing: 'Tidig morgon eller sen kväll när abborre jagar vid ytan',
      technique_notes: 'Kasta mot småfisk som sprätter - tecken på jagande abborre',
      bait_recommendations: ['Poppers', 'Stickbaits', 'Buzzbait', 'Ytgående wobblers'],
      confidence: 0.8
    });
  }
  
  return recommendations.sort((a, b) => b.effectiveness - a.effectiveness);
}

export function getActivityLevelColor(level: number): string {
  if (level >= 0.8) return 'text-green-400';
  if (level >= 0.6) return 'text-yellow-400';
  if (level >= 0.4) return 'text-orange-400';
  return 'text-red-400';
}

export function getSuitabilityColor(effectiveness: number): string {
  if (effectiveness >= 0.8) return 'text-green-400';
  if (effectiveness >= 0.6) return 'text-yellow-400';
  if (effectiveness >= 0.4) return 'text-orange-400';
  return 'text-red-400';
} 