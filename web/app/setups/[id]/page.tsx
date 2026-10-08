import { ArrowLeft, FolderOpen, Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, Chip } from "@/components/ui";
import { requireDriver } from "@/lib/auth";
import { carInfo, carName } from "@/lib/cars";
import { sql } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { KINDS, type SetupFile } from "@/lib/setups";
import { trackInfo } from "@/lib/tracks";
import Actions from "./Actions";
import SetupViewer from "./SetupViewer";

type Row = {
  id: string; car_key: string; track_key: string; title: string; kind: string; notes: string | null; data: SetupFile;
  uploaded_by: string | null; uploader: string | null; avatar: string | null; created_at: Date; downloads: number; track_folder: string | null;
};

export async function generateMetadata(props: PageProps<"/setups/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const [s] = /^\d+$/.test(id) ? await sql<{ title: string }[]>`select title from setup where id = ${id}`.catch(() => []) : [];
  return { title: s?.title ?? "Setup" };
}

// One setup (Setups library): who shared it for which car and track, the game's six setup tabs,
// download, and where to put the file.
export default async function SetupPage(props: PageProps<"/setups/[id]">) {
  const me = await requireDriver();
  const { id } = await props.params;
  if (!/^\d+$/.test(id)) notFound();
  const [s] = await sql<Row[]>`
    select s.id, s.car_key, s.track_key, s.title, s.kind, s.notes, s.data, s.uploaded_by, d.display_name as uploader, d.avatar_url as avatar,
           s.created_at, s.downloads, (select t.key from track t where lower(t.key) = s.track_key limit 1) as track_folder
    from setup s left join driver d on d.id = s.uploaded_by where s.id = ${id}`;
  if (!s) notFound();
  const car = carInfo(s.car_key);
  const track = trackInfo(s.track_key)?.name ?? s.track_key;
  const kind = KINDS.find((k) => k.value === s.kind);

  return (
    <div className="bleed bleed-lg">
      <Link href={`/setups?car=${s.car_key}&track=${s.track_key}`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white">
        <ArrowLeft size={15} /> Setups
      </Link>
      <div className="rise mb-5">
        <h1 className="display flex items-center gap-3 text-2xl text-white"><Settings2 size={24} className="shrink-0 text-race" /> <span className="min-w-0 break-words">{s.title}</span></h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-zinc-400">
          <Link href={`/cars/${s.car_key}`} className="font-medium text-white hover:underline">{carName(s.car_key)}</Link>
          {car && <Chip>{car.cls}</Chip>}
          <span>{track}</span>
          <Chip tone={s.kind === "qualifying" ? "yellow" : s.kind === "race" ? "red" : s.kind === "wet" ? "blue" : "grey"}>{kind?.label ?? s.kind}</Chip>
          <span className="inline-flex items-center gap-1.5"><Avatar url={s.avatar} name={s.uploader ?? "?"} size={20} /> {s.uploader ?? "a former member"} · {dateTime(s.created_at)}</span>
          <span className="text-xs text-zinc-500">{s.downloads} {s.downloads === 1 ? "download" : "downloads"}</span>
        </p>
        {s.notes && <p className="mt-3 max-w-3xl whitespace-pre-line text-sm text-zinc-300">{s.notes}</p>}
      </div>

      <div className="mb-5">
        <Actions id={s.id} title={s.title} kind={s.kind} notes={s.notes ?? ""} canEdit={me.is_admin || s.uploaded_by === me.id} />
        <p className="mt-3 flex max-w-3xl items-start gap-2 text-xs text-zinc-500">
          <FolderOpen size={14} className="mt-0.5 shrink-0" />
          <span>Put the file in <code className="rounded bg-white/10 px-1 py-0.5">Documents\Assetto Corsa Competizione\Setups\{s.car_key}\{s.track_folder ?? s.track_key}\</code> (create the folders if needed), then pick it in the game&apos;s setup screen.</span>
        </p>
      </div>

      <SetupViewer file={s.data} carClass={car?.cls} />
    </div>
  );
}
