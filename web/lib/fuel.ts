// Fuel weight correction for the rating (user's request, 2026-10-06): a lap driven with a lot of fuel
// is slower, so the rating corrects lap times to a reference load. The lap's fuel (litres, average
// over the lap) comes from the app (0.1.6+, in lap.metrics.fuel_l); older laps are not corrected.
// Leaderboards and records keep the real times. Safe on server and client.

export const FUEL_KG_PER_L = 0.72;   // ACC
export const FUEL_REF_L = 15;        // about qualifying fuel: a lap at 15 L is not corrected

// Seconds lost per lap for 10 kg, measured in ACC by OhneSpeed (shared by the user)
const S_PER_10KG: Record<string, number> = {
  imola: 0.175, monza: 0.15, brands_hatch: 0.125, barcelona: 0.15, paul_ricard: 0.175, spa: 0.2, cota: 0.2,
  donington: 0.125, hungaroring: 0.175, indianapolis: 0.175, kyalami: 0.16, laguna_seca: 0.125, misano: 0.15,
  mount_panorama: 0.18, nurburgring_24h: 0.78, nurburgring: 0.15, red_bull_ring: 0.15, oulton_park: 0.15,
  valencia: 0.175, silverstone: 0.2, snetterton: 0.175, suzuka: 0.18, watkins_glen: 0.175, zandvoort: 0.15, zolder: 0.15,
};
const DEFAULT_S_PER_10KG = 0.16;     // tracks not measured

/** Seconds the fuel load cost (positive) or gave (below the reference) on a lap of this track. */
export function fuelSeconds(trackKey: string, fuelL: number | null | undefined) {
  if (fuelL == null || !Number.isFinite(fuelL)) return 0;
  const perKg = (S_PER_10KG[trackKey.toLowerCase()] ?? DEFAULT_S_PER_10KG) / 10;
  return perKg * FUEL_KG_PER_L * (fuelL - FUEL_REF_L);
}
