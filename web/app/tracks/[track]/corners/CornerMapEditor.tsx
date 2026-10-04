"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import TrackSurface, { type Edges } from "@/components/TrackSurface";
import type { MapCorner, Proposal } from "@/lib/corners";
import { lapTime } from "@/lib/format";
import { labelPoint } from "@/lib/geometry";

type Line = { x: number[]; z: number[] };
type Preview = { proposal: Proposal; laps: { id: string; driver: string; time_ms: number }[]; next_version: number; same_as_current: boolean };
const DETAILS = [["fewer", "Fewer corners"], ["normal", "Normal"], ["more", "More corners"]] as const;

// The track's corner map: drawing and table; admins rename corners and rebuild the map from the
// team's laps (preview first, then publish as a new version).
export default function CornerMapEditor({ track, isAdmin, info, map, line, edges }: {
  track: string;
  isAdmin: boolean;
  info: string;
  map: { version: number; length_m: number; corners: MapCorner[] };
  line: Line | null;
  edges: Edges;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [detail, setDetail] = useState<string>("normal");
  const [names, setNames] = useState<Record<number, string>>({});
  const [hover, setHover] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const shown = preview
    ? { length_m: preview.proposal.length_m, corners: preview.proposal.corners, line: preview.proposal.line }
    : { length_m: map.length_m, corners: map.corners, line };
  const dirty = Object.keys(names).length > 0;

  async function call(path: string, body: unknown) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/corner-maps/${track}/${path}`, { method: "POST", body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({ error: `error ${res.status}` }));
    setBusy(false);
    if (!res.ok) setMessage(data.error ?? `error ${res.status}`);
    return res.ok ? data : null;
  }

  async function saveNames() {
    if (await call("names", { names })) {
      setNames({});
      setMessage("Names saved.");
      router.refresh();
    }
  }

  async function showPreview() {
    const data = await call("preview", { detail });
    if (data) setPreview(data);
  }

  async function publish() {
    if (!preview) return;
    if (!confirm(`Publish version ${preview.next_version}? Every lap's corner results are recomputed with it, and the app uses it for new sessions. Corner numbers may change.`)) return;
    const data = await call("publish", { detail });
    if (data) {
      setPreview(null);
      setMessage(data.unchanged
        ? `Same corners as version ${data.version}: nothing published.`
        : `Version ${data.version} published: ${data.corners} corners, ${data.recomputed} laps recomputed.`);
      router.refresh();
    }
  }

  return (
    <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_460px]">
      <div>
        {shown.line ? (
          <TrackDrawing line={shown.line} length={shown.length_m} corners={shown.corners} hover={hover} edges={edges} />
        ) : (
          <p className="text-sm text-zinc-500">No lap with car positions on this track yet (MoTeC imports have none).</p>
        )}
      </div>
      <div className="min-w-0">
        {preview ? (
          <div className="rounded-lg border border-accent/50 bg-accent/10 p-4 text-sm text-zinc-200">
            <strong className="text-accent">Preview of version {preview.next_version}</strong>, not published:{" "}
            {preview.proposal.corners.length} corners from {preview.laps.length} lap{preview.laps.length > 1 ? "s" : ""}
            {" "}({preview.laps.map((l) => `${l.driver} ${lapTime(l.time_ms)}`).join(", ")}).
            {preview.same_as_current && <p className="mt-2 text-zinc-300">Same corners as the current version: nothing to publish.</p>}
            <div className="mt-3 flex gap-2">
              {!preview.same_as_current && (
                <button onClick={publish} disabled={busy}
                        className="btn btn-primary">
                  {busy ? "Publishing…" : `Publish version ${preview.next_version}`}
                </button>
              )}
              <button onClick={() => setPreview(null)} disabled={busy} className="btn btn-ghost">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">{info}</p>
        )}

        <div className="card mt-4 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Corner</th>
              <th>Name</th>
              <th>Turn</th>
              <th className="text-right">From – to</th>
            </tr>
          </thead>
          <tbody>
            {shown.corners.map((c) => (
              <tr key={c.id}
                  onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)}>
                <td className="font-medium text-white">T{c.id}</td>
                <td>
                  {isAdmin && !preview ? (
                    <input value={names[c.id] ?? c.name ?? ""} placeholder="name" maxLength={40}
                           onChange={(e) => setNames({ ...names, [c.id]: e.target.value })}
                           className="input w-40 py-1 placeholder:text-zinc-600" />
                  ) : (
                    <span className="text-zinc-300">{c.name ?? ""}</span>
                  )}
                </td>
                <td className="text-zinc-400">{c.turn_deg == null ? "–" : `${c.turn_deg > 0 ? "right" : "left"} ${Math.abs(c.turn_deg)}°`}</td>
                <td className="text-right text-zinc-400">{Math.round(c.start_m)}–{Math.round(c.end_m)} m</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {isAdmin && !preview && (
          <>
            {dirty && (
              <button onClick={saveNames} disabled={busy}
                      className="btn btn-primary mt-3">
                Save names
              </button>
            )}
            <div className="card card-red mt-6 p-4 text-sm">
              <p className="font-medium text-white">Rebuild from the team&apos;s laps</p>
              <p className="mt-1 text-zinc-400">
                Uses the best clean laps recorded with the app (up to 10, several drivers). Names carry over to corners that
                stay in place. Rebuild when more laps are in, or if corners are missing or merged.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <select value={detail} onChange={(e) => setDetail(e.target.value)}
                        className="input">
                  {DETAILS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <button onClick={showPreview} disabled={busy}
                        className="btn btn-ghost">
                  {busy ? "Building…" : "Preview"}
                </button>
              </div>
            </div>
          </>
        )}
        {message && <p className="mt-3 text-sm text-accent">{message}</p>}
      </div>
    </div>
  );
}

function TrackDrawing({ line, length, corners, hover, edges }: { line: Line; length: number; corners: MapCorner[]; hover: number | null; edges: Edges }) {
  const n = line.x.length;
  const x0 = Math.min(...line.x), x1 = Math.max(...line.x), z0 = Math.min(...line.z), z1 = Math.max(...line.z);
  const size = Math.max(x1 - x0, z1 - z0);
  const pad = size * 0.08;
  const at = (m: number) => Math.min(n - 1, Math.max(0, Math.round((m / length) * n)));
  const span = Math.max(2, Math.round((15 * n) / length));
  const pts = (from: number, to: number) => {
    const p: string[] = [];
    for (let i = from; i <= to; i++) p.push(`${line.x[i]},${line.z[i]}`);
    return p.join(" ");
  };
  const h = hover == null ? null : corners.find((c) => c.id === hover);
  return (
    <svg viewBox={`${x0 - pad} ${z0 - pad} ${x1 - x0 + 2 * pad} ${z1 - z0 + 2 * pad}`}
         className="card h-auto max-h-[75vh] w-full">
      <TrackSurface edges={edges} />
      <polyline points={pts(0, n - 1)} fill="none" stroke={edges ? "#71717a" : "#52525b"} strokeWidth={edges ? 1 : 2}
                vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {h && <polyline points={pts(at(h.start_m), at(h.end_m))} fill="none" stroke="#ffd200" strokeWidth={4}
                      vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
      {corners.map((c) => {
        const i = at(c.start_m);
        return <circle key={`b${c.id}`} cx={line.x[i]} cy={line.z[i]} r={size / 220} fill="#71717a" />;
      })}
      {corners.map((c) => {
        const i = at(c.apex_m);
        const p = labelPoint(line.x, line.z, i, size / 28, span);
        const on = c.id === hover;
        return (
          <g key={c.id}>
            <circle cx={line.x[i]} cy={line.z[i]} r={size / 160} fill="#ffd200" />
            <text x={p.x} y={p.z} fontSize={size / (on ? 26 : 32)} fill={on ? "#ffd200" : "#d4d4d8"} fontWeight={on ? 700 : 400}
                  textAnchor="middle" dominantBaseline="central">
              T{c.id}
            </text>
          </g>
        );
      })}
      <rect x={line.x[0] - size / 120} y={line.z[0] - size / 120} width={size / 60} height={size / 60} fill="#e5e7eb" />
    </svg>
  );
}
