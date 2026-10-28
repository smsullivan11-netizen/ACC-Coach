import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";

type SignupStatus = "in" | "maybe" | "out";

export async function POST(request: Request, ctx: RouteContext<"/api/race-hq/[id]/signup">) {
  const me = await currentDriver();
  if (!me) return Response.json({ error: "sign in" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as {
    status?: SignupStatus; timing_preference?: unknown;
  } | null;
  if (!/^\d+$/.test(id) || !body || !["in", "maybe", "out"].includes(body.status ?? ""))
    return Response.json({ error: "choose whether you are in, maybe or unavailable" }, { status: 400 });

  const [event] = await sql`select 1 from event
                            where id = ${id} and status = 'upcoming' and archived_at is null`;
  if (!event) return Response.json({ error: "sign-ups are closed once the race starts" }, { status: 409 });

  const status = body.status!;
  const preference = status === "out" ? null
    : typeof body.timing_preference === "string" ? body.timing_preference.trim().slice(0, 500) || null : null;
  await sql`insert into event_signup (event_id, driver_id, status, timing_preference, updated_at)
            values (${id}, ${me.id}, ${status}, ${preference}, now())
            on conflict (event_id, driver_id) do update
            set status = excluded.status,
                timing_preference = excluded.timing_preference,
                updated_at = now()`;
  return Response.json({ ok: true });
}

