"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CAR_PARTS, TOP_SPEED_WINGS, type CarPart, type WingKey } from "@/lib/cars";

type Values = Record<CarPart | WingKey, number | null> & { note: string | null; source: string | null };

// Admins: rate a car (0-100 per sub-rating, empty = not rated), with a note and a source.
export default function RatingForm({ car, initial }: { car: string; initial: Partial<Values> | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<Values>(() => ({
    ...(Object.fromEntries([...CAR_PARTS, ...TOP_SPEED_WINGS].map((p) => [p.key, initial?.[p.key] ?? null])) as Record<CarPart | WingKey, number | null>),
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
      <p className="text-xs text-zinc-500">Admins only. 0-100 each; leave a box empty if you don&apos;t know. Under Top speed: the absolute top speed at min wing and at max wing, in km/h.</p>
      {CAR_PARTS.map((p) => (
        <div key={p.key}>
          <div className="flex items-center justify-between gap-3 text-sm text-zinc-300">
            <label htmlFor={`r-${p.key}`}>{p.label}</label>
            <input id={`r-${p.key}`} type="number" min={0} max={100} value={v[p.key] ?? ""} placeholder="–"
                   onChange={(e) => setV({ ...v, [p.key]: e.target.value === "" ? null : Math.max(0, Math.min(100, Math.round(Number(e.target.value)))) })}
                   className="input w-20 py-1 text-right" />
          </div>
          {/* The slider under the label and number: full width, so it is big enough to use */}
          <input type="range" min={0} max={100} value={v[p.key] ?? 0} aria-label={`${p.label} slider`}
                 onChange={(e) => setV({ ...v, [p.key]: Number(e.target.value) })}
                 style={{ "--fill": `${v[p.key] ?? 0}%` } as React.CSSProperties}
                 className={`range-lg mt-1 w-full ${v[p.key] == null ? "opacity-40" : ""}`} />
          {p.key === "top_speed" && (
            // Under the rating: the absolute top speed at min wing and at max wing, in km/h
            <div className="mt-2 space-y-1.5 pl-3">
              {TOP_SPEED_WINGS.map((x) => (
                <label key={x.key} className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                  <span>{x.label}</span>
                  <span className="flex items-center gap-1">
                    <input type="number" min={100} max={500} value={v[x.key] ?? ""} placeholder="–" aria-label={`${x.label} top speed in km/h`}
                           onChange={(e) => setV({ ...v, [x.key]: e.target.value === "" ? null : Math.round(Number(e.target.value)) })}
                           className="input w-20 py-1 text-right text-sm" />
                    <span className="text-zinc-500">km/h</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
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
