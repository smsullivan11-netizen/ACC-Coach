"use client";

import { Scale3d } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import BopBadge, { type BopInfo } from "@/components/Bop";

// The session's BoP (user's request, 2026-10-07; lib/references.ts): detected (offline = default;
// an LFM server, named in ACC's log since app 0.4 = LFM), or chosen by the team like the session type.
// It picks the reference time of the rating and the leaderboard badge. Also shows the server and the
// reference for this car and track.
export default function SessionBop({ sessionId, chosen, detected, server, info, reference }: {
  sessionId: string; chosen: string | null; detected: string; server: string | null; info: BopInfo;
  reference: { car: string; sheet: string; target: string; source: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(value: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/sessions/${sessionId}/bop`, { method: "POST", body: JSON.stringify({ bop: value || null }) });
    setBusy(false);
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? `error ${res.status}`);
    router.refresh();
  }

  return (
    <div className="card rise mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm">
      <span className="flex items-center gap-2 text-zinc-300"><Scale3d size={15} className="text-race" /> BoP</span>
      <select value={chosen ?? ""} disabled={busy} onChange={(e) => change(e.target.value)} className="input py-1" aria-label="Balance of performance">
        <option value="">Automatic ({detected === "lfm" ? "LFM BoP" : "Default BoP"})</option>
        <option value="default">Default BoP</option>
        <option value="lfm">LFM BoP</option>
      </select>
      <BopBadge info={info} short={false} />
      {server && <span className="truncate text-xs text-zinc-500" title="The server the session was driven on (from ACC's log)">Server: {server}</span>}
      {reference && (
        <span className="text-xs text-zinc-400" title={`${reference.source}: rating target = 101 %`}>
          Reference {reference.car}: <span className="tabular text-zinc-200">{reference.sheet}</span>
          {" "}→ target 101 % <span className="tabular font-semibold text-white">{reference.target}</span>
          <span className="text-zinc-500"> ({reference.source})</span>
        </span>
      )}
      {busy && <span className="text-xs text-accent">Updating the ratings…</span>}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
