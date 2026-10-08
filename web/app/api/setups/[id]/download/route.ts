import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";

// Download a setup as the .json file ACC reads (tab-indented like the game writes it). Counts downloads.
export async function GET(_: Request, ctx: RouteContext<"/api/setups/[id]/download">) {
  const me = await currentDriver();
  if (!me) return Response.json({ error: "sign in first" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "not found" }, { status: 404 });
  const [s] = await sql<{ title: string; data: unknown }[]>`
    update setup set downloads = downloads + 1 where id = ${id} returning title, data`;
  if (!s) return Response.json({ error: "not found" }, { status: 404 });
  const file = `${s.title.replace(/[^\w .()+-]+/g, "_") || "setup"}.json`;
  return new Response(JSON.stringify(s.data, null, "\t"), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${file}"` },
  });
}
