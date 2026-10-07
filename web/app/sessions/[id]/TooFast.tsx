"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Admins, on a lap flagged "too fast" (lib/too-fast.ts): "Not a cut" clears it for good; on a lap
// cleared that way: "Flag again".
export default function TooFast({ lapId, cleared }: { lapId: string; cleared: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function set(ok: boolean) {
    if (ok && !confirm("Mark this lap as real (not a cut)? It will count for pace, leaderboards and records.")) return;
    setBusy(true);
    await fetch(`/api/laps/${lapId}/too-fast`, { method: "POST", body: JSON.stringify({ ok }) });
    setBusy(false);
    router.refresh();
  }
  return (
    <button onClick={() => set(!cleared)} disabled={busy} className="text-[11px] text-zinc-400 underline hover:text-white disabled:opacity-50">
      {busy ? "Updating…" : cleared ? "Flag again" : "Not a cut"}
    </button>
  );
}
