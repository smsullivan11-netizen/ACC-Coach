import {currentDriver} from "@/lib/auth";
import {sql} from "@/lib/db";
import {canLead} from "@/lib/race-hq";
import {ScheduleError} from "@/lib/stint-schedule";
export async function PATCH(request:Request,ctx:RouteContext<"/api/race-hq/[id]/cars/[carId]/stint-timer">){
  const me=await currentDriver();
  if(!me)return Response.json({error:"Sign in first."},{status:401});
  if(me.is_reviewer)return Response.json({error:"The review account cannot control stint timers."},{status:403});
  const origin=request.headers.get("origin");
  if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"Use Race Day HQ on this site."},{status:403});
  const {id,carId}=await ctx.params;
  if(!/^\d+$/.test(id)||!/^\d+$/.test(carId))return Response.json({error:"Car not found."},{status:404});
  const body=await request.json().catch(()=>null);
  if(!body||!["start","clear"].includes(body.action)||!Number.isSafeInteger(body.revision))
    return Response.json({error:"Choose a timer action and reload the latest timer."},{status:400});
  const lead=await canLead(id,me);
  try{
    await sql.begin(async tx=>{
      const [event]=await tx`select * from event where id=${id} for update`;
      if(!event)throw new ScheduleError("Race not found.",404);
      if(event.archived_at||event.status==="finished")throw new ScheduleError("Finished races are read-only.",409);
      const [car]=await tx`select * from event_car where id=${carId} and event_id=${id}`;
      if(!car)throw new ScheduleError("Car not found in this race.",404);
      if(!lead){
        const [member]=await tx`select 1 from event_car_driver where event_car_id=${carId} and driver_id=${me.id}`;
        if(!member)throw new ScheduleError("Only a race lead or this car’s drivers can control its timer.",403);
      }
      if(car.stint_timer_revision!==body.revision)throw new ScheduleError("Someone updated the timer. Refresh before starting it again.",409);
      if(body.action==="start"){
        if(!Number.isInteger(body.duration_min)||body.duration_min<1||body.duration_min>240)throw new ScheduleError("Choose a stint length of 1–240 minutes.");
        await tx`update event_car set stint_timer_started_at=now(),stint_timer_duration_min=${body.duration_min},stint_timer_revision=stint_timer_revision+1 where id=${carId}`;
      }else await tx`update event_car set stint_timer_started_at=null,stint_timer_duration_min=null,stint_timer_revision=stint_timer_revision+1 where id=${carId}`;
      await tx`insert into event_update(event_id,event_car_id,author_id,kind,body) values(${id},${carId},${me.id},'system',
        ${body.action==="start"?`${me.display_name} started the ${body.duration_min}-minute stint timer.`:`${me.display_name} cleared the stint timer.`})`;
    });
    return Response.json({ok:true});
  }catch(error){if(error instanceof ScheduleError)return Response.json({error:error.message},{status:error.status});throw error;}
}
