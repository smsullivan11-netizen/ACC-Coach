"use client";

import Link from "next/link";
import { useState } from "react";

type Result = { file: string; ok: boolean; message: string; sessionId?: string };

export default function UploadForm() {
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      try {
        const res = await fetch("/api/upload", { method: "POST", body: file });
        const data = await res.json();
        setResults((r) => [
          ...r,
          res.ok
            ? { file: file.name, ok: true, message: `${data.laps} laps imported`, sessionId: data.session_id }
            : { file: file.name, ok: false, message: data.error ?? `error ${res.status}` },
        ]);
      } catch {
        setResults((r) => [...r, { file: file.name, ok: false, message: "network error" }]);
      }
    }
    setBusy(false);
  }

  return (
    <div>
      <label className="mt-4 flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-white/20 bg-white/[0.02] px-6 py-10 text-center transition hover:border-race/70 hover:bg-race/[0.04]">
        <span className="text-white">{busy ? "Uploading…" : "Choose session bundles (.json.gz)"}</span>
        <span className="mt-1 text-sm text-zinc-500">made with acc_telemetry.py --bundle</span>
        <input type="file" accept=".gz,.json" multiple className="hidden" disabled={busy}
               onChange={(e) => upload(e.target.files)} />
      </label>
      <ul className="mt-4 space-y-1 text-sm">
        {results.map((r, i) => (
          <li key={i} className={r.ok ? "text-emerald-400" : "text-red-400"}>
            {r.file}: {r.message}{" "}
            {r.sessionId && <Link href={`/sessions/${r.sessionId}`} className="underline">open</Link>}
          </li>
        ))}
      </ul>
    </div>
  );
}
