import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { canLead } from "@/lib/race-hq";
import { validateAgenda } from "@/lib/race-agenda";
import { instant, ScheduleError } from "@/lib/stint-schedule";
export async function PATCH(request: Request, ctx: RouteContext<"/api/race-hq/[id]/schedule">) {
  const me = await currentDriver();
  if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Use Race Day HQ on this site." }, { status: 403 });
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "Race not found." }, { status: 404 });
  if (!(await canLead(id,me))) return Response.json({ error: "Race leads only." }, { status: 403 });
  const body = await request.json().catch(()=>null);
  if (!body || !Number.isSafeInteger(body.revision)) return Response.json({ error: "Reload the latest timetable." }, { status: 400 });
  try {
    const agenda = validateAgenda(body.agenda);
    await sql.begin(async (tx) => {
      const [event] = await tx`select * from event where id=${id} for update`;
      if (!event) throw new ScheduleError("Race not found.",404);
      if (event.archived_at || event.status !== "upcoming" || instant(event.starts_at)<=Date.now()) throw new ScheduleError("Only upcoming race timetables can be changed.",409);
      if (event.timing_revision!==body.revision) throw new ScheduleError("The timetable changed. Reload before editing.",409);
      if (instant(agenda.starts_at)<=Date.now() || instant(agenda.qualifying_starts_at)<=Date.now()) throw new ScheduleError("The race and qualifying must start in the future.");
      const [existing] = await tx`select count(*)::int as n, count(*) filter(where s.starts_at<=now())::int as started
        from event_car_stint s join event_car c on c.id=s.event_car_id where c.event_id=${id}`;
      if (existing.started) throw new ScheduleError("A started stint cannot be shifted.",409);
      if (existing.n && event.duration_min!==agenda.duration_min) throw new ScheduleError("The race duration is fixed while stint plans exist. Keep the duration and customize the individual slots.",409);
      const shift = instant(agenda.starts_at)-instant(event.starts_at);
      await tx`update event_car_stint s set starts_at=s.starts_at+(${shift}*interval '1 millisecond'),ends_at=s.ends_at+(${shift}*interval '1 millisecond')
        from event_car c where c.id=s.event_car_id and c.event_id=${id}`;
      await tx`update event set starts_at=${agenda.starts_at},duration_min=${agenda.duration_min},
        practice_starts_at=${agenda.practice_starts_at},practice_min=${agenda.practice_min},
        briefing_starts_at=${agenda.briefing_starts_at},briefing_min=${agenda.briefing_min},
        qualifying_starts_at=${agenda.qualifying_starts_at},qualifying_min=${agenda.qualifying_min},
        timing_revision=timing_revision+1,updated_at=now() where id=${id}`;
      await tx`update event_car set schedule_status='draft',schedule_revision=schedule_revision+1 where event_id=${id}`;
      await tx`insert into event_update(event_id,author_id,kind,body) values(${id},${me.id},'official',
        'Event timetable updated. Race stints shifted with their drivers and durations preserved. Both car plans need review before booking or confirmation.')`;
    });
    return Response.json({ok:true});
  } catch(error) {
    if (error instanceof ScheduleError) return Response.json({error:error.message},{status:error.status});
    throw error;
  }
}
