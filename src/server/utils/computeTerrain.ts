import { TerrainSummary } from '../routing/demSampler';

export type GradeBins = { '0_4': number; '4_10': number; '10_20': number; '20_35': number; '>35': number };

export function computeGradeBins(profile: TerrainSummary['profile']): GradeBins {
  const total = profile.length > 0 ? profile[profile.length - 1].d : 1;
  const bins: GradeBins = { '0_4': 0, '4_10': 0, '10_20': 0, '20_35': 0, '>35': 0 };
  for (let i = 1; i < profile.length; i++) {
    const segLen = profile[i].d - profile[i - 1].d;
    const g = Math.abs(profile[i].g);
    if (g < 4) bins['0_4'] += segLen; else if (g < 10) bins['4_10'] += segLen; else if (g < 20) bins['10_20'] += segLen; else if (g < 35) bins['20_35'] += segLen; else bins['>35'] += segLen;
  }
  return {
    '0_4': bins['0_4'] / total,
    '4_10': bins['4_10'] / total,
    '10_20': bins['10_20'] / total,
    '20_35': bins['20_35'] / total,
    '>35': bins['>35'] / total,
  };
}

export function computeRobustMax(profile: TerrainSummary['profile']): number {
  // robust maximal slope over windows of at least 30m
  let max = 0;
  for (let i = 1; i < profile.length; i++) {
    const windowStartD = profile[i].d - 30;
    let j = i;
    while (j > 0 && profile[j - 1].d > windowStartD) j--;
    let dz = profile[i].z - profile[j].z;
    const dx = profile[i].d - profile[j].d;
    if (dx > 0) {
      const g = Math.abs((dz / dx) * 100);
      if (g > max) max = g;
    }
  }
  return max;
}


