"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Delete this session (admins, or the session's driver), after a confirmation.
export default function DeleteSession({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!confirm("Delete this session, its laps and their telemetry? Ratings are recalculated. This cannot be undone.")) return;
    setBusy(true);
    const res = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
    if (res.ok) router.push("/sessions");
    else { setBusy(false); alert((await res.json().catch(() => ({}))).error ?? `error ${res.status}`); }
  }
  return (
    <button onClick={remove} disabled={busy} className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-red-400 disabled:opacity-50">
      <Trash2 size={14} /> {busy ? "Deleting…" : "Delete session"}
    </button>
  );
}
