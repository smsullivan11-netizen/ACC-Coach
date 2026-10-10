// Car finder (user's request, 2026-10-10): people say what they look for, the cars of a class are
// scored against it. Presets (session, track type or a track, experience) set an importance per
// sub-rating, which can then be fine-tuned by hand; the match is the importance-weighted average of
// the car's sub-ratings, blended with its default-BoP pace on the chosen track when one is picked.
// Safe on server and client.

import { CAR_PARTS, type CarPart } from "./cars";

export type Weights = Record<CarPart, number>;   // importance 0-10 per sub-rating
export type Session = "race" | "qualy";
export type TrackType = "fast" | "twisty" | "mixed";
export type Experience = "beginner" | "intermediate" | "alien";

export const SESSIONS: { value: Session; label: string }[] = [{ value: "race", label: "Race" }, { value: "qualy", label: "Qualy / hotlap" }];
export const TRACK_TYPES: { value: TrackType; label: string; title: string }[] = [
  { value: "fast", label: "Fast & flowing", title: "Long straights and quick corners: Monza, Spa, Paul Ricard…" },
  { value: "twisty", label: "Twisty", title: "Slow corners, traction and braking: Hungaroring, Zolder, Misano…" },
  { value: "mixed", label: "Mixed", title: "A bit of everything" },
];
export const EXPERIENCES: { value: Experience; label: string; title: string }[] = [
  { value: "beginner", label: "Beginner", title: "An easy car first: driveability counts a lot" },
  { value: "intermediate", label: "Intermediate", title: "Driveability counts a little" },
  { value: "alien", label: "Alien", title: "Pure performance: driveability ignored" },
];

/** Each ACC track's character, for its presets (the team's call; mixed when unsure). */
export const TRACK_TYPE: Record<string, TrackType> = {
  monza: "fast", spa: "fast", paul_ricard: "fast", silverstone: "fast", watkins_glen: "fast", nurburgring_24h: "fast",
  mount_panorama: "mixed", barcelona: "mixed", cota: "mixed", donington: "mixed", imola: "mixed", indianapolis: "mixed",
  kyalami: "mixed", nurburgring: "mixed", red_bull_ring: "mixed", snetterton: "mixed", suzuka: "mixed", brands_hatch: "mixed",
  hungaroring: "twisty", zolder: "twisty", misano: "twisty", valencia: "twisty", laguna_seca: "twisty", oulton_park: "twisty", zandvoort: "twisty",
};

const BY_TYPE: Record<TrackType, Omit<Weights, "tyre_wear" | "driveability">> = {
  fast: { top_speed: 9, acceleration: 7, traction: 3, slow_corners: 3, fast_corners: 8, braking: 4 },
  twisty: { top_speed: 3, acceleration: 4, traction: 8, slow_corners: 9, fast_corners: 4, braking: 7 },
  mixed: { top_speed: 5, acceleration: 5, traction: 5, slow_corners: 5, fast_corners: 5, braking: 5 },
};

/** The importances the presets give: track type, tyre wear only in races, driveability by experience. */
export function presetWeights(session: Session, type: TrackType, experience: Experience): Weights {
  return {
    ...BY_TYPE[type],
    tyre_wear: session === "race" ? 6 : 0,
    driveability: experience === "beginner" ? 9 : experience === "intermediate" ? 4 : 0,
  } as Weights;
}

export type FinderCar = { key: string; name: string; year: number; side: string | null; ratings: Partial<Record<CarPart, number | null>> };
export type Match = {
  car: FinderCar; score: number; ratingScore: number | null;
  coverage: number;   // share of the asked-for importance its filled-in ratings cover (0-1)
  pace: { gap: number; rank: number; of: number } | null;   // default-BoP gap to the class's fastest on the track
  why: string[];
};

/** Pace on the sheet → 0-100, linear: the class's fastest 100, PACE_ZERO % slower or more 0 (user's
 *  scale, 2026-10-10: GT3 gaps are small, wider scales barely separated the cars). */
export const PACE_ZERO = 1.5;
export const paceScore = (gapPct: number) => Math.max(0, Math.min(100, 100 * (1 - gapPct / PACE_ZERO)));
/** Share of the match given by the track's pace when a track is picked (user's choice: half). */
export const PACE_SHARE = 0.5;
/** Below this share of the asked-for importance rated, a car is "few ratings" and ranked after the others. */
export const MIN_COVERAGE = 0.6;

const word = (v: number) => (v >= 90 ? "excellent" : v >= 80 ? "very good" : v >= 70 ? "good" : "decent");

export function score(cars: FinderCar[], w: Weights, trackGaps: Record<string, number> | null, trackName: string | null): Match[] {
  const ranked = trackGaps ? Object.entries(trackGaps).sort((a, b) => a[1] - b[1]).map(([k]) => k) : [];
  const out: Match[] = cars.map((car) => {
    let total = 0, weight = 0;
    const asked = CAR_PARTS.reduce((s, p) => s + (w[p.key] || 0), 0);
    const contrib: { key: CarPart; v: number; c: number }[] = [];
    for (const p of CAR_PARTS) {
      const v = car.ratings[p.key];
      if (v == null || !w[p.key]) continue;
      total += v * w[p.key]; weight += w[p.key];
      contrib.push({ key: p.key, v, c: w[p.key] * (v - 50) });
    }
    const ratingScore = weight ? total / weight : null;
    const gap = trackGaps?.[car.key];
    const pace = gap != null ? { gap, rank: ranked.indexOf(car.key) + 1, of: ranked.length } : null;
    const s = ratingScore != null && pace ? (1 - PACE_SHARE) * ratingScore + PACE_SHARE * paceScore(pace.gap)
      : ratingScore ?? (pace ? paceScore(pace.gap) : 0);
    // Why: its strongest points for what was asked (the biggest weighted contributions), the track pace
    const why = contrib.sort((a, b) => b.c - a.c).filter((x) => x.v >= 65).slice(0, 3)
      .map((x) => {
        const label = CAR_PARTS.find((p) => p.key === x.key)!.label.toLowerCase();
        return x.key === "driveability" ? (x.v >= 80 ? "easy to drive" : "fairly easy to drive") : `${word(x.v)} ${label}`;
      });
    if (pace && trackName) why.unshift(pace.gap < 0.005 ? `fastest on the sheet at ${trackName}` : `+${pace.gap.toFixed(2)} % on the sheet at ${trackName} (${pace.rank}/${pace.of})`);
    return { car, score: s, ratingScore, coverage: asked ? weight / asked : 0, pace, why };
  });
  // A car rated on too little of what was asked would win on one number: well-rated cars first
  const sure = (m: Match) => m.coverage >= MIN_COVERAGE;
  return out.filter((m) => m.ratingScore != null || m.pace).sort((a, b) => Number(sure(b)) - Number(sure(a)) || b.score - a.score);
}
