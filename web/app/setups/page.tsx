import { Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, Chip, PageTitle } from "@/components/ui";
import { requireDriver } from "@/lib/auth";
import { carName } from "@/lib/cars";
import { sql } from "@/lib/db";
import CarsTabs from "../cars/CarsTabs";
import { dateTime } from "@/lib/format";
import { KINDS } from "@/lib/setups";
import { TRACKS } from "@/lib/tracks";
import Filters from "./Filters";
import UploadForm from "./UploadForm";

export const metadata: Metadata = { title: "Setups" };

type Row = {
  id: string; car_key: string; track_key: string; title: string; kind: string; uploader: string | null; avatar: string | null;
  created_at: Date; downloads: number;
};

// Setups library (user's request, 2026-10-08): ACC setup files shared by the team, by car and track.
// Everyone can upload for now; a plain library: find, download, share (no viewer).
export default async function SetupsPage(props: PageProps<"/setups">) {
  await requireDriver();
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const car = one(sp.car), track = one(sp.track).toLowerCase(), kind = KINDS.find((k) => k.value === one(sp.kind))?.value ?? "";

  // Without migration 0017 the page still opens, empty
  const rows = await sql<Row[]>`
    select s.id, s.car_key, s.track_key, s.title, s.kind, d.display_name as uploader, d.avatar_url as avatar, s.created_at, s.downloads
    from setup s left join driver d on d.id = s.uploaded_by
    where (${car} = '' or s.car_key = ${car}) and (${track} = '' or s.track_key = ${track}) and (${kind} = '' or s.kind = ${kind})
    order by s.created_at desc, s.id desc limit 300`.catch(() => [] as Row[]);
  const facets = await sql<{ car_key: string; track_key: string }[]>`select distinct car_key, track_key from setup`.catch(() => []);
  const cars = [...new Set(facets.map((f) => f.car_key))].map((c) => ({ value: c, label: carName(c) })).sort((a, b) => a.label.localeCompare(b.label));
  const tracksWith = [...new Set(facets.map((f) => f.track_key))].map((t) => ({ value: t, label: TRACKS[t]?.name ?? t })).sort((a, b) => a.label.localeCompare(b.label));
  const allTracks = Object.entries(TRACKS).map(([value, t]) => ({ value, label: t.name })).sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="bleed bleed-lg">
      <PageTitle icon={Settings2} sub="The team's ACC setup files, by car and track: download one into your own setups folder.">
        Setups
      </PageTitle>
      <div className="mb-5 flex flex-wrap items-start gap-x-4 gap-y-3">
        <CarsTabs value="setups" />
        <Filters cars={cars} tracks={tracksWith} kinds={[...KINDS]} car={car} track={track} kind={kind} />
        <div className="ml-auto"><UploadForm tracks={allTracks} defaultTrack={track} /></div>
      </div>

      <div className="card card-red rise overflow-x-auto">
        <table className="data-table min-w-[760px]">
          <thead>
            <tr>
              <th>Setup</th><th>Car</th><th>Track</th><th>Type</th>
              <th>By</th><th className="text-right">Downloads</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-zinc-500">
                {car || track || kind ? "No setup matches these filters." : "No setup yet: be the first, use “Upload setups”."}
              </td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="max-w-[18rem]">
                  <Link href={`/setups/${r.id}`} className="block truncate font-medium text-white hover:underline" title={r.title}>{r.title}</Link>
                  <div className="text-xs text-zinc-500">{dateTime(r.created_at)}</div>
                </td>
                <td className="whitespace-nowrap text-zinc-300">{carName(r.car_key)}</td>
                <td className="whitespace-nowrap text-zinc-300">{TRACKS[r.track_key]?.name ?? r.track_key}</td>
                <td><Chip tone={r.kind === "qualifying" ? "yellow" : r.kind === "race" ? "red" : r.kind === "wet" ? "blue" : "grey"}>{KINDS.find((k) => k.value === r.kind)?.label ?? r.kind}</Chip></td>
                <td>
                  <span className="inline-flex items-center gap-2 whitespace-nowrap text-zinc-300"><Avatar url={r.avatar} name={r.uploader ?? "?"} size={20} /> {r.uploader ?? "–"}</span>
                </td>
                <td className="tabular text-right text-zinc-400">{r.downloads}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 300 && <p className="mt-3 text-xs text-zinc-500">Showing the 300 latest: use the filters to narrow down.</p>}
    </div>
  );
}
