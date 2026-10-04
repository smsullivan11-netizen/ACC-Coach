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
               className="input" />
        <button onClick={create} className="btn btn-primary">
          Create upload token
        </button>
      </div>
      {created && (
        <div className="mt-3 rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm">
          <div className="text-accent">Copy it now: it will not be shown again.</div>
          <code className="mt-1 block break-all text-white">{created}</code>
        </div>
      )}
      <table className="data-table mt-4">
        <thead>
          <tr>
            <th>Label</th>
            <th>Created</th>
            <th>Last used</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => (
            <tr key={t.id}>
              <td className="text-white">{t.label}</td>
              <td className="text-zinc-400">{day(t.created_at)}</td>
              <td className="text-zinc-400">{day(t.last_used_at)}</td>
              <td className="text-right">
                <button onClick={() => revoke(t.id)} className="btn btn-danger px-2.5 py-1 text-xs">Revoke</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
