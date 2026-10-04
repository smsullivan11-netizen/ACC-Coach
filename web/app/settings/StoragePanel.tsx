"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StorageStats } from "@/lib/storage";

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)} MB`;

// Admins: database usage against the free plan's 0.5 GB, and compressing older traces.
export default function StoragePanel({ s }: { s: StorageStats }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const share = s.total / s.limit;
  const color = share > 0.85 ? "#e10600" : share > 0.65 ? "#ff8a00" : "#ffd200";

  async function compress() {
    setBusy(true);
    const res = await fetch("/api/storage/compress", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMessage(res.ok ? (data.left ? `${data.left} traces left: press again.` : "All traces compressed, space given back.") : data.error ?? "error");
    router.refresh();
  }

  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between text-sm">
        <span className="tabular text-white"><strong>{mb(s.total)}</strong> <span className="text-zinc-500">of {mb(s.limit)}</span></span>
        <span className="tabular text-zinc-400">{Math.round(share * 100)} %</span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, share * 100)}%`, background: color }} />
      </div>
      <div className="mt-3 grid gap-x-6 gap-y-1 text-xs text-zinc-500 sm:grid-cols-2">
        {s.tables.map((t) => (
          <div key={t.name} className="flex justify-between"><span>{t.name}</span><span className="tabular text-zinc-400">{mb(t.bytes)}</span></div>
        ))}
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        {s.traces} lap traces stored{s.avgTrace ? `, ${Math.round(s.avgTrace / 1024)} KB each on average` : ""}.
        Traces of invalid laps, out-laps and in-laps are deleted after 7 days, others after 60 days (except each driver&apos;s
        best laps and last 10 sessions); lap times and results are always kept.
      </p>
      {s.uncompressed > 0 && (
        <button onClick={compress} disabled={busy} className="btn btn-ghost mt-3">
          {busy ? "Compressing…" : `Compress ${s.uncompressed} older traces`}
        </button>
      )}
      {message && <p className="mt-2 text-sm text-accent">{message}</p>}
    </div>
  );
}
