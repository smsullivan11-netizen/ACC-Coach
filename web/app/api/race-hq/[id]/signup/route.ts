import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function POST(request: Request, ctx: RouteContext<"/api/race-hq/[id]/signup">) {
  const me = await currentDriver();
  if (!me) return Response.json({ error: "Sign in with Discord to register." }, { status: 401 });
  if (me.is_reviewer) return Response.json({ error: "The Store Reviewer account is for certification and cannot enter races." }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json({ error: "Use the signup button on this site." }, { status: 403 });
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "Race not found." }, { status: 404 });
  const body = await request.json().catch(() => null);
  if (typeof body?.registered !== "boolean")
    return Response.json({ error: "Choose whether to sign up or withdraw." }, { status: 400 });
  // Lock the event so a concurrent archive/start cannot admit a late registration.
  const ok = await sql.begin(async (tx) => {
    const [event] = await tx`select id from event where id = ${id} and status = 'upcoming'
      and archived_at is null and starts_at > now() for update`;
    if (!event) return false;
    if (body.registered) {
      await tx`insert into event_signup (event_id, driver_id) values (${id}, ${me.id}) on conflict do nothing`;
    } else {
      const [assigned] = await tx`select 1 from event_car_driver where event_id = ${id} and driver_id = ${me.id}`;
      if (assigned) return "assigned";
      await tx`delete from event_signup where event_id = ${id} and driver_id = ${me.id}`;
    }
    return true;
  });
  if (ok === "assigned") return Response.json({ error: "Ask a race lead to remove you from your car roster before withdrawing." }, { status: 409 });
  if (!ok) return Response.json({ error: "Signups are closed for this race." }, { status: 409 });
  return Response.json({ ok: true });
}
