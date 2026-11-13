// Read-only roster metadata; no credentials or driver names are logged.
import postgres from "postgres";
const sql=postgres(process.env.DATABASE_URL.trim(),{max:1,prepare:false,onnotice:()=>{}});
try {
  const result=await sql.begin(async(tx)=>{
    await tx`set transaction isolation level repeatable read, read only`;
    const [event]=await tx`select id,status from event where archived_at is null and status in ('upcoming','live') order by starts_at limit 1`;
    if(!event)return {event:null,cars:[]};
    const cars=await tx`select c.id,c.number,c.roster_confirmed,count(r.driver_id)::int as saved_drivers,
      count(r.driver_id) filter(where r.driver_id is not null and d.discord_id is distinct from 'review-store')::int as real_drivers
      from event_car c left join event_car_driver r on r.event_car_id=c.id left join driver d on d.id=r.driver_id
      where c.event_id=${event.id} group by c.id order by c.sort_order,c.id`;
    const [signups]=await tx`select count(*)::int as registered_real_drivers from event_signup s join driver d on d.id=s.driver_id
      where s.event_id=${event.id} and d.discord_id is distinct from 'review-store'`;
    return {event,cars,signups};
  });
  console.log("Race roster diagnostic:",JSON.stringify(result));
}finally{await sql.end();}
