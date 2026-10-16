"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Member = { id: string; display_name: string; is_admin: boolean };

// Admins: who else is admin, and recomputing all ratings from every session.
export default function AdminPanel({ members, me }: { members: Member[]; me: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function setAdmin(id: string, isAdmin: boolean) {
    const res = await fetch("/api/admins", { method: "POST", body: JSON.stringify({ driver_id: id, is_admin: isAdmin }) });
    setMessage(res.ok ? null : (await res.json()).error);
    router.refresh();
  }

  async function remove(m: Member) {
    if (!confirm(`Delete ${m.display_name} and all their sessions, laps and ratings? This cannot be undone.`)) return;
    const res = await fetch(`/api/drivers/${m.id}`, { method: "DELETE" });
    setMessage(res.ok ? `${m.display_name} deleted.` : (await res.json()).error);
    router.refresh();
  }

  // Lap traces timed on a faulty clock by apps before 0.3 (pauses, short sessions): lib/trace-repair.ts
  async function repairTraces() {
    setBusy(true);
    const res = await fetch("/api/storage/repair-traces", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    setMessage(res.ok ? `Checked ${data.checked} laps: ${data.repaired} repaired in ${data.sessions} session${data.sessions === 1 ? "" : "s"}.` : data.error);
    router.refresh();
  }

  // Reference lap times from OhneSpeed's sheet (lib/references.ts), after he updates it
  async function importReferences() {
    setBusy(true);
    const res = await fetch("/api/references/import", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    const unknown = res.ok ? (data.tabs as { unknown: string[] }[]).flatMap((t) => t.unknown) : [];
    setMessage(res.ok
      ? `Read ${data.references} reference times (sheet of ${data.sheetDate ?? "unknown date"})${unknown.length ? `; cars not recognised: ${unknown.join(", ")}` : ""}${data.adjusted?.length ? `; ${data.adjusted.length} cars corrected (older GT3s, placeholder tracks)` : ""}. Click "Recompute all ratings" to apply them.`
      : data.error);
    router.refresh();
  }

  async function testDiscord() {
    const res = await fetch("/api/discord/test", { method: "POST" });
    setMessage(res.ok ? "Test message sent: check the Discord channel." : (await res.json()).error);
  }

  // The Microsoft Store release announcement (2026-10-16): posted once, after a confirmation
  async function announceStore() {
    if (!confirm("Post \"ACC Coach is on the Microsoft Store\" with the install link in the team's Discord channel?")) return;
    const res = await fetch("/api/discord/store", { method: "POST" });
    setMessage(res.ok ? "Store announcement posted: check the Discord channel." : (await res.json()).error);
  }

  async function rebuild() {
    setBusy(true);
    const res = await fetch("/api/ratings/rebuild", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    setMessage(res.ok ? `Recomputed: ${data.rated} rated sessions out of ${data.sessions}, ${data.achievements} achievements.` : data.error);
    router.refresh();
  }

  return (
    <div className="mt-4">
      <table className="data-table">
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td className="text-white">{m.display_name}</td>
              <td className="text-right">
                <label className="inline-flex items-center gap-2 text-zinc-400">
                  <input type="checkbox" checked={m.is_admin} onChange={(e) => setAdmin(m.id, e.target.checked)}
                         disabled={m.id === me && m.is_admin && members.filter((x) => x.is_admin).length === 1}
                         className="accent-[#ffd200]" />
                  admin
                </label>
              </td>
              <td className="w-20 text-right">
                {m.id !== me && (
                  <button onClick={() => remove(m)} className="text-xs text-zinc-500 hover:text-red-400">Delete</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={rebuild} disabled={busy}
              className="btn btn-ghost mt-4">
        {busy ? "Recomputing…" : "Recompute all ratings"}
      </button>
      <button onClick={repairTraces} disabled={busy} className="btn btn-ghost ml-2 mt-4">Repair lap traces</button>
      <button onClick={importReferences} disabled={busy} className="btn btn-ghost ml-2 mt-4">Update reference times</button>
      <button onClick={testDiscord} disabled={busy} className="btn btn-ghost ml-2 mt-4">Test the Discord channel</button>
      <button onClick={announceStore} disabled={busy} className="btn btn-ghost ml-2 mt-4">Announce the Store release on Discord</button>
      <p className="mt-1 text-xs text-zinc-500">
        Recompute: replays every session in upload order with today&apos;s targets: ratings, then achievements (nothing is posted to Discord).
        Repair: fixes the traces of laps recorded by apps before 0.3 whose clock counted a game pause or ran off (replay, charts, coach); lap times do not change.
        Update reference times: reads OhneSpeed&apos;s spreadsheet again after he updates it (the ratings&apos; 101 % targets, default and LFM BoP).
      </p>
      {message && <p className="mt-2 text-sm text-accent">{message}</p>}
    </div>
  );
}
