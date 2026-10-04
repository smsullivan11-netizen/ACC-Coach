"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { lapTime, REASONS } from "@/lib/format";

export type EdgeStatus = { side: "left" | "right"; lap_id: string | null; driver: string | null; number: number | null; date: string | null };
export type EdgeCandidate = { id: string; driver: string; number: number; time_ms: number; date: string; excluded_reasons: string[] };

// Track edges: which laps draw the white lines, and (admins) picking edge laps among recent laps.
export default function EdgesPanel({ track, isAdmin, status, candidates }: {
  track: string;
  isAdmin: boolean;
  status: EdgeStatus[];
  candidates: EdgeCandidate[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const bySide = (side: "left" | "right") => status.find((s) => s.side === side && s.lap_id);

  async function set(side: "left" | "right", lapId: string | null) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/tracks/${track}/edges`, { method: "POST", body: JSON.stringify({ side, lap_id: lapId }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMessage(res.ok ? (lapId ? `${side === "left" ? "Left" : "Right"} edge set.` : "Edge cleared.") : data.error ?? `error ${res.status}`);
    router.refresh();
  }

  return (
    <section className="mt-10 max-w-4xl">
      <h2 className="font-medium text-white">Track edges</h2>
      <p className="mt-1 text-sm text-zinc-400">
        ACC does not share where the track ends, so the track surface on the maps comes from two laps driven slowly along the
        white lines: one with the <strong className="text-zinc-200">left</strong> wheels on the line, one with the{" "}
        <strong className="text-zinc-200">right</strong> wheels on it (left and right in the driving direction). Drive them
        in their own practice session with the app running, then pick them here. Edge laps are left out of leaderboards,
        ratings and corner maps.
      </p>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        {(["left", "right"] as const).map((side) => {
          const s = bySide(side);
          return (
            <div key={side} className="rounded-md border border-white/10 px-3 py-2">
              <span className="text-zinc-400">{side === "left" ? "Left" : "Right"} edge: </span>
              {s ? (
                <>
                  <span className="text-white">{s.driver} · L{s.number}</span>
                  <span className="text-zinc-500"> · {s.date}</span>
                  {isAdmin && (
                    <button onClick={() => set(side, null)} disabled={busy} className="ml-3 text-xs text-zinc-500 underline hover:text-red-400">
                      clear
                    </button>
                  )}
                </>
              ) : (
                <span className="text-zinc-500">not recorded yet</span>
              )}
            </div>
          );
        })}
      </div>
      {isAdmin && (
        <>
          <p className="mt-5 text-sm text-zinc-400">Recent laps on this track (with car positions):</p>
          <table className="tabular mt-1 w-full text-sm">
            <tbody>
              {candidates.map((c) => {
                const used = status.find((s) => s.lap_id === c.id);
                return (
                  <tr key={c.id} className="border-b border-white/5">
                    <td className="py-1.5 text-zinc-500">{c.date}</td>
                    <td className="text-white">{c.driver}</td>
                    <td className="text-zinc-300">L{c.number}</td>
                    <td className="text-zinc-300">{lapTime(c.time_ms)}</td>
                    <td className="text-xs text-zinc-500">{c.excluded_reasons.map((r) => REASONS[r] ?? r).join(", ")}</td>
                    <td className="text-right">
                      {used ? (
                        <span className="text-xs text-accent">{used.side} edge</span>
                      ) : (
                        <span className="flex justify-end gap-2">
                          <button onClick={() => set("left", c.id)} disabled={busy}
                                  className="rounded border border-white/15 px-2 py-0.5 text-xs hover:bg-white/5 disabled:opacity-50">Left edge</button>
                          <button onClick={() => set("right", c.id)} disabled={busy}
                                  className="rounded border border-white/15 px-2 py-0.5 text-xs hover:bg-white/5 disabled:opacity-50">Right edge</button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!candidates.length && <p className="mt-1 text-sm text-zinc-500">No lap with car positions yet.</p>}
        </>
      )}
      {message && <p className="mt-3 text-sm text-accent">{message}</p>}
    </section>
  );
}
