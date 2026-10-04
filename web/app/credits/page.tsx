import { Camera } from "lucide-react";
import type { Metadata } from "next";
import { PageTitle } from "@/components/ui";
import CREDITS from "@/lib/track-photo-credits.json";
import { TRACKS } from "@/lib/tracks";

export const metadata: Metadata = { title: "Credits" };

// Public: track photo credits (the team's ACC screenshots; Wikimedia Commons photos under free
// licences that require crediting their authors).
export default function CreditsPage() {
  const rows = Object.entries(CREDITS as Record<string, { title: string; author: string; license: string; url: string }>)
    .sort(([a], [b]) => (TRACKS[a]?.name ?? a).localeCompare(TRACKS[b]?.name ?? b));
  return (
    <div className="max-w-3xl">
      <PageTitle icon={Camera} sub="Track photos: in-game screenshots by the team, and Wikimedia Commons photos used under their free licences (cropped and resized).">
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
            ) : <span className="min-w-0 flex-1 truncate text-zinc-400">{c.author}</span>}
            <span className="text-xs text-zinc-500">{c.license}</span>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm text-zinc-500">
        Country flags: flagcdn.com (public domain). Headings: Konexy, the team&apos;s livery font (personal-use licence).
        Icons: Lucide (ISC licence).
      </p>
    </div>
  );
}
