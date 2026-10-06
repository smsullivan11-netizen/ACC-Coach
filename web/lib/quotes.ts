// The dashboard's welcome (user's list), a different one on each visit. Highlights: *word* in the
// team yellow, ~word~ in the team red, ^word^ in purple (a purple sector). The heading font (Konexy)
// has no ":" glyph: keep colons out. Apostrophes are fine (WelcomeHero draws them in the regular
// font: the heading font's sit far above the letters).

export const QUOTES = [
  "Lock up? ~Lock in~.",
  "Lick the stamp, and ~send it~.",
  "I knew he would brake, because he is married and has kids.",
  "My homie pulling girls... I’m pulling ~La Speciale~’s.",
  "Roses are red, the sector times are ^purple^. Our highest position yet, and my teammate *spins* in circles...",
  "Lap times don’t lie. Go make them *talk*.",
  "No luck. Just *reps*.",
  "The leaderboard remembers. Make it remember *you*.",
  "Zero drama, all *pace*.",
  "She wants to break up. I wanna brake later.",
  "The car is fast enough. Are *you*?",
  "Fast is a feeling. Consistent is a *choice*.",
  "Clean lap, plus aura. Gravel trap, minus *aura*.",
  "Be the delta they’re *chasing*.",
];

export type QuoteTone = "yellow" | "red" | "purple" | null;
const TONES: Record<string, QuoteTone> = { "*": "yellow", "~": "red", "^": "purple" };

/** A quote for this visit, as parts with their highlight. */
export function pickQuote(): { text: string; tone: QuoteTone }[] {
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  return q.split(/(\*[^*]+\*|~[^~]+~|\^[^^]+\^)/).filter(Boolean)
    .map((p) => (TONES[p[0]] && p.length > 2 && p.at(-1) === p[0] ? { text: p.slice(1, -1), tone: TONES[p[0]] } : { text: p, tone: null }));
}
