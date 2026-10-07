import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { buildOutline } from "./outline-core.ts";
for (const f of readdirSync(".").filter((f) => f.endsWith(".json") && !f.endsWith(".new.json"))) {
  const d = JSON.parse(readFileSync(f, "utf8"));
  // the laps the site uses: valid, or invalid for track limits only with the valid channel
  const laps = d.laps.filter((l: any) => l.ok || (l.why.length === 1 && l.why[0] === "game_invalid" && l.valid))
    .map((l: any) => ({ x: l.x, z: l.z, valid: l.ok ? null : l.valid }));
  const t0 = Date.now();
  const o = buildOutline(laps, d.key);
  writeFileSync(f.replace(".json", ".new.json"), JSON.stringify(o));
  console.log(`${d.key.padEnd(16)} ${o ? `${o.source.padEnd(7)} laps ${o.laps} cuts ${o.cuts}` : "none"}  ${Date.now() - t0} ms`);
}
