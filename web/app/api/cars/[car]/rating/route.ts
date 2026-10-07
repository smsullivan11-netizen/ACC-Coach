import { currentDriver } from "@/lib/auth";
import { CAR_PARTS, carInfo } from "@/lib/cars";
import { sql } from "@/lib/db";

// Admins: a car's ratings (Cars page, migration 0016). Body: each sub-rating 0-100 or null, note, source.
export async function POST(request: Request, ctx: RouteContext<"/api/cars/[car]/rating">) {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const { car } = await ctx.params;
  if (!carInfo(car)) return Response.json({ error: "unknown car" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "JSON body expected" }, { status: 400 });

  const row: Record<string, number | string | null> = {};
  for (const { key } of CAR_PARTS) {
    const v = body[key];
    if (v != null && (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100))
      return Response.json({ error: `${key}: a number from 0 to 100, or null` }, { status: 400 });
    row[key] = v == null ? null : Math.round(v);
  }
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  row.note = text(body.note, 1500);
  row.source = text(body.source, 300);

  await sql`
    insert into car_rating ${sql({ car_key: car, ...row, updated_by: me.id })}
    on conflict (car_key) do update set
      top_speed = excluded.top_speed, acceleration = excluded.acceleration, traction = excluded.traction,
      slow_corners = excluded.slow_corners, fast_corners = excluded.fast_corners, braking = excluded.braking,
      tyre_wear = excluded.tyre_wear, driveability = excluded.driveability, note = excluded.note, source = excluded.source,
      updated_by = excluded.updated_by, updated_at = now()`;
  return Response.json({ ok: true });
}
