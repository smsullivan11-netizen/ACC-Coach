"use client";

import { useEffect, useState } from "react";

type Token = { id: string; label: string; created_at: string; last_used_at: string | null };

const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "never");

export default function Tokens() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [label, setLabel] = useState("My PC");
  const [created, setCreated] = useState<string | null>(null);

  const load = () => fetch("/api/tokens").then((r) => r.json()).then(setTokens);
  useEffect(() => {
    load();
  }, []);

  async function create() {
    const res = await fetch("/api/tokens", { method: "POST", body: JSON.stringify({ label }) });
    const data = await res.json();
    setCreated(data.token);
    load();
  }

  async function revoke(id: string) {
    await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60}
               className="rounded border border-white/15 bg-transparent px-3 py-1.5 text-sm" />
        <button onClick={create} className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-ink hover:brightness-110">
          Create upload token
        </button>
      </div>
      {created && (
        <div className="mt-3 rounded border border-accent/40 bg-accent/10 p-3 text-sm">
          <div className="text-accent">Copy it now: it will not be shown again.</div>
          <code className="mt-1 block break-all text-white">{created}</code>
        </div>
      )}
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-zinc-500">
          <tr className="border-b border-white/10">
            <th className="py-2 font-normal">Label</th>
            <th className="font-normal">Created</th>
            <th className="font-normal">Last used</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => (
            <tr key={t.id} className="border-b border-white/5">
              <td className="py-2">{t.label}</td>
              <td className="text-zinc-400">{day(t.created_at)}</td>
              <td className="text-zinc-400">{day(t.last_used_at)}</td>
              <td className="text-right">
                <button onClick={() => revoke(t.id)} className="text-zinc-500 hover:text-red-400">Revoke</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
