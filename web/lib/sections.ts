// Sections: corners driven as one (user's request, Misano T1–T2). With no real straight between two
// corners, the line through the first one sets up the second: drivers often give up time in the
// first to be faster through the second, so the coach judges such corners together instead of
// one by one. Two corners are linked when, on a lap:
//  - the next one is taken flat out (no lift): its time is the previous corner's exit carried on;
//  - the driver is not back on full throttle before the next corner;
//  - or less than LINK_S passes from full throttle to the next corner's lift (Hungaroring T8–T9:
//    1.5-1.8 s; corners with a straight between them: 2.4 s and more).
// Pure functions, no imports.

export const LINK_S = 2;
export const MAX_SECTION = 4;   // corners: longer chains (Nordschleife) are cut where the gap is widest

/** One lap: elapsed time on its 1 m grid, and its corner results (distances in the lap's metres). */
export type SectionLap = {
  time: ArrayLike<number>;
  corners: { corner_number: number; lift_point_m: number | null; full_throttle_m: number | null; apex_m: number | null }[];
};

function timeAt(time: ArrayLike<number>, d: number) {
  const p = Math.min(Math.max(d, 0), time.length - 1), i = Math.min(Math.floor(p), time.length - 2);
  return time[i] + (time[i + 1] - time[i]) * (p - i);
}

/** The corners (numbers, in lap order) grouped into sections: two corners are linked when they are
 *  on any of the laps given (a lap and its reference). The last corner is never linked to the first. */
export function sectionsOf(numbers: number[], laps: SectionLap[]): number[][] {
  const gaps: number[] = [], linked: boolean[] = [];
  for (let i = 0; i + 1 < numbers.length; i++) {
    let gap = Infinity, link = false;
    for (const lap of laps) {
      const a = lap.corners.find((c) => c.corner_number === numbers[i]);
      const b = lap.corners.find((c) => c.corner_number === numbers[i + 1]);
      if (!a || !b) continue;
      const from = a.full_throttle_m ?? a.apex_m, to = b.lift_point_m ?? b.apex_m;
      const g = from != null && to != null ? timeAt(lap.time, to) - timeAt(lap.time, from) : Infinity;
      gap = Math.min(gap, g);
      if (b.lift_point_m == null || (a.lift_point_m != null && a.full_throttle_m == null) || g < LINK_S) link = true;
    }
    gaps.push(gap);
    linked.push(link);
  }
  const groups: number[][] = [];
  let current: number[] = [];
  numbers.forEach((n, i) => {
    current.push(n);
    if (i === numbers.length - 1 || !linked[i]) {
      groups.push(current);
      current = [];
    }
  });
  const cut = (g: number[]): number[][] => {
    if (g.length <= MAX_SECTION) return [g];
    const first = numbers.indexOf(g[0]);
    let at = 0;
    for (let j = 1; j < g.length - 1; j++) if (gaps[first + j] > gaps[first + at]) at = j;
    return [...cut(g.slice(0, at + 1)), ...cut(g.slice(at + 1))];
  };
  return groups.flatMap(cut);
}

/** "T4", or "T8–T10" for a section of several corners. */
export const sectionLabel = (first: number, last: number) => (first === last ? `T${first}` : `T${first}–T${last}`);
