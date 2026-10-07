"use client";

import { useEffect, useRef } from "react";
import { QUOTE_COOKIE, type QuoteTone } from "@/lib/quotes";

// The dashboard's welcome (user's request): a motivating quote, a different one on each visit
// (lib/quotes.ts), big, with room under it so the blocks start lower and the background video
// shows on arrival. Its words slide in one by one out of a blur; scrolling blurs it, fades it and
// lifts it away. Played even with "reduce motion" (Windows sends it whenever its animation effects
// are off, as on the user's PC).
const FADE_PX = 320;   // scrolled this far, it is gone

/** The heading font draws its apostrophe far above the letters (it lands between the lines): the
 *  apostrophes come from the regular font instead. */
const apostrophes = (text: string) =>
  text.split(/(['’])/).map((s, k) => (s === "'" || s === "’" ? <span key={k} className="font-sans font-bold">’</span> : s));

const TONE_CLASS ={ yellow: "text-accent", red: "text-race", purple: "text-[#c04bf2]" } as const;

export default function WelcomeHero({ day, name, quote, deck }: { day: string; name: string; quote: { text: string; tone: QuoteTone }[]; deck: string }) {
  const box = useRef<HTMLDivElement>(null);
  // The quotes still to come (lib/quotes.ts nextQuote), kept for a year
  useEffect(() => { document.cookie = `${QUOTE_COOKIE}=${deck}; path=/; max-age=31536000; samesite=lax`; }, [deck]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = box.current;
      if (!el) return;
      const k = Math.min(1, window.scrollY / FADE_PX);
      el.style.opacity = String(1 - k * k * (3 - 2 * k));   // smoothstep: slow start, slow end
      el.style.transform = `translateY(${(-k * 48).toFixed(1)}px) scale(${(1 - k * 0.04).toFixed(3)})`;
      el.style.filter = k > 0.01 ? `blur(${(k * 10).toFixed(1)}px)` : "";
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, []);

  // Words in order (highlighted ones keep their colour), each sliding in a little after the last;
  // long quotes (the poem) a size smaller and a little quicker
  // A word can span parts ("~La Speciale~’s."): its pieces stay together, so it never wraps inside
  let i = 0;
  const words: ({ text: string; tone: QuoteTone }[] | " ")[] = [];
  let current: { text: string; tone: QuoteTone }[] = [];
  for (const part of quote)
    for (const piece of part.text.split(/(\s+)/).filter(Boolean)) {
      if (/^\s+$/.test(piece)) {
        if (current.length) words.push(current);
        words.push(" ");
        current = [];
      } else current.push({ text: piece, tone: part.tone });
    }
  if (current.length) words.push(current);
  const long = quote.reduce((n, p) => n + p.text.length, 0) > 70;
  const step = long ? 55 : 75;
  return (
    <div ref={box} className="origin-left pb-14 pt-8 will-change-transform sm:pb-24 sm:pt-16">
      <p className="word-in text-sm uppercase tracking-[0.25em] text-zinc-400" style={{ animationDelay: "0ms" }}>
        {day} · <span className="text-zinc-200">{name}</span>
      </p>
      <h1 className={`display mt-4 max-w-4xl leading-[1.22] text-white ${long ? "text-3xl sm:text-5xl" : "text-4xl sm:text-6xl"}`}>
        {words.map((w, k) =>
          w === " " ? <span key={k}> </span> : (
            <span key={k} className="word-in inline-block" style={{ animationDelay: `${150 + (i++) * step}ms` }}>
              {w.map((p, j) => <span key={j} className={p.tone ? TONE_CLASS[p.tone] : undefined}>{apostrophes(p.text)}</span>)}
            </span>
          ))}
      </h1>
    </div>
  );
}
