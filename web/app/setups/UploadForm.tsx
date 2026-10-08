"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { KINDS } from "@/lib/setups";

type Result = { added: { id: string; name: string }[]; duplicates: string[]; errors: { name: string; error: string }[] };

// Upload ACC setup files (everyone, user's choice for now): one or many .json files at once for one
// track. The car comes from each file; the type is guessed from the file name (Q, R, wet…) unless chosen.
export default function UploadForm({ tracks, defaultTrack }: { tracks: { value: string; label: string }[]; defaultTrack: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [track, setTrack] = useState(defaultTrack);
  const [kind, setKind] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const payload = await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
      const res = await fetch("/api/setups", { method: "POST", body: JSON.stringify({ track, kind: kind || undefined, notes, files: payload }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error ?? `error ${res.status}`);
      setResult(body);
      setFiles([]);
      if (input.current) input.current.value = "";
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="btn btn-primary"><Upload size={15} /> Upload setups</button>;
  }
  return (
    <div className="card rise w-full max-w-2xl space-y-3 p-5">
      <p className="text-xs text-zinc-500">
        ACC&apos;s setup files are in <code className="rounded bg-white/10 px-1 py-0.5">Documents\Assetto Corsa Competizione\Setups\&lt;car&gt;\&lt;track&gt;</code>. Pick one or several <code>.json</code> files for the same track; the car is read from each file.
      </p>
      <input ref={input} type="file" accept=".json,application/json" multiple onChange={(e) => setFiles([...(e.target.files ?? [])])}
             className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-white" />
      <div className="flex flex-wrap gap-3">
        <label className="text-sm text-zinc-300">Track
          <select value={track} onChange={(e) => setTrack(e.target.value)} className="input ml-2 py-1.5">
            <option value="">Choose…</option>
            {tracks.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="text-sm text-zinc-300">Type
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="input ml-2 py-1.5">
            <option value="">From the file name</option>
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm text-zinc-300">Notes <span className="text-xs text-zinc-500">(optional: conditions, tyre pressures to adjust, lap time…)</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1500} className="input mt-1 w-full" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy || !files.length || !track} onClick={send} className="btn btn-primary">
          {busy ? "Uploading…" : `Upload ${files.length || ""} ${files.length === 1 ? "file" : "files"}`.replace("  ", " ")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">Close</button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
      {result && (
        <ul className="space-y-1 text-sm">
          {result.added.length > 0 && <li className="text-emerald-300">{result.added.length} added.</li>}
          {result.duplicates.length > 0 && <li className="text-zinc-400">{result.duplicates.length} already in the library (same car, track and values): {result.duplicates.join(", ")}.</li>}
          {result.errors.map((e) => <li key={e.name} className="text-red-400">{e.name}: {e.error}</li>)}
        </ul>
      )}
    </div>
  );
}
