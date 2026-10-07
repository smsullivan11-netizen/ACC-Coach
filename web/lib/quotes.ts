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

// A shuffled deck per driver (user: refreshing showed the same 3-4 quotes while others never came:
// pure chance repeats soon), kept on the account (driver.quote_deck, migration 0013; not a cookie:
// no consent needed): the quotes still to come and the last one shown, "3.7.1~5". Every quote is
// shown once before any comes back; a new deck never starts with the quote just shown.

function shuffled(avoid: number | null) {
  const d = QUOTES.map((_, k) => k);
  for (let k = d.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [d[k], d[j]] = [d[j], d[k]]; }
  if (d.length > 1 && d[0] === avoid) [d[0], d[1]] = [d[1], d[0]];
  return d;
}

/** This visit's quote from the stored deck, and the deck's next value. */
export function nextQuote(stored: string | null | undefined) {
  const [restPart, lastPart] = (stored ?? "").split("~");
  const valid = (x: string) => /^\d+$/.test(x) && +x < QUOTES.length;
  let deck = [...new Set((restPart ?? "").split(".").filter(valid).map(Number))];
  if (!deck.length) deck = shuffled(lastPart && valid(lastPart) ? +lastPart : null);
  const [k, ...rest] = deck;
  return { quote: parseQuote(QUOTES[k]), deck: `${rest.join(".")}~${k}` };
}

/** A quote as parts with their highlight. */
function parseQuote(q: string): { text: string; tone: QuoteTone }[] {
  return q.split(/(\*[^*]+\*|~[^~]+~|\^[^^]+\^)/).filter(Boolean)
    .map((p) => (TONES[p[0]] && p.length > 2 && p.at(-1) === p[0] ? { text: p.slice(1, -1), tone: TONES[p[0]] } : { text: p, tone: null }));
}
