"use client";

import { useEffect, useRef } from "react";

// The dashboard's welcome (user's request): a motivating quote, a different one on each visit
// (lib/quotes.ts), big, with room under it so the blocks start lower and the background video
// shows on arrival. Its words slide in one by one out of a blur; scrolling blurs it, fades it and
// lifts it away. Played even with "reduce motion" (Windows sends it whenever its animation effects
// are off, as on the user's PC).
const FADE_PX = 320;   // scrolled this far, it is gone

export default function WelcomeHero({ day, name, quote }: { day: string; name: string; quote: { text: string; hot: boolean }[] }) {
  const box = useRef<HTMLDivElement>(null);
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

  // Words in order (the yellow ones keep their colour), each sliding in a little after the last
  let i = 0;
  const words = quote.flatMap((part) => part.text.split(/(\s+)/).filter(Boolean).map((w) => ({ w, hot: part.hot })));
  return (
    <div ref={box} className="origin-left pb-14 pt-8 will-change-transform sm:pb-24 sm:pt-16">
      <p className="word-in text-sm uppercase tracking-[0.25em] text-zinc-400" style={{ animationDelay: "0ms" }}>
        {day} · <span className="text-zinc-200">{name}</span>
      </p>
      <h1 className="display mt-4 max-w-4xl text-4xl leading-[1.12] text-white sm:text-6xl">
        {words.map(({ w, hot }, k) =>
          /^\s+$/.test(w) ? <span key={k}>{w}</span> : (
            <span key={k} className={`word-in inline-block ${hot ? "text-accent" : ""}`} style={{ animationDelay: `${150 + (i++) * 75}ms` }}>{w}</span>
          ))}
      </h1>
    </div>
  );
}
