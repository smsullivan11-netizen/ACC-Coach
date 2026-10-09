"use client";

import { Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** The "i" next to a column, rating or title: its text on hover (title) and in a box on click. The
 *  site's explanations live here rather than in grey paragraphs (user's request, 2026-10-09: "nobody's
 *  reading that"). `edge` or side "right": the box opens leftwards (last columns of a table); side
 *  "left": it opens rightwards (titles at the left edge). */
export default function InfoTip({ text, edge = false, side }: { text: string; edge?: boolean; side?: "left" | "center" | "right" }) {
  const at = side ?? (edge ? "right" : "center");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <span ref={box} className="relative inline-flex">
      <button type="button" aria-label="What is this?" title={text}
              onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
              className="grid h-4 w-4 place-items-center rounded-full text-zinc-500 hover:text-accent">
        <Info size={12} />
      </button>
      {open && (
        <span className={`absolute top-6 z-30 w-72 max-w-[85vw] whitespace-normal rounded-lg border border-white/10 bg-raised p-3 text-left font-sans text-xs font-normal normal-case leading-relaxed tracking-normal text-zinc-300 shadow-xl ${
                at === "right" ? "right-0" : at === "left" ? "-left-2" : "left-1/2 -translate-x-1/2"}`}>
          {text}
        </span>
      )}
    </span>
  );
}
