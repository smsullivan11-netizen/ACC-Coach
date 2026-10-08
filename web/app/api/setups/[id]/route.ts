import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { KINDS } from "@/lib/setups";

// A setup's owner (or an admin) edits its title, kind and notes, or deletes it.
async function allowed(id: string) {
  const me = await currentDriver();
  if (!me) return { error: Response.json({ error: "sign in first" }, { status: 401 }) };
  if (!/^\d+$/.test(id)) return { error: Response.json({ error: "not found" }, { status: 404 }) };
  const [s] = await sql<{ uploaded_by: string | null }[]>`select uploaded_by from setup where id = ${id}`;
  if (!s) return { error: Response.json({ error: "not found" }, { status: 404 }) };
  if (!me.is_admin && s.uploaded_by !== me.id) return { error: Response.json({ error: "only the uploader or an admin can change a setup" }, { status: 403 }) };
  return { me };
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/setups/[id]">) {
  const { id } = await ctx.params;
  const a = await allowed(id);
  if (a.error) return a.error;
  const b = (await request.json().catch(() => ({}))) as { title?: string; kind?: string; notes?: string };
  const title = typeof b.title === "string" ? b.title.trim().slice(0, 120) : "";
  const kind = KINDS.find((k) => k.value === b.kind)?.value;
  if (!title || !kind) return Response.json({ error: "title and kind expected" }, { status: 400 });
  const notes = typeof b.notes === "string" && b.notes.trim() ? b.notes.trim().slice(0, 1500) : null;
  await sql`update setup set title = ${title}, kind = ${kind}, notes = ${notes} where id = ${id}`;
  return Response.json({ ok: true });
}

export async function DELETE(_: Request, ctx: RouteContext<"/api/setups/[id]">) {
  const { id } = await ctx.params;
  const a = await allowed(id);
  if (a.error) return a.error;
  await sql`delete from setup where id = ${id}`;
  return Response.json({ ok: true });
}
