// Tobler hiking function: W = 6 * e^(-3.5 * |grade + 0.05|)
// Clamp 0.6–6 km/h

export function toblerSeconds(distance_m: number, profile: Array<{ d: number; g: number }>): number {
  if (!profile || profile.length < 2) return (distance_m / (5 * 1000)) * 3600; // fallback 5 km/h
  let time_s = 0;
  for (let i = 1; i < profile.length; i++) {
    const segLen = profile[i].d - profile[i - 1].d;
    const grade = profile[i].g / 100;
    const speedKmh = clamp(6 * Math.exp(-3.5 * Math.abs(grade + 0.05)), 0.6, 6.0);
    const speedMps = (speedKmh * 1000) / 3600;
    const segTime = segLen / Math.max(speedMps, 0.01);
    time_s += segTime;
  }
  return time_s;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}


