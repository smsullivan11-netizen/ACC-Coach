// Trace clocks that disagree with the lap's real time (user's report, 2026-10-07: the coach's entry +
// exit did not add up to the gap at Barcelona). Apps before 0.3 timed the trace on ACC's physics
// packet counter, which keeps running while the game is paused (its lap timer stops): a pause stood
// in the trace at one metre (famas, Mount Panorama: +1.99 s at 6,161 m; So, Zolder: +149 s), and on
// very short sessions the counter's calibration could be a few % off (xhanet, Barcelona -0.89 s;
// So, COTA -6.5 s). The lap times themselves (the game's or the server's) were always right.
// App 0.3 times traces on the game's lap timer; laps from older apps are repaired here at upload,
// and the ones already stored once from Settings (lib/trace-repair.ts). Safe on server and client.

/** Allowed difference between the trace's last metre and the lap time before repairing (s): good
 *  traces end a few hundredths early (the last metre is reached just before the line). */
export const TRACE_TOLERANCE_S = 0.15;

/** The trace's time channel brought back in line with the lap's real time (game or server, s), or
 *  null when it already is. Time the trace has too much goes first where it stood still (the
 *  metres that took far longer than their speed explains: pauses), the rest, or a clock that ran
 *  slow, is spread evenly over the lap. */
export function repairTraceTime(time: ArrayLike<number>, speed: ArrayLike<number>, stepM: number, lapS: number): Float64Array | null {
  const n = time.length;
  if (n < 10 || !(lapS > 0)) return null;
  const vEnd = Math.max(1, speed[n - 1] ?? 1);
  const target = lapS - (0.5 * stepM) / vEnd;                  // the last metre, reached just before the line
  if (Math.abs(time[n - 1] - lapS) <= TRACE_TOLERANCE_S) return null;

  const dt = new Float64Array(n);
  for (let i = 1; i < n; i++) dt[i] = Math.max(0, time[i] - time[i - 1]);
  let extra = time[n - 1] - target;
  if (extra > 0) {
    // Seconds each metre took beyond what its speed explains (at least 2 m/s, so stops still count)
    const over = Array.from({ length: n - 1 }, (_, k) => {
      const i = k + 1;
      return { i, s: dt[i] - stepM / Math.max(2, speed[i] ?? 0) };
    }).filter((x) => x.s > 0.05).sort((a, b) => b.s - a.s);
    for (const { i, s } of over) {
      if (extra <= 0.005) break;
      const cut = Math.min(s, extra);
      dt[i] -= cut;
      extra -= cut;
    }
  }
  const out = new Float64Array(n);
  out[0] = Math.max(0, time[0]);
  for (let i = 1; i < n; i++) out[i] = out[i - 1] + dt[i];
  // Whatever is left (or a clock that ran slow): spread evenly so the trace ends on the lap time
  const k = out[n - 1] > out[0] ? (target - out[0]) / (out[n - 1] - out[0]) : 1;
  for (let i = 1; i < n; i++) out[i] = out[0] + (out[i] - out[0]) * k;
  return out;
}
