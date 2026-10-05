import { gunzipSync } from "node:zlib";
import { after } from "next/server";
import { driverFromRequest } from "@/lib/auth";
import { awardAchievements } from "@/lib/achievements";
import { afterUpload } from "@/lib/corner-maps";
import { announceSession } from "@/lib/discord";
import { sql } from "@/lib/db";
import { importBundle, Rejected, type Bundle } from "@/lib/import-bundle";
import { compressOldTraces, pruneTraces } from "@/lib/storage";
import { rateSession } from "@/lib/ratings";
import { refreshOutlineForSession } from "@/lib/track-outline";

// Upload of a session bundle (.json.gz written by bundle.py), from the desktop app / upload script
// (Authorization: Bearer <upload token>) or from the upload page (browser session).
// Body: the raw .json.gz file. Bundles are small (≈50-200 KB per lap) but Vercel caps request
// bodies at 4.5 MB, so very long sessions will need per-lap uploads later.
// After the import: the driver's rating is updated, the track's corner map is upgraded if needed
// (lib/corner-maps.ts) and old traces are pruned.
export async function POST(request: Request) {
  const driver = await driverFromRequest(request);
  if (!driver) return Response.json({ error: "sign in or use a valid upload token" }, { status: 401 });

  let bundle: Bundle;
  try {
    const raw = Buffer.from(await request.arrayBuffer());
    const text = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
    bundle = JSON.parse(text);
  } catch {
    return Response.json({ error: "not a session bundle (.json.gz)" }, { status: 400 });
  }

  let result;
  try {
    result = await importBundle(bundle, driver.id);
  } catch (e) {
    if (e instanceof Rejected) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const rating = await rateSession(sql, result.sessionId);
  await afterUpload(result.sessionId);
  // Achievements and the Discord post must never fail an upload
  await awardAchievements(result.sessionId).catch((e) => console.error("achievements", e));
  await announceSession(result.sessionId);
  await pruneTraces();
  await compressOldTraces(10).catch((e) => console.error("compress traces", e));   // older traces, a few per upload
  // Track surface on the maps, recomputed with the new laps once the app has its answer
  after(() => refreshOutlineForSession(result.sessionId).catch((e) => console.error("track outline", e)));
  return Response.json({
    ok: true,
    session_id: result.sessionId,
    laps: result.laps,
    driver: driver.display_name,
    rating: rating ? Math.round(rating.rating * 10) / 10 : null,
  });
}
