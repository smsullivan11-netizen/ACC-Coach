"use client";

import { Check, CircleHelp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const OPTIONS = [
  { status: "yes", label: "I'm in", icon: Check, on: "bg-emerald-500 text-ink border-emerald-500" },
  { status: "maybe", label: "Maybe", icon: CircleHelp, on: "bg-accent text-ink border-accent" },
  { status: "no", label: "Can't", icon: X, on: "bg-race text-white border-race" },
] as const;

// My answer for an event; on the event page also the car I plan to drive.
export default function SignUp({ eventId, status, car, cars }: { eventId: string; status: string | null; car?: string | null; cars?: [string, string][] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function send(next: string | null, carKey = car ?? null) {
    setBusy(true);
    await fetch(`/api/events/${eventId}/entry`, { method: "POST", body: JSON.stringify({ status: next, car_key: carKey }) });
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {OPTIONS.map(({ status: s, label, icon: Icon, on }) => (
        <button key={s} disabled={busy} onClick={() => send(status === s ? null : s)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                  status === s ? on : "border-white/15 text-zinc-300 hover:bg-white/5"}`}>
          <Icon size={14} /> {label}
        </button>
      ))}
      {cars && status === "yes" && (
        <select value={car ?? ""} onChange={(e) => send(status, e.target.value || null)} className="input py-1.5" aria-label="Car">
          <option value="">Car…</option>
          {cars.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
      )}
    </div>
  );
}
