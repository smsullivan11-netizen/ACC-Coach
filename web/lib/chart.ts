// Chart helpers shared by server pages and client charts (components/TrendChart.tsx).

/** A 0-100 chart range around the values: from 5 under the lowest to 5 over the highest (multiples
 *  of 5), at least 20 wide, so small changes stay visible. */
export function ratingDomain(vs: (number | null)[]): [number, number] {
  const xs = vs.filter((v): v is number => v != null);
  if (!xs.length) return [0, 100];
  let lo = Math.max(0, Math.floor((Math.min(...xs) - 5) / 5) * 5), hi = Math.min(100, Math.ceil((Math.max(...xs) + 5) / 5) * 5);
  while (hi - lo < 20) {
    if (lo > 0) lo -= 5;
    if (hi - lo < 20 && hi < 100) hi += 5;
  }
  return [lo, hi];
}
