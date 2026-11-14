import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { canLead } from "@/lib/race-hq";
import {ScheduleError} from "@/lib/stint-schedule";
import {raceClockText} from "@/lib/race-clock";

type Edit =
  | { action: "clock"; remaining_s?: number; status?: "upcoming" | "live";mode?:"auto"|"manual";observed_at?:string }
  | { action: "finish" }
  | { action: "archive" }
  | { action: "details"; notes?: string }
  | { action: "plan"; car_id?: string; stints?: { id?: string; driver_id?: string; starts_at?: string; ends_at?: string; note?: string }[] }
  | { action: "lead"; driver_id?: string; enabled?: boolean };

export async function PATCH(request: Request, ctx: RouteContext<"/api/race-hq/[id]">) {
  const me = await currentDriver();
  if (!me) return Response.json({ error: "sign in" }, { status: 401 });
  const origin=request.headers.get("origin");
  if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"Use Race Day HQ on this site."},{status:403});
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "not found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Edit | null;
  if (!body) return Response.json({ error: "bad request" }, { status: 400 });
  if (!(await canLead(id, me))) return Response.json({ error: "race leads only" }, { status: 403 });
  const [active] = await sql`select 1 from event where id = ${id} and status in ('upcoming', 'live') and archived_at is null`;
  if (!active) return Response.json({ error: "archived races are read-only" }, { status: 409 });

  if (body.action === "clock") {
    try {
      await sql.begin(async(tx)=>{
        const [event]=await tx`select * from event where id=${id} for update`;
        if(!event||event.archived_at||event.status==="finished")throw new ScheduleError("Finished races are read-only.",409);
        if(body.mode!==undefined&&body.mode!=="auto"&&body.mode!=="manual")throw new ScheduleError("Choose manual or automatic timing.");
        let message="";
        if(body.mode==="auto"){
          await tx`update event set clock_mode='auto',updated_at=now() where id=${id}`;
          message="Automatic race timing enabled. ACC can refresh the clock when an update arrives.";
        } else if(body.status==="upcoming"){
          await tx`update event set status=case when starts_at>now() then 'upcoming' else 'live' end,clock_mode='auto',
            clock_source='schedule',clock_remaining_s=null,clock_updated_at=null,clock_manual_remaining_s=null,clock_manual_updated_at=null,updated_at=now() where id=${id}`;
          message="Race clock returned to scheduled timing.";
        } else {
          const seconds=body.remaining_s;
          if(typeof seconds!=="number"||!Number.isInteger(seconds)||seconds<0||seconds>event.duration_min*60)
            throw new ScheduleError("Enter a valid remaining time within this race’s duration.");
          const observed=body.observed_at===undefined?Date.now():Date.parse(body.observed_at);
          if(!Number.isFinite(observed)||observed>Date.now()+5000||observed<Date.now()-120000)
            throw new ScheduleError("Refresh the shared clock, then enter the current ACC time and try again.");
          const at=new Date(observed).toISOString();
          await tx`update event set status='live',clock_mode='manual',clock_manual_remaining_s=${seconds},clock_manual_updated_at=${at},
            clock_remaining_s=${seconds},clock_updated_at=${at},clock_source='manual',updated_at=now() where id=${id}`;
          message=`Race clock synced by a race lead to ${raceClockText(seconds)} remaining. Manual timing is in control.`;
        }
        await tx`insert into event_update(event_id,author_id,kind,body) values(${id},${me.id},'official',${message})`;
      });
      return Response.json({ok:true});
    }catch(error){
      if(error instanceof ScheduleError)return Response.json({error:error.message},{status:error.status});
      throw error;
    }
  }
  if (body.action === "finish" || body.action === "archive") {
    await sql`update event set status = 'finished', archived_at = coalesce(archived_at, now()),
              clock_remaining_s = 0, clock_updated_at = now(), updated_at = now() where id = ${id}`;
    await sql`insert into event_update (event_id, author_id, kind, body)
              values (${id}, ${me.id}, 'system', ${body.action === "finish" ? "Race marked finished." : "Race archived."})`;
    return Response.json({ ok: true });
  }
  if (body.action === "lead") {
    if (!me.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
    if (!body.driver_id || !/^\d+$/.test(body.driver_id) || typeof body.enabled !== "boolean")
      return Response.json({ error: "choose a team member" }, { status: 400 });
    if (body.enabled)
      await sql`insert into event_role (event_id, driver_id, role) values (${id}, ${body.driver_id}, 'lead') on conflict do nothing`;
    else
      await sql`delete from event_role where event_id = ${id} and driver_id = ${body.driver_id} and role = 'lead'`;
    return Response.json({ ok: true });
  }
  if (body.action === "details") {
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 4000) : "";
    await sql`update event set notes = ${notes || null}, updated_at = now() where id = ${id}`;
    await sql`insert into event_update (event_id, author_id, kind, body)
              values (${id}, ${me.id}, 'official', 'Race and pit notes were updated.')`;
    return Response.json({ ok: true });
  }
  if (body.action === "plan")
    return Response.json({ error: "Refresh Race Day HQ and use the Stints editor to save this schedule." }, { status: 409 });
  return Response.json({ error: "unknown action" }, { status: 400 });
}


