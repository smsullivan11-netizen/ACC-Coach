import { Camera } from "lucide-react";
import type { Metadata } from "next";
import { PageTitle, Pcgr } from "@/components/ui";
import CREDITS from "@/lib/track-photo-credits.json";
import { TRACKS } from "@/lib/tracks";
import { SHEET_URL } from "@/lib/references";

export const metadata: Metadata = { title: "Credits" };

// Public: track photo credits (the team's ACC screenshots; Wikimedia Commons photos under free
// licences that require crediting their authors).
export default function CreditsPage() {
  const rows = Object.entries(CREDITS as Record<string, { title: string; author: string; license: string; url: string }>)
    .sort(([a], [b]) => (TRACKS[a]?.name ?? a).localeCompare(TRACKS[b]?.name ?? b));
  return (
    <div className="max-w-3xl">
      <PageTitle icon={Camera} sub="Track photos: Assetto Corsa Competizione screenshots by the team.">
        Credits
      </PageTitle>
      <div className="card divide-y divide-white/5">
        {rows.map(([key, c]) => (
          <div key={key} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm">
            <span className="w-52 text-white">{TRACKS[key]?.name ?? key}</span>
            {c.url ? (
              <a href={c.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-zinc-400 underline-offset-2 hover:text-white hover:underline">
                {c.author}
              </a>
            ) : <span className="min-w-0 flex-1 truncate text-zinc-400">{c.author === "PCGR" ? <Pcgr /> : c.author}</span>}
            <span className="text-xs text-zinc-500">{c.license}</span>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm text-zinc-500">
        Country flags: flagcdn.com (public domain). Headings: Konexy, the team&apos;s livery font (personal-use licence).
        Icons: Lucide (ISC licence).
      </p>
      <p className="mt-3 text-sm text-zinc-500">
        Track widths on the maps of Barcelona, Brands Hatch, COTA, Hungaroring, Monza, Nürburgring GP, Red Bull Ring,
        Silverstone, Spa, Suzuka and Zandvoort:{" "}
        <a href="https://github.com/TUMFTM/racetrack-database" target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-white hover:underline">
          racetrack-database
        </a>{" "}
        by the Chair of Automotive Technology, Technical University of Munich (LGPL-3.0 licence), fitted to the team&apos;s laps.
      </p>
      <p className="mt-3 text-sm text-zinc-500">
        Reference lap times (the 101 % targets of the ratings, default and LFM BoP) and LFM&apos;s ballast and restrictor
        per car and track: OhneSpeed&apos;s{" "}
        <a href={SHEET_URL} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-white hover:underline">
          ACC race pace spreadsheet
        </a>{" "}
        (
        <a href="https://www.youtube.com/@ohne_speed" target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-white hover:underline">
          OhneSpeed on YouTube
        </a>
        ), read from its published pages. Older GT3s whose times there look wrong are corrected with{" "}
        <a href="https://gosetups.gg/laptimes-sheet" target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-white hover:underline">
          GO Setups&apos; lap times sheet
        </a>{" "}
        where it has the car.
      </p>
    </div>
  );
}
