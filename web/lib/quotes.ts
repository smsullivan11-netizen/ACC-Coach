// The dashboard's welcome (user's request: motivating, not "boomer", with aura and cold lines), a
// different one on each visit. *word* is shown in the team yellow. The heading font (Konexy) has
// no ":" glyph: keep colons out; its straight apostrophe sits too high, so quotes use ’.

export const QUOTES = [
  "Lap times don’t lie. Go make them *talk*.",
  "Brake later. Stress *never*.",
  "Aura is built one *clean lap* at a time.",
  "Quiet in the paddock. *Loud* on the timing screen.",
  "Cold tyres on the out-lap. *Cold blood* on every lap after.",
  "Your PB is just the old you. *Delete it*.",
  "Main character energy starts at the *100 board*.",
  "They watch the replay. *You set the lap*.",
  "Smooth hands, cold head, *purple sectors*.",
  "No luck. Just *reps*.",
  "Be the delta they’re *chasing*.",
  "Every tenth out there has your name on it. *Go collect*.",
  "Let the stopwatch do the *talking*.",
  "Consistency is the flex nobody *screenshots*.",
  "Late on the brakes, early on the throttle, zero *excuses*.",
  "Purple sectors only. Green is for *traffic lights*.",
  "Clean lap, plus aura. Gravel trap, minus *aura*.",
  "You don’t chase the team best. You *become it*.",
  "Cold start. *Hot laps*.",
  "The apex doesn’t care how you feel. *Hit it anyway*.",
  "Respect the line. Disrespect the *clock*.",
  "Locked in. Nothing exists but the *next corner*.",
  "Built different. *Braked later*.",
  "Ice in the veins, fire in the *sector times*.",
  "The leaderboard remembers. Make it remember *you*.",
  "Fast is a feeling. Consistent is a *choice*.",
  "Every lap is a rep. Every rep is *aura*.",
  "Calm on the out-lap. *Lethal* on the push lap.",
  "Nobody talks about the laps you didn’t finish. Finish *this one*.",
  "Silent setup, loud *lap time*.",
  "Your rival is watching your replay. Give them *something to study*.",
  "The car is fast enough. Are *you*?",
  "Tenths are hiding in the braking zones. Go *find them*.",
  "Zero drama, all *pace*.",
];

/** A quote for this visit, as parts: [text, yellow?]. */
export function pickQuote(): { text: string; hot: boolean }[] {
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  return q.split(/(\*[^*]+\*)/).filter(Boolean).map((p) => (p.startsWith("*") ? { text: p.slice(1, -1), hot: true } : { text: p, hot: false }));
}
