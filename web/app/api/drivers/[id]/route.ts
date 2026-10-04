import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";

// Deletes a driver and everything they uploaded (admins only; the privacy policy promises it on
// request): sessions with their laps, traces and corner results, tokens, sign-ins and rating history.
// Their laps in imported server results are kept, unlinked. Admins cannot delete themselves.
export async function DELETE(_request: Request, ctx: RouteContext<"/api/drivers/[id]">) {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "not found" }, { status: 404 });
  if (id === me.id) return Response.json({ error: "you cannot delete your own account" }, { status: 409 });
  const deleted = await sql.begin(async (tx) => {
    await tx`delete from session where driver_id = ${id}`;
    await tx`update official_lap set driver_id = null where driver_id = ${id}`;
    return tx`delete from driver where id = ${id} returning id`;
  });
  return deleted.length ? Response.json({ ok: true }) : Response.json({ error: "not found" }, { status: 404 });
}
