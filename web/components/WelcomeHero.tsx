"use client";

import { useEffect, useRef } from "react";

// The dashboard's welcome (user's request): big, with room under it so the blocks start lower and
// the background video shows on arrival; it fades out (and drifts up a little) as the page scrolls.
const FADE_PX = 320;   // scrolled this far, it is gone

export default function WelcomeHero({ day, name }: { day: string; name: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = box.current;
      if (!el) return;
      const k = Math.min(1, window.scrollY / FADE_PX);
      el.style.opacity = String(1 - k);
      el.style.transform = `translateY(${(-k * 40).toFixed(1)}px)`;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, []);
  return (
    // The scroll fade on the outer box, the entrance animation inside (its final state would pin
    // opacity and position, overriding the fade)
    <div ref={box} className="pb-14 pt-8 will-change-transform sm:pb-24 sm:pt-16">
      <div className="rise">
        <p className="text-base text-zinc-300">{day}</p>
        <h1 className="display mt-2 text-4xl text-white sm:text-6xl">Welcome back, <span className="text-accent">{name}</span></h1>
      </div>
    </div>
  );
}
