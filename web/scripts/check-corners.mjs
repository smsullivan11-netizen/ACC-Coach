// Checks that the site's corner code (lib/corners.ts) agrees with the app's (corners.py) on a real
// session bundle: per-corner metrics recomputed from the stored traces vs the ones in the bundle,
// and the corner map fingerprint. Usage (Node 24, runs the TypeScript directly):
//   node scripts/check-corners.mjs <bundle.json.gz>
// Make a bundle with: python -c "import bundle, acc_telemetry as acc; ..." (see CLAUDE.md, Tests).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { cornerMetrics, mapHashKey, scaledCorners } from "../lib/corners.ts";

const TYPES = { int8: Int8Array, int16: Int16Array, int32: Int32Array };
const decode = (ch) => {
  const buf = Buffer.from(ch.data, "base64");
  const ints = new TYPES[ch.dtype](buf.buffer, buf.byteOffset, buf.byteLength / TYPES[ch.dtype].BYTES_PER_ELEMENT);
  return Float64Array.from(ints, (x) => x * ch.scale);
};
// Quantisation of the stored traces (speed 0.01 m/s, inputs 0.1 %, time 1 ms) and the brake zone
// rebuilt from the cleaned brake allow small differences
const TOLERANCE = { time_s: 0.005, coasting_s: 0.05, max_brake_pct: 0.2 };
const DEFAULT_TOL_SPEED = 0.2, DEFAULT_TOL_M = 2;

const b = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString("utf8"));
const hash = createHash("sha256").update(mapHashKey(b.corner_map)).digest("hex").slice(0, 16);
console.log(`map fingerprint: site ${hash}, app ${b.corner_map.hash}: ${hash === b.corner_map.hash ? "same" : "DIFFERENT"}`);
let failures = hash === b.corner_map.hash ? 0 : 1, compared = 0;

for (const lap of b.laps) {
  if (!lap.trace || !lap.corners) continue;
  const ch = lap.trace.channels;
  const n = lap.trace.length;
  const site = cornerMetrics(
    { time: decode(ch.time_s), speed: decode(ch.speed_ms), throttle: decode(ch.throttle_clean_pct), brake: decode(ch.brake_clean_pct) },
    scaledCorners(b.corner_map, n * lap.trace.step_m),
  );
  for (const [i, app] of lap.corners.entries()) {
    for (const [key, x] of Object.entries(app)) {
      const y = site[i][key];
      const tol = TOLERANCE[key] ?? (key.endsWith("_kmh") ? DEFAULT_TOL_SPEED : DEFAULT_TOL_M);
      compared++;
      const same = x == null || y == null ? x === y : Math.abs(x - y) <= tol + 1e-9;
      if (!same) {
        failures++;
        console.log(`lap ${lap.number} T${app.corner} ${key}: app ${x}, site ${y}`);
      }
    }
  }
}
console.log(`${compared} values compared, ${failures} different`);
process.exit(failures ? 1 : 0);
