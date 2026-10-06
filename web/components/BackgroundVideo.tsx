"use client";

import { useEffect, useRef } from "react";

// A full-page video behind the dashboard (user's request; the team's 1006.mp4, cropped of its
// letterbox and compressed from 790 MB to 6 MB: public/media/). Fixed, muted, looping and darkened
// so the cards stay readable. It only loads and plays on wide screens, without data saver and
// without "reduce motion": the others keep the still image.
export default function BackgroundVideo({ src, poster }: { src: string; poster: string }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const wide = window.matchMedia("(min-width: 768px)").matches;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const save = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (!wide || calm || save) return;
    v.preload = "auto";
    v.play().catch(() => { /* autoplay refused: the still image stays */ });
  }, []);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ink">
      <video ref={video} src={src} poster={poster} muted loop playsInline preload="none" className="h-full w-full object-cover" />
      {/* Darker towards the bottom, where the cards are, and around the edges */}
      <div className="absolute inset-0 bg-gradient-to-b from-ink/55 via-ink/75 to-ink/95" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgb(7_7_7/0.7)_100%)]" />
    </div>
  );
}
