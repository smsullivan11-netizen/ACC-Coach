"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Init = {
  id?: string; title?: string; track_key?: string; car_class?: string; starts_at?: string; duration_min?: number; kind?: string;
  league?: string | null; server?: string | null; notes?: string | null; min_pit_stops?: number; max_stint_min?: number | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const localInput = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date(Date.now() + 7 * 86_400_000);
  if (!iso) d.setHours(20, 0, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Admins: create or edit an event. The date is typed in the admin's own time zone.
export default function EventForm({ tracks, init, onDone }: { tracks: [string, string][]; init?: Init; onDone?: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({
    title: init?.title ?? "", track_key: init?.track_key ?? tracks[0]?.[0] ?? "", car_class: init?.car_class ?? "GT3",
    when: localInput(init?.starts_at), duration_min: String(init?.duration_min ?? 60), kind: init?.kind ?? "sprint",
    league: init?.league ?? "", server: init?.server ?? "", notes: init?.notes ?? "",
    min_pit_stops: String(init?.min_pit_stops ?? 0), max_stint_min: init?.max_stint_min ? String(init.max_stint_min) : "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/events", {
      method: "POST",
      body: JSON.stringify({
        id: init?.id, ...f, starts_at: new Date(f.when).toISOString(), duration_min: Number(f.duration_min),
        min_pit_stops: Number(f.min_pit_stops), max_stint_min: f.max_stint_min ? Number(f.max_stint_min) : null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "error");
    onDone?.();
    if (init?.id) router.refresh();
    else router.push(`/events/${data.id}`);
  }

  const label = "text-xs uppercase tracking-wider text-zinc-500";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="sm:col-span-2"><div className={label}>Title</div>
        <input value={f.title} onChange={set("title")} placeholder="LFM Pro Series · Round 3" className="input mt-1 w-full" /></label>
      <label><div className={label}>Track</div>
        <select value={f.track_key} onChange={set("track_key")} className="input mt-1 w-full">
          {tracks.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select></label>
      <label><div className={label}>Start (your time)</div>
        <input type="datetime-local" value={f.when} onChange={set("when")} className="input mt-1 w-full" /></label>
      <label><div className={label}>Race length (minutes)</div>
        <input type="number" min={1} value={f.duration_min} onChange={set("duration_min")} className="input mt-1 w-full" /></label>
      <label><div className={label}>Format</div>
        <select value={f.kind} onChange={set("kind")} className="input mt-1 w-full">
          <option value="sprint">Sprint (one driver per car)</option>
          <option value="endurance">Endurance (driver swaps)</option>
        </select></label>
      <label><div className={label}>Class</div>
        <input value={f.car_class} onChange={set("car_class")} className="input mt-1 w-full" /></label>
      <label><div className={label}>League</div>
        <input value={f.league} onChange={set("league")} placeholder="LFM, team practice…" className="input mt-1 w-full" /></label>
      <label><div className={label}>Mandatory pit stops</div>
        <input type="number" min={0} value={f.min_pit_stops} onChange={set("min_pit_stops")} className="input mt-1 w-full" /></label>
      <label><div className={label}>Max stint (minutes, optional)</div>
        <input type="number" min={1} value={f.max_stint_min} onChange={set("max_stint_min")} className="input mt-1 w-full" /></label>
      <label className="sm:col-span-2"><div className={label}>Server / how to join</div>
        <input value={f.server} onChange={set("server")} className="input mt-1 w-full" /></label>
      <label className="sm:col-span-2"><div className={label}>Notes</div>
        <textarea value={f.notes} onChange={set("notes")} rows={3} placeholder="Setup, briefing time, rules…" className="input mt-1 w-full" /></label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button onClick={save} disabled={busy} className="btn btn-primary">{busy ? "Saving…" : init?.id ? "Save changes" : "Create event"}</button>
        {error && <span className="text-sm text-red-400">{error}</span>}
        {init?.id && (
          <button onClick={async () => {
            if (!confirm("Delete this event, its sign-ups, line-up and results?")) return;
            await fetch("/api/events", { method: "DELETE", body: JSON.stringify({ id: init.id }) });
            router.push("/events");
          }} className="btn btn-danger ml-auto">Delete event</button>
        )}
      </div>
    </div>
  );
}
