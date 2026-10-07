"use client";

import { Scale } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Option = { value: string; label: string; weights: string };

// What kind of running the session was, for the rating weights: ACC's session type by default, or
// chosen afterwards (a practice session can be a qualifying or race simulation).
export default function RatingType({ sessionId, chosen, accLabel, options }: {
  sessionId: string; chosen: string | null; accLabel: string; options: Option[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auto = options.find((o) => o.value === "")!;
  const current = options.find((o) => o.value === (chosen ?? "")) ?? auto;

  async function change(value: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/sessions/${sessionId}/rating-type`, { method: "POST", body: JSON.stringify({ type: value || null }) });
    setBusy(false);
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? `error ${res.status}`);
    router.refresh();
  }

  return (
    <div className="card rise mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm">
      <span className="flex items-center gap-2 text-zinc-300"><Scale size={15} className="text-race" /> Session type for the rating</span>
      <select value={chosen ?? ""} disabled={busy} onChange={(e) => change(e.target.value)} className="input py-1" aria-label="Session type for the rating">
        {options.map((o) => <option key={o.value} value={o.value}>{o.value === "" ? `Automatic (ACC: ${accLabel})` : o.label}</option>)}
      </select>
      <span className="text-xs text-zinc-500">Weights: {current.weights}</span>
      {busy && <span className="text-xs text-accent">Updating the ratings…</span>}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
