"use client";

import { Check, Download, Link2, Share2, X } from "lucide-react";
import { useState } from "react";

// "Share" on a lap: preview of the lap card, copy its link (Discord shows the image) or download it.
export default function ShareCard({ url, name }: { url: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-ghost px-3 py-1.5 text-xs"><Share2 size={14} /> Share</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-3xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center">
              <span className="display text-sm uppercase tracking-wider text-white">Lap card</span>
              <button onClick={() => setOpen(false)} className="ml-auto text-zinc-400 hover:text-white" aria-label="Close"><X size={18} /></button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Lap card" className="w-full rounded-lg ring-1 ring-white/10" />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={copy} className="btn btn-primary">{copied ? <Check size={15} /> : <Link2 size={15} />} {copied ? "Link copied" : "Copy link"}</button>
              <a href={url} download={`${name}.png`} className="btn btn-ghost"><Download size={15} /> Download</a>
              <span className="text-xs text-zinc-500">Paste the link in Discord: it shows as the image.</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
