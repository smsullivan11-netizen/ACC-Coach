import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/tokens/[id]">) {
  const driver = await currentDriver();
  if (!driver) return Response.json({ error: "sign in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "not found" }, { status: 404 });
  const rows = await sql`
    update agent_token set revoked_at = now()
    where id = ${id} and driver_id = ${driver.id} and revoked_at is null returning id`;
  return rows.length ? Response.json({ ok: true }) : Response.json({ error: "not found" }, { status: 404 });
}
