import { gunzipSync } from "node:zlib";
import { driverFromRequest } from "@/lib/auth";
import { importBundle, Rejected, type Bundle } from "@/lib/import-bundle";

// Upload of a session bundle (.json.gz written by bundle.py), from the upload script / agent
// (Authorization: Bearer <upload token>) or from the upload page (browser session).
// Body: the raw .json.gz file. Bundles are small (≈50-200 KB per lap) but Vercel caps request
// bodies at 4.5 MB, so very long sessions will need per-lap uploads later.
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

  try {
    const result = await importBundle(bundle, driver.id);
    return Response.json({ ok: true, session_id: result.sessionId, laps: result.laps, driver: driver.display_name });
  } catch (e) {
    if (e instanceof Rejected) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
