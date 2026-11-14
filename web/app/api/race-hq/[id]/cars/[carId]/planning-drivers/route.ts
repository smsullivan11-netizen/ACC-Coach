import {currentDriver} from "@/lib/auth";
import {sql} from "@/lib/db";
import {canLead} from "@/lib/race-hq";
import {ScheduleError,instant} from "@/lib/stint-schedule";
const identifier=(v:unknown):v is string=>typeof v==="string"&&/^\d+$/.test(v);
export async function PATCH(request:Request,ctx:RouteContext<"/api/race-hq/[id]/cars/[carId]/planning-drivers">) {
  const me=await currentDriver();
  if(!me) return Response.json({error:"Sign in first."},{status:401});
  if(me.is_reviewer) return Response.json({error:"The review account cannot plan race teams."},{status:403});
  const origin=request.headers.get("origin");
  if(origin&&origin!==new URL(request.url).origin) return Response.json({error:"Use Race Day HQ on this site."},{status:403});
  const {id,carId}=await ctx.params;
  if(!identifier(id)||!identifier(carId)) return Response.json({error:"Car not found."},{status:404});
  if(!(await canLead(id,me))) return Response.json({error:"Race leads only."},{status:403});
  const body=await request.json().catch(()=>null);
  if(!body||!["add","link","remove"].includes(body.action)) return Response.json({error:"Choose a planning-driver action."},{status:400});
  try {
    await sql.begin(async(tx)=>{
      const [event]=await tx`select * from event where id=${id} for update`;
      if(!event)throw new ScheduleError("Race not found.",404);
      if(event.archived_at||event.status==="finished")throw new ScheduleError("Finished races are read-only.",409);
      const [car]=await tx`select * from event_car where id=${carId} and event_id=${id}`;
      if(!car)throw new ScheduleError("Car not found in this race.",404);
      const roster=await tx`select driver_id,sort_order from event_car_driver where event_car_id=${carId}`;
      const pending=await tx`select * from event_planning_driver where event_car_id=${carId} and linked_driver_id is null and removed_at is null order by id`;
      let message="";
      if(body.action==="add") {
        const name=typeof body.name==="string"?body.name.replace(/\s+/g," ").trim():"";
        if(!name||name.length>80)throw new ScheduleError("Enter a driver name of 1–80 characters.");
        if(roster.length+pending.length>=6)throw new ScheduleError("A car has at most six joined or planning drivers.",409);
        if(pending.some(p=>p.name.toLowerCase()===name.toLowerCase()))throw new ScheduleError("That planning driver is already on this car.",409);
        await tx`insert into event_planning_driver(event_id,event_car_id,name,created_by) values(${id},${carId},${name},${me.id})`;
        await tx`update event_car set roster_confirmed=false,schedule_status='draft' where id=${carId}`;
        message=`${name} added as a planning driver, awaiting Discord signup.`;
      } else {
        if(!identifier(body.planning_driver_id))throw new ScheduleError("Choose a planning driver.");
        const person=pending.find(p=>String(p.id)===body.planning_driver_id);
        if(!person)throw new ScheduleError("This planning spot was already linked or removed. Refresh the team.",409);
        if(body.action==="link") {
          if(!identifier(body.driver_id))throw new ScheduleError("Choose the driver’s signed-up Discord profile.");
          const [driver]=await tx`select d.id,d.display_name from driver d where d.id=${body.driver_id} and d.discord_id is distinct from 'review-store'
            and (exists(select 1 from event_signup s where s.event_id=${id} and s.driver_id=d.id)
              or exists(select 1 from event_car_driver r where r.event_car_id=${carId} and r.driver_id=d.id))`;
          if(!driver)throw new ScheduleError("The driver must sign up for this race before you link their account.");
          const [other]=await tx`select event_car_id from event_car_driver where event_id=${id} and driver_id=${driver.id} and event_car_id<>${carId}`;
          if(other)throw new ScheduleError("That driver already belongs to another car. Move their roster assignment first.",409);
          const [overlap]=await tx`select 1 from event_car_stint planned
            join event_car_stint other on other.driver_id=${driver.id} and other.event_car_id<>${carId}
              and planned.starts_at<other.ends_at and planned.ends_at>other.starts_at
            join event_car other_car on other_car.id=other.event_car_id
            where planned.event_car_id=${carId} and planned.planning_driver_id=${person.id}
              and planned.ends_at>now() and other_car.event_id=${id} limit 1`;
          if(overlap)throw new ScheduleError("This account has an overlapping drive in another car. Resolve that assignment before linking.",409);
          if(String(car.qualifying_planning_driver_id)===String(person.id)){
            const [qualifyingConflict]=await tx`select 1 from event_car where event_id=${id} and id<>${carId} and qualifying_driver_id=${driver.id}`;
            if(qualifyingConflict)throw new ScheduleError("This account is qualifying in another car.",409);
          }
          const already=roster.some(r=>String(r.driver_id)===String(driver.id));
          if(!already)await tx`insert into event_car_driver(event_id,event_car_id,driver_id,sort_order)
            values(${id},${carId},${driver.id},${Math.max(-1,...roster.map(r=>r.sort_order))+1})`;
          // Identity linking changes no times or notes, including historical planned drives.
          await tx`update event_car_stint set driver_id=${driver.id},planning_driver_id=null where event_car_id=${carId} and planning_driver_id=${person.id}`;
          await tx`update event_car set qualifying_driver_id=${driver.id},qualifying_planning_driver_id=null
            where id=${carId} and qualifying_planning_driver_id=${person.id}`;
          await tx`update event_planning_driver set linked_driver_id=${driver.id},linked_at=now() where id=${person.id}`;
          if(already&&roster.length+pending.length-1<4)await tx`update event_car set roster_confirmed=false,schedule_status='draft' where id=${carId}`;
          message=`Planning driver ${person.name} linked to ${driver.display_name}. Their reserved race and qualifying stints now appear in their account.`;
        } else {
          const [started]=await tx`select 1 from event_car_stint where planning_driver_id=${person.id} and starts_at<=now() limit 1`;
          if(started||(String(car.qualifying_planning_driver_id)===String(person.id)&&event.qualifying_starts_at&&instant(event.qualifying_starts_at)<=Date.now()))
            throw new ScheduleError("This planning driver has started stints. Link their real account to keep the history.",409);
          await tx`update event_car_stint set planning_driver_id=null where event_car_id=${carId} and planning_driver_id=${person.id}`;
          await tx`update event_car set qualifying_planning_driver_id=null where id=${carId} and qualifying_planning_driver_id=${person.id}`;
          await tx`update event_planning_driver set removed_at=now() where id=${person.id}`;
          await tx`update event_car set roster_confirmed=false,schedule_status='draft' where id=${carId}`;
          message=`Planning driver ${person.name} removed. Their future slots are open again.`;
        }
      }
      await tx`update event_car set schedule_revision=schedule_revision+1 where id=${carId}`;
      await tx`update event set updated_at=now() where id=${id}`;
      await tx`insert into event_update(event_id,event_car_id,author_id,kind,body) values(${id},${carId},${me.id},'official',${message})`;
    });
    return Response.json({ok:true});
  }catch(error){
    if(error instanceof ScheduleError)return Response.json({error:error.message},{status:error.status});
    if((error as {code?:string}).code==="23505")return Response.json({error:"This driver or planning spot was already added. Refresh the team."},{status:409});
    throw error;
  }
}
