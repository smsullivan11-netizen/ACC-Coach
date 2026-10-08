import { createHash } from "node:crypto";
import { currentDriver } from "@/lib/auth";
import { carInfo } from "@/lib/cars";
import { sql } from "@/lib/db";
import { guessKind, KINDS, setupProblem, type Kind } from "@/lib/setups";
import { TRACKS } from "@/lib/tracks";

// Upload ACC setup files (Setups library, migration 0017). Everyone signed in can upload (user's
// choice for now). Body: { track, kind?, notes?, files: [{ name, text }] }: the track is chosen
// by the uploader (the file does not say which track it is for), the kind is guessed from each
// file's name unless given. One file or many; the same setup is stored once per car and track.
export const maxDuration = 60;
const MAX_FILES = 40, MAX_BYTES = 60_000;

export async function POST(request: Request) {
  const me = await currentDriver();
  if (!me) return Response.json({ error: "sign in first" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    track?: string; kind?: string; notes?: string; files?: { name?: string; text?: string }[];
  } | null;
  const track = String(body?.track ?? "").toLowerCase();
  if (!(track in TRACKS)) return Response.json({ error: "choose the track these setups are for" }, { status: 400 });
  const files = body?.files;
  if (!Array.isArray(files) || !files.length) return Response.json({ error: "no file" }, { status: 400 });
  if (files.length > MAX_FILES) return Response.json({ error: `at most ${MAX_FILES} files at a time` }, { status: 400 });
  const kind = KINDS.find((k) => k.value === body?.kind)?.value as Kind | undefined;
  const notes = typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 1500) : null;

  const added: { id: string; name: string }[] = [], duplicates: string[] = [], errors: { name: string; error: string }[] = [];
  for (const f of files) {
    const name = String(f?.name ?? "setup").replace(/\.json$/i, "").trim().slice(0, 120) || "setup";
    const text = typeof f?.text === "string" ? f.text.replace(/^﻿/, "") : "";
    if (text.length > MAX_BYTES) { errors.push({ name, error: "file too big for a setup" }); continue; }
    let data: unknown;
    try { data = JSON.parse(text); } catch { errors.push({ name, error: "not a JSON file" }); continue; }
    const problem = setupProblem(data);
    if (problem) { errors.push({ name, error: problem }); continue; }
    const carName = (data as { carName: string }).carName;
    if (!carInfo(carName)) { errors.push({ name, error: `unknown car "${carName}"` }); continue; }
    const sha = createHash("sha256").update(JSON.stringify(data)).digest("hex");
    const [row] = await sql<{ id: string }[]>`
      insert into setup (car_key, track_key, title, kind, notes, data, sha256, uploaded_by)
      values (${carName}, ${track}, ${name}, ${kind ?? guessKind(name)}, ${notes}, ${sql.json(data as never)}, ${sha}, ${me.id})
      on conflict (car_key, track_key, sha256) do nothing
      returning id`;
    if (row) added.push({ id: row.id, name }); else duplicates.push(name);
  }
  return Response.json({ ok: true, added, duplicates, errors });
}
