"use client";

import { ArrowLeft, ArrowRight, Check, CircleHelp, Download, Flag, Gauge, Link2, MonitorPlay, Trophy, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// "How to use this site" (user's request, 2026-10-07: no new section, a pop-up over the current
// page, blurred behind, like a slideshow). The "?" button in the header opens it; it also opens
// by itself until the member first closes it (driver.guide_seen_at, migration 0013: on the account,
// not in the browser, so no consent is needed and it works across devices). Arrows, dots, ←/→ keys and
// swipes move between slides; Esc, ✕ or a click outside close it. Pictures: screenshots of the
// local test site (public/media/tutorial/, 1200 px WebP; retake them when a page changes a lot).

type Slide = {
  title: string;
  text: string;
  points?: string[];
  image?: string;
  visual?: "app" | "done";
  link?: { href: string; label: string };
};

const SLIDES: Slide[] = [
  {
    title: "Welcome to ACC Coach",
    text: "Every session you drive in Assetto Corsa Competizione becomes telemetry you can compare with your teammates'. Here is a two-minute tour.",
    points: ["Drive: the app records and uploads by itself", "Compare: your laps against anyone's, corner by corner", "Improve: the coach tells you where the time goes"],
    image: "dashboard",
  },
  {
    title: "First: get the app",
    text: "The ACC Coach app runs next to the clock while you play. It records every session at the game's full rate and uploads it when the session ends. Nothing to start or stop.",
    points: ["Install it from \"Get the app\"", "On first start it opens \"Link this PC\": sign in, one click", "Drive: your sessions appear here a few seconds after you leave the track"],
    visual: "app",
    link: { href: "/download", label: "Get the app" },
  },
  {
    title: "Your dashboard",
    text: "Your home page: where you stand and what the team has been doing.",
    points: ["Your rating, its four parts and the points to your next rank", "Your progression and personal bests", "The team ranking and the latest sessions, records and PBs", "Each block's title opens its full page"],
    image: "dashboard",
    link: { href: "/", label: "Open the dashboard" },
  },
  {
    title: "Sessions and the coach",
    text: "Every uploaded session, with its track and weather conditions. Open one to see all its laps and the coach's notes.",
    points: ["Where you lose time and what to change, corner by corner", "Track limits, mistakes and how your pace held up", "The session type used for the rating: change it if a practice was really a race simulation"],
    image: "session",
    link: { href: "/sessions", label: "Open Sessions" },
  },
  {
    title: "Compare two laps",
    text: "Pick any two laps, yours or a teammate's: from Telemetry, or open a lap and choose another lap to compare it with.",
    points: ["Time gap along the lap, speed, throttle, brake, steering and gear", "Zoom on a corner or a whole section with the turn buttons", "Braking points measured from virtual 50 / 100 / 150 m boards"],
    image: "compare",
    link: { href: "/telemetry", label: "Open Telemetry" },
  },
  {
    title: "Watch the replay",
    text: "On a comparison, \"Replay both laps\" shows the two cars from above on the real racing lines.",
    points: ["Click a turn to put both cars neck and neck there", "Follow either car, colour the lines by throttle and brake", "Mouse wheel to zoom, fullscreen button at the top right"],
    image: "replay",
  },
  {
    title: "Leaderboards",
    text: "Each track has its team leaderboard per car class: best laps, gaps, theoretical bests and the target time the team chases.",
    points: ["Beat the target and your lap becomes the new reference", "Records, equalled records and PBs are posted on Discord"],
    image: "leaderboard",
    link: { href: "/tracks", label: "Open Leaderboards" },
  },
  {
    title: "Rating and ranks",
    text: "The Overall Driver Rating (0-100) mixes pace, consistency, clean driving and smoothness, weighted by session type. It is your current form: your best session on each track over the last 60 days.",
    points: ["Ranks from Rookie to Alien; promotions are posted on Discord", "The \"i\" buttons on the Drivers page explain each number"],
    image: "drivers",
    link: { href: "/drivers", label: "Open Drivers" },
  },
  {
    title: "Race engineer, live",
    text: "While you drive, right-click the app's icon next to the clock → \"Race engineer (live)\".",
    points: ["Fuel to add and how many laps you can do", "Tyre pressures to set at the next stop, temperatures and brake ducts", "Tyre and brake wear, damage; can be shared with a phone on your Wi-Fi"],
    image: "engineer",
  },
  {
    title: "Ready to drive",
    text: "Drive, then come back after your session: your laps, your rating and the coach's notes will be waiting. You can reopen this guide anytime with the ? button at the top.",
    visual: "done",
  },
];

export default function Tutorial({ seen }: { seen: boolean }) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<"next" | "prev">("next");
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const touch = useRef<number | null>(null);

  const go = useCallback((to: number) => {
    setI((cur) => {
      const next = Math.max(0, Math.min(SLIDES.length - 1, to));
      setDir(next >= cur ? "next" : "prev");
      return next;
    });
  }, []);
  // Seen = closed once (on the account): no longer opens by itself, and the button shows a green tick
  const [done, setDone] = useState(seen);
  const seenRef = useRef(seen);
  const close = useCallback(() => {
    setOpen(false);
    setDone(true);
    // keepalive: the request still goes through if the page is refreshed or left right after closing
    if (!seenRef.current) { seenRef.current = true; void fetch("/api/guide-seen", { method: "POST", keepalive: true }).catch(() => {}); }
    button.current?.focus();
  }, []);

  // Until the member has closed it once: open by itself
  useEffect(() => {
    if (!seen) { const t = setTimeout(() => { setI(0); setOpen(true); }, 700); return () => clearTimeout(t); }
  }, [seen]);

  // While open: keys, no page scrolling behind, focus inside
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
    };
    window.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => { window.removeEventListener("keydown", key); document.body.style.overflow = overflow; };
  }, [open, i, go, close]);

  const s = SLIDES[i];   // the picture; texts are all rendered (see below)
  const last = i === SLIDES.length - 1;
  return (
    <>
      <button ref={button} onClick={() => { setI(0); setDir("next"); setOpen(true); }} title={done ? "How to use this site (seen)" : "How to use this site"}
              aria-label="Guide: how to use this site"
              className="flex h-9 items-center gap-2.5 rounded-full px-2 text-sm text-zinc-400 transition-colors hover:bg-white/[0.07] hover:text-white 2xl:pl-2.5 2xl:pr-3">
        <span className="relative">
          <CircleHelp size={17} />
          {done && (
            <span className="absolute -bottom-1 -right-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-green-500 ring-2 ring-[#141417]">
              <Check size={8} strokeWidth={4} className="text-black" />
            </span>
          )}
        </span>
        <span className="hidden 2xl:inline">Guide</span>
      </button>

      {/* On <body>: inside the header (backdrop-filter) a fixed element would be held to the header's box */}
      {open && createPortal(
        <div className="tut-fade fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-3 backdrop-blur-md sm:p-6"
             onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="tut-title" tabIndex={-1}
               onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
               onTouchEnd={(e) => {
                 if (touch.current == null) return;
                 const dx = e.changedTouches[0].clientX - touch.current;
                 touch.current = null;
                 if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
               }}
               className="tut-pop card card-red relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden outline-none shadow-[0_30px_80px_-20px_rgb(0_0_0/0.9)]">
            <button onClick={close} aria-label="Close the guide"
                    className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-1.5 text-zinc-300 backdrop-blur hover:text-white">
              <X size={16} />
            </button>

            <div key={i} className={`min-h-0 flex-1 overflow-y-auto ${dir === "next" ? "tut-next" : "tut-prev"}`}>
              <div className="relative aspect-[1200/625] w-full overflow-hidden bg-ink">
                {s.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/media/tutorial/${s.image}.webp`} alt="" className="h-full w-full object-cover object-top" />
                ) : (
                  <Visual kind={s.visual!} />
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-panel to-transparent" />
              </div>
              {/* Every slide's text stacked in one grid cell, only the current one visible: the box
                  is as tall as the longest text at any width, so the window does not jump */}
              <div className="grid px-5 pb-2 pt-1 sm:px-7">
                {SLIDES.map((x, k) => (
                  <div key={k} aria-hidden={k !== i} className={`[grid-area:1/1] ${k === i ? "" : "invisible"}`}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{k + 1} / {SLIDES.length}</p>
                    <h2 id={k === i ? "tut-title" : undefined} className="display mt-1 text-xl text-white sm:text-2xl">{x.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-300">{x.text}</p>
                    {x.points && (
                      <ul className="mt-3 space-y-1.5 text-sm text-zinc-300">
                        {x.points.map((p) => (
                          <li key={p} className="flex gap-2.5"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-race" />{p}</li>
                        ))}
                      </ul>
                    )}
                    {x.link && (
                      <Link href={x.link.href} onClick={close} tabIndex={k === i ? 0 : -1}
                            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
                        {x.link.label} <ArrowRight size={14} />
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 border-t border-white/5 px-5 py-3 sm:px-7">
              <div className="flex flex-1 flex-wrap gap-1.5">
                {SLIDES.map((x, k) => (
                  <button key={k} onClick={() => go(k)} aria-label={`Slide ${k + 1}: ${x.title}`}
                          className={`h-1.5 rounded-full transition-all ${k === i ? "w-6 bg-accent" : "w-1.5 bg-white/20 hover:bg-white/40"}`} />
                ))}
              </div>
              {i > 0 && (
                <button onClick={() => go(i - 1)} className="btn btn-ghost px-3 py-1.5"><ArrowLeft size={15} /> Back</button>
              )}
              {last ? (
                <button onClick={close} className="btn btn-primary px-4 py-1.5">Let&apos;s drive</button>
              ) : (
                <button onClick={() => go(i + 1)} className="btn btn-primary px-4 py-1.5">Next <ArrowRight size={15} /></button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Slides without a screenshot: the app's three steps, and the closing slide. */
function Visual({ kind }: { kind: "app" | "done" }) {
  const steps = kind === "app"
    ? [{ icon: Download, label: "Install" }, { icon: Link2, label: "Link this PC" }, { icon: Flag, label: "Drive" }]
    : [{ icon: Gauge, label: "Drive" }, { icon: MonitorPlay, label: "Compare" }, { icon: Trophy, label: "Climb" }];
  return (
    <div className="flex h-full items-center justify-center gap-3 bg-[radial-gradient(ellipse_at_center,rgb(225_6_0/0.18),transparent_65%)] px-6 sm:gap-6">
      {steps.map(({ icon: Icon, label }, k) => (
        <div key={label} className="flex items-center gap-3 sm:gap-6">
          <div className="rise flex flex-col items-center gap-2" style={{ "--d": `${120 + k * 140}ms` } as React.CSSProperties}>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-raised shadow-[0_0_40px_-12px] shadow-accent/40 sm:h-20 sm:w-20">
              <Icon size={30} className={k === steps.length - 1 ? "text-accent" : "text-zinc-200"} />
            </div>
            <span className="text-xs font-semibold text-zinc-300">{label}</span>
          </div>
          {k < steps.length - 1 && <ArrowRight size={20} className="mb-6 text-race" />}
        </div>
      ))}
    </div>
  );
}
