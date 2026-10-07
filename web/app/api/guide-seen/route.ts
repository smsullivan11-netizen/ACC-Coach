import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";

// The guide was closed (components/Tutorial.tsx): it no longer opens by itself, on any device.
// Kept on the account (migration 0013), not in the browser.
export async function POST() {
  const me = await currentDriver();
  if (!me) return Response.json({ error: "sign in" }, { status: 401 });
  await sql`update driver set guide_seen_at = coalesce(guide_seen_at, now()) where id = ${me.id}`;
  return Response.json({ ok: true });
}
