// Rank titles from the Overall Driver Rating (the team's scale). Safe on server and client.
// Colours (user's request): a weather-map temperature scale, cold blues for the low ranks warming
// up through cyan, green, yellow and orange to red (Expert) and purple (Alien).

export const RANKS = [
  { min: 90, title: "Alien", color: "#c04bf2" },
  { min: 80, title: "Expert", color: "#f03e3e" },
  { min: 70, title: "Front Runner", color: "#fd7e14" },
  { min: 60, title: "Contender", color: "#fcc419" },
  { min: 50, title: "Advanced", color: "#51cf66" },
  { min: 40, title: "Intermediate", color: "#22b8cf" },
  { min: 20, title: "Apprentice", color: "#4dabf7" },
  { min: 0, title: "Rookie", color: "#5c7cfa" },
] as const;

export type Rank = (typeof RANKS)[number];

export const rankFor = (rating: number): Rank => RANKS.find((r) => rating >= r.min) ?? RANKS[RANKS.length - 1];

// The whole scale as one 0-100 gradient, as the rank scale draws it: each rank's colour at its
// floor, blending into the next one's (Alien stays purple from 90).
const STOPS: [number, string][] = [...[...RANKS].reverse().map((r): [number, string] => [r.min, r.color]), [100, RANKS[0].color]];
export const SCALE_GRADIENT = `linear-gradient(90deg, ${STOPS.map(([at, c]) => `${c} ${at}%`).join(", ")})`;

/** The scale's colour at a value (0-100), blended between the two nearest ranks' colours. */
export function scaleColor(v: number) {
  const x = Math.max(0, Math.min(100, v));
  const above = STOPS.findIndex(([at]) => at > x);              // none at 100: the last segment
  const k = above < 0 ? STOPS.length - 2 : Math.max(0, above - 1);
  const [a, ca] = STOPS[k], [b, cb] = STOPS[k + 1];
  const t = b > a ? (x - a) / (b - a) : 0;
  const ch = (c: string, i: number) => parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `rgb(${[0, 1, 2].map((i) => Math.round(ch(ca, i) + (ch(cb, i) - ch(ca, i)) * t)).join(" ")})`;
}

/** Index from the bottom (Rookie 0 … Alien 7): a higher index is a promotion. */
export const rankLevel = (rating: number) => RANKS.length - 1 - RANKS.findIndex((r) => rating >= r.min);
