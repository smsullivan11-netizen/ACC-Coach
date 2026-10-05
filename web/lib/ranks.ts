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

/** Index from the bottom (Rookie 0 … Alien 7): a higher index is a promotion. */
export const rankLevel = (rating: number) => RANKS.length - 1 - RANKS.findIndex((r) => rating >= r.min);
