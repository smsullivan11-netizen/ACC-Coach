"use client";

import { Link2, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Admins: import ACC server result files into the event.
export function ResultsImport({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const out: string[] = [];
    for (const file of Array.from(files)) {
      const res = await fetch(`/api/events/${eventId}/results`, { method: "POST", body: file });
      const data = await res.json().catch(() => ({}));
      out.push(res.ok ? `${file.name}: ${data.cars} cars, ${data.laps} laps, ${data.teamCars} with team drivers` : `${file.name}: ${data.error ?? "error"}`);
    }
    setMessages(out);
    setBusy(false);
    router.refresh();
  }
  return (
    <div>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/20 bg-white/[0.02] px-4 py-4 text-sm text-zinc-300 transition hover:border-race/70">
        <Upload size={18} className="text-race" />
        <span>{busy ? "Importing…" : <>Import results: the server&apos;s <code className="text-xs">.json</code> files (qualifying, race…). LFM: download the results JSON from the race page.</>}</span>
        <input type="file" accept=".json" multiple className="hidden" disabled={busy} onChange={(e) => upload(e.target.files)} />
      </label>
      {messages.map((m) => <p key={m} className="mt-1 text-xs text-zinc-400">{m}</p>)}
    </div>
  );
}

export function RemoveResults({ eventId, sessionId }: { eventId: string; sessionId: string }) {
  const router = useRouter();
  return (
    <button onClick={async () => {
      if (!confirm("Remove these results from the event?")) return;
      await fetch(`/api/events/${eventId}/results`, { method: "DELETE", body: JSON.stringify({ session_id: sessionId }) });
      router.refresh();
    }} className="text-xs text-zinc-500 hover:text-red-400" aria-label="Remove results"><Trash2 size={14} /></button>
  );
}

/** Admins: link an unrecognised driver of the results to a team member (remembered by Steam ID). */
export function LinkDriver({ steamId, members }: { steamId: string; members: [string, string][] }) {
  const router = useRouter();
  return (
    <label className="ml-2 inline-flex items-center gap-1 text-xs text-zinc-500">
      <Link2 size={12} />
      <select defaultValue="" className="rounded border border-white/10 bg-raised px-1 py-0.5 text-xs" onChange={async (e) => {
        if (!e.target.value) return;
        await fetch("/api/results/link", { method: "POST", body: JSON.stringify({ steam_id: steamId, driver_id: e.target.value }) });
        router.refresh();
      }}>
        <option value="">team member?</option>
        {members.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
      </select>
    </label>
  );
}
