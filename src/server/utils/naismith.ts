export function naismithSeconds(distance_m: number, ascent_m: number): number {
  // t = (dist_km/5 + ascent_m/600) * 3600
  const dist_km = distance_m / 1000;
  return (dist_km / 5 + ascent_m / 600) * 3600;
}


