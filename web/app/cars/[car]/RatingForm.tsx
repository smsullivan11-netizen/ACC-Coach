"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CAR_PARTS, type CarPart } from "@/lib/cars";

type Values = Record<CarPart, number | null> & { note: string | null; source: string | null };

// Admins: rate a car (0-100 per sub-rating, empty = not rated), with a note and a source.
export default function RatingForm({ car, initial }: { car: string; initial: Partial<Values> | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<Values>(() => ({
    ...(Object.fromEntries(CAR_PARTS.map((p) => [p.key, initial?.[p.key] ?? null])) as Record<CarPart, number | null>),
    note: initial?.note ?? "", source: initial?.source ?? "",
  }));

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/cars/${car}/rating`, { method: "POST", body: JSON.stringify(v) });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? `error ${res.status}`);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost mt-4">
        <Pencil size={14} /> Edit the ratings
      </button>
    );
  }
  return (
    <div className="mt-5 space-y-3 rounded-lg border border-white/10 bg-black/30 p-4">
      <p className="text-xs text-zinc-500">Admins only. 0-100 each; leave a box empty if you don&apos;t know.</p>
      {CAR_PARTS.map((p) => (
        <label key={p.key} className="flex items-center gap-3 text-sm text-zinc-300">
          <span className="w-28 shrink-0">{p.label}</span>
          <input type="range" min={0} max={100} value={v[p.key] ?? 0} aria-label={p.label}
                 onChange={(e) => setV({ ...v, [p.key]: Number(e.target.value) })}
                 className={`min-w-0 flex-1 accent-[var(--color-accent)] ${v[p.key] == null ? "opacity-30" : ""}`} />
          <input type="number" min={0} max={100} value={v[p.key] ?? ""} placeholder="–"
                 onChange={(e) => setV({ ...v, [p.key]: e.target.value === "" ? null : Math.max(0, Math.min(100, Math.round(Number(e.target.value)))) })}
                 className="input w-16 py-1 text-right" />
        </label>
      ))}
      <label className="block text-sm text-zinc-300">
        Note <span className="text-xs text-zinc-500">(strengths, weaknesses, tips)</span>
        <textarea value={v.note ?? ""} onChange={(e) => setV({ ...v, note: e.target.value })} rows={3} maxLength={1500} className="input mt-1 w-full" />
      </label>
      <label className="block text-sm text-zinc-300">
        Source <span className="text-xs text-zinc-500">(own knowledge, a sheet, a video link…)</span>
        <input value={v.source ?? ""} onChange={(e) => setV({ ...v, source: e.target.value })} maxLength={300} className="input mt-1 w-full" />
      </label>
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={busy} className="btn btn-primary">{busy ? "Saving…" : "Save"}</button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className="btn btn-ghost">Cancel</button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  );
}
