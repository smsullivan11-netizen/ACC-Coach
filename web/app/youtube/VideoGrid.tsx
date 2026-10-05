"use client";

import { ExternalLink, Play, X } from "lucide-react";
import { useState } from "react";
import type { Video } from "@/lib/youtube";

const date = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

// Video cards; a click plays the video on the page (privacy-enhanced embed: no YouTube cookies until
// it plays), with a link to watch it on YouTube.
export default function VideoGrid({ videos }: { videos: Video[] }) {
  const [playing, setPlaying] = useState<Video | null>(null);
  return (
    <div>
      {playing && (
        <div className="card rise mb-5 overflow-hidden">
          <div className="aspect-video w-full bg-black">
            <iframe src={`https://www.youtube-nocookie.com/embed/${playing.id}?autoplay=1&rel=0`} title={playing.title}
                    className="h-full w-full" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          </div>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-white">{playing.title}</div>
              <div className="text-xs text-zinc-500">{date(playing.published)}</div>
            </div>
            <a href={`https://www.youtube.com/watch?v=${playing.id}`} target="_blank" rel="noreferrer" className="btn btn-ghost px-3 py-1.5 text-xs">
              <ExternalLink size={14} /> Watch on YouTube
            </a>
            <button onClick={() => setPlaying(null)} className="btn btn-ghost px-2 py-1.5" aria-label="Close the player"><X size={15} /></button>
          </div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((v) => (
          <button key={v.id} onClick={() => { setPlaying(v); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  className="card card-hover group overflow-hidden text-left">
            <div className="relative aspect-video overflow-hidden bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
              <span className="absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/30">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-race/90 text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                  <Play size={20} fill="currentColor" />
                </span>
              </span>
            </div>
            <div className="p-3">
              <div className="line-clamp-2 text-sm font-medium text-white">{v.title}</div>
              <div className="mt-1 text-xs text-zinc-500">{date(v.published)}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
