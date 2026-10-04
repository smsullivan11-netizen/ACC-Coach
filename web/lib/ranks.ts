// Rank titles from the Overall Driver Rating (the team's scale). Safe on server and client.

export const RANKS = [
  { min: 90, title: "Alien", color: "#ffd200" },
  { min: 80, title: "Expert", color: "#ff8a00" },
  { min: 70, title: "Front Runner", color: "#e10600" },
  { min: 60, title: "Contender", color: "#c084fc" },
  { min: 50, title: "Advanced", color: "#38bdf8" },
  { min: 40, title: "Intermediate", color: "#34d399" },
  { min: 20, title: "Apprentice", color: "#a1a1aa" },
  { min: 0, title: "Rookie", color: "#71717a" },
] as const;

export type Rank = (typeof RANKS)[number];

export const rankFor = (rating: number): Rank => RANKS.find((r) => rating >= r.min) ?? RANKS[RANKS.length - 1];

/** Index from the bottom (Rookie 0 … Alien 7): a higher index is a promotion. */
export const rankLevel = (rating: number) => RANKS.length - 1 - RANKS.findIndex((r) => rating >= r.min);
