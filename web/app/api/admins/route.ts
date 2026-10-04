import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";

// Grant or remove admin rights (admins only). Body: { driver_id, is_admin }. The last admin cannot
// remove their own rights.
export async function POST(request: Request) {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const { driver_id, is_admin } = (await request.json().catch(() => ({}))) as { driver_id?: string; is_admin?: boolean };
  if (!driver_id || !/^\d+$/.test(driver_id) || typeof is_admin !== "boolean")
    return Response.json({ error: "driver_id and is_admin expected" }, { status: 400 });
  if (!is_admin) {
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from driver where is_admin`;
    if (n <= 1) return Response.json({ error: "there must be at least one admin" }, { status: 409 });
  }
  await sql`update driver set is_admin = ${is_admin} where id = ${driver_id}`;
  return Response.json({ ok: true });
}
