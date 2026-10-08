"use client";

import { Download, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { KINDS } from "@/lib/setups";

// Download (everyone) and, for the uploader or an admin, edit and delete.
export default function Actions({ id, title, kind, notes, canEdit }: { id: string; title: string; kind: string; notes: string; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState({ title, kind, notes });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "PATCH" | "DELETE") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/setups/${id}`, { method, body: method === "PATCH" ? JSON.stringify(v) : undefined });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? `error ${res.status}`);
    if (method === "DELETE") return router.push("/setups");
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <a href={`/api/setups/${id}/download`} className="btn btn-primary"><Download size={15} /> Download the setup</a>
        {canEdit && !editing && (
          <>
            <button type="button" onClick={() => setEditing(true)} className="btn btn-ghost"><Pencil size={14} /> Edit</button>
            <button type="button" disabled={busy} onClick={() => confirm("Delete this setup for everyone?") && call("DELETE")} className="btn btn-ghost text-red-300"><Trash2 size={14} /> Delete</button>
          </>
        )}
      </div>
      {editing && (
        <div className="max-w-xl space-y-3 rounded-lg border border-white/10 bg-black/30 p-4">
          <label className="block text-sm text-zinc-300">Title
            <input value={v.title} maxLength={120} onChange={(e) => setV({ ...v, title: e.target.value })} className="input mt-1 w-full" />
          </label>
          <label className="block text-sm text-zinc-300">Type
            <select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })} className="input mt-1 w-full">
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
          <label className="block text-sm text-zinc-300">Notes
            <textarea value={v.notes} rows={3} maxLength={1500} onChange={(e) => setV({ ...v, notes: e.target.value })} className="input mt-1 w-full" />
          </label>
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy} onClick={() => call("PATCH")} className="btn btn-primary">{busy ? "Saving…" : "Save"}</button>
            <button type="button" disabled={busy} onClick={() => setEditing(false)} className="btn btn-ghost">Cancel</button>
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
        </div>
      )}
      {!editing && error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
