// Fuel weight correction for the rating (user's request, 2026-10-06): a lap driven with a lot of fuel
// is slower, so the rating removes what the fuel above a minimum-fuel load cost. The minimum (the
// reference) is what a hotlap or short qualifying run carries: 8 L on tracks under 5 km, 10 L on
// longer ones, 15 L on the Nordschleife (user's values). A lap at or below it is not corrected (no
// bonus for running lighter). The lap's fuel (litres, average over the lap) comes from the app
// (0.1.6+, in lap.metrics.fuel_l); older laps are not corrected. Leaderboards and records keep the
// real times. Safe on server and client.

export const FUEL_KG_PER_L = 0.72;   // ACC

// Minimum-fuel reference per track (litres)
const REF_L: Record<string, number> = {
  brands_hatch: 8, zolder: 8, misano: 8, donington: 8, oulton_park: 8, laguna_seca: 8, zandvoort: 8, red_bull_ring: 8,
  hungaroring: 8, valencia: 8, kyalami: 8, imola: 8, barcelona: 8, indianapolis: 8, snetterton: 8,
  spa: 10, monza: 10, silverstone: 10, suzuka: 10, cota: 10, paul_ricard: 10, mount_panorama: 10, nurburgring: 10,
  watkins_glen: 10, nurburgring_24h: 15,
};
const DEFAULT_REF_L = 10;
export const fuelReference = (trackKey: string) => REF_L[trackKey.toLowerCase()] ?? DEFAULT_REF_L;

// Seconds lost per lap for 10 kg, measured in ACC by OhneSpeed (shared by the user)
const S_PER_10KG: Record<string, number> = {
  imola: 0.175, monza: 0.15, brands_hatch: 0.125, barcelona: 0.15, paul_ricard: 0.175, spa: 0.2, cota: 0.2,
  donington: 0.125, hungaroring: 0.175, indianapolis: 0.175, kyalami: 0.16, laguna_seca: 0.125, misano: 0.15,
  mount_panorama: 0.18, nurburgring_24h: 0.78, nurburgring: 0.15, red_bull_ring: 0.15, oulton_park: 0.15,
  valencia: 0.175, silverstone: 0.2, snetterton: 0.175, suzuka: 0.18, watkins_glen: 0.175, zandvoort: 0.15, zolder: 0.15,
};
const DEFAULT_S_PER_10KG = 0.16;     // tracks not measured

/** Seconds the fuel above the track's minimum-fuel reference cost on a lap (0 at or below it). */
export function fuelSeconds(trackKey: string, fuelL: number | null | undefined) {
  if (fuelL == null || !Number.isFinite(fuelL)) return 0;
  const perKg = (S_PER_10KG[trackKey.toLowerCase()] ?? DEFAULT_S_PER_10KG) / 10;
  return perKg * FUEL_KG_PER_L * Math.max(0, fuelL - fuelReference(trackKey));
}
