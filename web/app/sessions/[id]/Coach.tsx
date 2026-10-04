import Link from "next/link";
import type { Coaching, CornerCoaching, Tone } from "@/lib/coaching";

const TONES: Record<Tone, { mark: string; color: string }> = {
  good: { mark: "✓", color: "text-emerald-400" },
  tip: { mark: "→", color: "text-accent" },
  warning: { mark: "!", color: "text-orange-400" },
};
const sec = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(2)} s`;

// The coaching summary of a session (lib/coaching.ts).
export default function Coach({ c }: { c: Coaching }) {
  const max = Math.max(0.01, ...c.losses.map((l) => l.loss_s));
  const compare = (corner?: CornerCoaching) =>
    c.lap && c.reference ? `/laps/${c.lap.id}?vs=${c.reference.id}${corner ? `&corner=${corner.number}` : ""}` : null;
  return (
    <section className="mt-6 rounded-lg border border-accent/30 bg-panel p-5">
      <div className="flex flex-wrap items-baseline gap-x-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-accent">Coach</span>
        {compare() && <Link href={compare()!} className="text-xs text-zinc-400 underline hover:text-white">compare your best lap with the reference</Link>}
      </div>
      <p className="mt-1 text-lg text-white">{c.headline}</p>
      {c.phases && c.gap_s != null && c.gap_s > 0 && (
        <p className="tabular mt-1 text-sm text-zinc-400">
          Where the gap is made: braking and corner entry <span className="text-white">{sec(c.phases.entry_s)}</span> · exits and
          straights <span className="text-white">{sec(c.phases.exit_s)}</span>
        </p>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div>
          {c.losses.length > 0 && (
            <>
              <h3 className="text-sm font-medium text-white">Where you lose time</h3>
              <ul className="mt-2 space-y-4">
                {c.losses.map((l) => (
                  <li key={l.number}>
                    <div className="flex items-baseline gap-3">
                      <span className="font-medium text-white">T{l.number}{l.name && <span className="ml-1.5 font-normal text-zinc-400">{l.name}</span>}</span>
                      <span className="tabular text-sm text-red-400">{sec(l.loss_s)}</span>
                      {compare(l) && <Link href={compare(l)!} className="ml-auto text-xs text-zinc-400 underline hover:text-white">see it</Link>}
                    </div>
                    <div className="mt-1 flex h-1.5 overflow-hidden rounded bg-white/5" title="Entry / exit">
                      <div className="bg-orange-400" style={{ width: `${(Math.max(0, l.entry_s) / max) * 100}%` }} />
                      <div className="bg-sky-400" style={{ width: `${(Math.max(0, l.exit_s) / max) * 100}%` }} />
                    </div>
                    <p className="tabular mt-1 text-xs text-zinc-500">
                      <span className="text-orange-300">entry {sec(l.entry_s)}</span> · <span className="text-sky-300">exit {sec(l.exit_s)}</span>
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-zinc-300">
                      {l.advice.map((a) => <li key={a}>{a}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div>
          {c.focus.length > 0 && (
            <div className="rounded-md border border-accent/40 bg-accent/5 p-3">
              <h3 className="text-sm font-medium text-accent">Focus for your next session</h3>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-zinc-200">
                {c.focus.map((f) => <li key={f}>{f}</li>)}
              </ol>
            </div>
          )}
          {c.notes.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm">
              {c.notes.map((n) => (
                <li key={n.text} className="flex gap-2">
                  <span className={`w-4 shrink-0 text-center font-bold ${TONES[n.tone].color}`}>{TONES[n.tone].mark}</span>
                  <span className="text-zinc-300">{n.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
