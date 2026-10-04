import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";

export type EventInput = {
  id?: string; title?: string; track_key?: string; car_class?: string; starts_at?: string; duration_min?: number;
  kind?: string; league?: string; server?: string; notes?: string; min_pit_stops?: number; max_stint_min?: number | null;
};

// Create or update an event (admins). Body: EventInput (starts_at as an ISO date with time zone).
export async function POST(request: Request) {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const b = (await request.json().catch(() => ({}))) as EventInput;
  const when = b.starts_at ? new Date(b.starts_at) : null;
  const text = (s: unknown, max = 200) => (typeof s === "string" && s.trim() ? s.trim().slice(0, max) : null);
  const e = {
    title: text(b.title, 120), track_key: text(b.track_key, 60)?.toLowerCase() ?? null, car_class: text(b.car_class, 20) ?? "GT3",
    starts_at: when && !isNaN(when.getTime()) ? when : null, duration_min: Math.round(Number(b.duration_min)),
    kind: b.kind === "endurance" ? "endurance" : "sprint", league: text(b.league, 80), server: text(b.server, 200), notes: text(b.notes, 2000),
    min_pit_stops: Math.max(0, Math.round(Number(b.min_pit_stops) || 0)),
    max_stint_min: b.max_stint_min ? Math.max(1, Math.round(Number(b.max_stint_min))) : null,
  };
  if (!e.title || !e.track_key || !e.starts_at || !(e.duration_min > 0))
    return Response.json({ error: "title, track, date and duration are required" }, { status: 400 });
  if (b.id && /^\d+$/.test(b.id)) {
    const [row] = await sql<{ id: string }[]>`update event set ${sql(e)} where id = ${b.id} returning id`;
    return row ? Response.json(row) : Response.json({ error: "not found" }, { status: 404 });
  }
  const [row] = await sql<{ id: string }[]>`insert into event ${sql({ ...e, created_by: me.id })} returning id`;
  return Response.json(row);
}

// Delete an event (admins). Body: { id }.
export async function DELETE(request: Request) {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const { id } = (await request.json().catch(() => ({}))) as { id?: string };
  if (!id || !/^\d+$/.test(id)) return Response.json({ error: "id expected" }, { status: 400 });
  await sql`delete from event where id = ${id}`;
  return Response.json({ ok: true });
}
