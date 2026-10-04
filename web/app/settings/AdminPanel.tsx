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

  async function rebuild() {
    setBusy(true);
    const res = await fetch("/api/ratings/rebuild", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    setMessage(res.ok ? `Ratings recomputed: ${data.rated} rated sessions out of ${data.sessions}.` : data.error);
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
      <p className="mt-1 text-xs text-zinc-500">
        Replays every session in upload order with today&apos;s targets: for sessions uploaded before ratings existed.
      </p>
      {message && <p className="mt-2 text-sm text-accent">{message}</p>}
    </div>
  );
}
