import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ScheduleError, instant } from "@/lib/stint-schedule";
export async function POST(request:Request,ctx:RouteContext<"/api/race-hq/[id]/cars/[carId]/preferences">) {
  const me=await currentDriver();
  if(!me) return Response.json({error:"Sign in first."},{status:401});
  if(me.is_reviewer) return Response.json({error:"The reviewer account cannot choose race preferences."},{status:403});
  const origin=request.headers.get("origin");
  if(origin&&origin!==new URL(request.url).origin) return Response.json({error:"Use Race Day HQ on this site."},{status:403});
  const {id,carId}=await ctx.params;
  if(!/^\d+$/.test(id)||!/^\d+$/.test(carId)) return Response.json({error:"Race or car not found."},{status:404});
  const body=await request.json().catch(()=>null);
  if(typeof body?.stint_id!=="string"||!/^\d+$/.test(body.stint_id)||typeof body.preferred!=="boolean")
    return Response.json({error:"Choose a stint and your preference."},{status:400});
  try {
    await sql.begin(async(tx)=>{
      const [event]=await tx`select * from event where id=${id} for update`;
      if(!event) throw new ScheduleError("Race not found.",404);
      if(event.status==="finished"||event.archived_at) throw new ScheduleError("Finished races are read-only.",409);
      const [slot]=await tx`select s.id,s.starts_at from event_car_stint s join event_car c on c.id=s.event_car_id
        where s.id=${body.stint_id} and c.id=${carId} and c.event_id=${id}`;
      if(!slot) throw new ScheduleError("Stint not found in this car.",404);
      if(instant(slot.starts_at)<=Date.now()) throw new ScheduleError("Choose a future stint.",409);
      const [participant]=await tx`select driver_id from event_signup where event_id=${id} and driver_id=${me.id}
        union select driver_id from event_car_driver where event_id=${id} and driver_id=${me.id}`;
      if(!participant) throw new ScheduleError("Sign up for this race before marking your preferred stints.",403);
      if(body.preferred) await tx`insert into event_stint_preference(stint_id,driver_id) values(${slot.id},${me.id}) on conflict do nothing`;
      else await tx`delete from event_stint_preference where stint_id=${slot.id} and driver_id=${me.id}`;
    });
    return Response.json({ok:true});
  } catch(error) {
    if(error instanceof ScheduleError) return Response.json({error:error.message},{status:error.status});
    throw error;
  }
}
