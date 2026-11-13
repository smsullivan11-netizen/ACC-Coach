import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { instant, ScheduleError, type SavedSlot } from "@/lib/stint-schedule";
const identifier = (v: unknown): v is string => typeof v==="string" && /^\d+$/.test(v);

export async function POST(request: Request, ctx: RouteContext<"/api/race-hq/[id]/cars/[carId]/trades">) {
  const me = await currentDriver();
  if (!me) return Response.json({error:"Sign in first."},{status:401});
  if (me.is_reviewer) return Response.json({error:"The reviewer account cannot trade stints."},{status:403});
  const origin=request.headers.get("origin");
  if (origin && origin!==new URL(request.url).origin) return Response.json({error:"Use Race Day HQ on this site."},{status:403});
  const {id,carId}=await ctx.params;
  if (!identifier(id)||!identifier(carId)) return Response.json({error:"Car not found."},{status:404});
  const body=await request.json().catch(()=>null);
  if (!body || !["offer","accept","decline","cancel"].includes(body.action)) return Response.json({error:"Choose a trade action."},{status:400});
  try {
    await sql.begin(async(tx)=>{
      // Shares the event lock with claims, roster changes and timetable edits.
      const [event]=await tx`select * from event where id=${id} for update`;
      if (!event) throw new ScheduleError("Race not found.",404);
      if (event.status==="finished"||event.archived_at) throw new ScheduleError("Finished races are read-only.",409);
      const [car]=await tx`select * from event_car where id=${carId} and event_id=${id}`;
      if (!car) throw new ScheduleError("Car not found in this race.",404);
      const roster=await tx`select r.driver_id,d.display_name from event_car_driver r join driver d on d.id=r.driver_id
        where r.event_car_id=${carId} and d.discord_id is distinct from 'review-store'`;
      const drivers=new Map(roster.map((r)=>[String(r.driver_id),String(r.display_name)]));
      const now=Date.now();
      const saved=await tx<SavedSlot[]>`select * from event_car_stint where event_car_id=${carId} order by n`;
      const find=(slotId: unknown)=>saved.find((s)=>String(s.id)===slotId);
      const eligible=()=>{
        if (!car.roster_confirmed || roster.length<4 || roster.length>6 || !drivers.has(String(me.id)))
          throw new ScheduleError("Join this car’s confirmed roster before trading stints.",403);
      };
      let message="";
      if (body.action==="offer") {
        eligible();
        if (!Number.isSafeInteger(body.revision)||body.revision!==car.schedule_revision) throw new ScheduleError("The schedule changed. Reopen the stint before sending an offer.",409);
        if (!identifier(body.to_driver_id)||body.to_driver_id===String(me.id)||!drivers.has(body.to_driver_id))
          throw new ScheduleError("Choose another driver from this car’s roster.");
        const giveId=body.give_stint_id??null,takeId=body.take_stint_id??null;
        if ((!giveId&&!takeId)||(giveId!==null&&!identifier(giveId))||(takeId!==null&&!identifier(takeId))||(giveId&&giveId===takeId))
          throw new ScheduleError("Choose one or two different stints.");
        const give=find(giveId),take=find(takeId);
        if ((giveId && (!give||String(give.driver_id)!==String(me.id))) || (takeId && (!take||String(take.driver_id)!==body.to_driver_id)))
          throw new ScheduleError("Those assignments changed. Reopen the stint and try again.",409);
        if ((give&&instant(give.starts_at)<=now)||(take&&instant(take.starts_at)<=now))
          throw new ScheduleError("Only future stints can be traded.",409);
        const [duplicate]=await tx`select id from event_stint_trade where event_car_id=${carId} and status='pending'
          and from_driver_id=${me.id} and to_driver_id=${body.to_driver_id}
          and give_stint_id is not distinct from ${giveId}::bigint and take_stint_id is not distinct from ${takeId}::bigint`;
        if (duplicate) throw new ScheduleError("This offer is already waiting for a response.",409);
        await tx`insert into event_stint_trade(event_id,event_car_id,from_driver_id,to_driver_id,give_stint_id,take_stint_id,
          give_starts_at,give_ends_at,take_starts_at,take_ends_at)
          values(${id},${carId},${me.id},${body.to_driver_id},${giveId},${takeId},
            ${give?.starts_at??null},${give?.ends_at??null},${take?.starts_at??null},${take?.ends_at??null})`;
        message=`${me.display_name} sent ${drivers.get(body.to_driver_id)} a ${give&&take?"stint swap":"stint cover"} request. Assignments stay unchanged until accepted.`;
      } else {
        if (!identifier(body.trade_id)) throw new ScheduleError("Choose an offer.");
        const [offer]=await tx`select * from event_stint_trade where id=${body.trade_id} and event_id=${id} and event_car_id=${carId}`;
        if (!offer) throw new ScheduleError("Offer not found in this car.",404);
        const from=String(offer.from_driver_id),to=String(offer.to_driver_id);
        if (body.action==="cancel" ? from!==String(me.id) : to!==String(me.id))
          throw new ScheduleError("Only the named driver can respond to this offer.",403);
        if (offer.status!=="pending") throw new ScheduleError("This offer has already been resolved. Refresh the schedule.",409);
        if (body.action==="accept") {
          eligible();
          if (!drivers.has(from)||!drivers.has(to)) throw new ScheduleError("The car roster changed; send a new offer.",409);
          const give=offer.give_stint_id===null?undefined:find(String(offer.give_stint_id));
          const take=offer.take_stint_id===null?undefined:find(String(offer.take_stint_id));
          const matches=(slot:SavedSlot|undefined,owner:string,a:string|Date,b:string|Date)=>
            slot && String(slot.driver_id)===owner && instant(slot.starts_at)===instant(a) && instant(slot.ends_at)===instant(b) && instant(slot.starts_at)>now;
          if ((offer.give_stint_id!==null&&!matches(give,from,offer.give_starts_at,offer.give_ends_at)) ||
              (offer.take_stint_id!==null&&!matches(take,to,offer.take_starts_at,offer.take_ends_at)))
            throw new ScheduleError("The stint changed or started. Decline this offer and arrange a new one.",409);
          const proposed=saved.map((s)=>({...s,driver_id: give&&String(s.id)===String(give.id)?to:take&&String(s.id)===String(take.id)?from:s.driver_id}));
          const other=await tx`select s.driver_id,s.starts_at,s.ends_at from event_car_stint s join event_car c on c.id=s.event_car_id
            where c.event_id=${id} and c.id<>${carId} and s.driver_id is not null`;
          if (proposed.some((s)=>s.driver_id && instant(s.ends_at)>now && other.some((o)=>String(o.driver_id)===String(s.driver_id) &&
              instant(s.starts_at)<instant(o.ends_at) && instant(s.ends_at)>instant(o.starts_at))))
            throw new ScheduleError("This change would overlap a driver’s assignment in another car.",409);
          if (give) await tx`update event_car_stint set driver_id=${to} where id=${give.id}`;
          if (take) await tx`update event_car_stint set driver_id=${from} where id=${take.id}`;
          await tx`update event_stint_trade set status='accepted',resolved_at=now() where id=${offer.id}`;
          const affected=[give?.id,take?.id].filter((v):v is string=>v!==undefined);
          await tx`update event_stint_trade set status='cancelled',resolved_at=now() where event_car_id=${carId} and status='pending'
            and (give_stint_id in ${tx(affected)} or take_stint_id in ${tx(affected)})`;
          await tx`update event_car set schedule_revision=schedule_revision+1 where id=${carId}`;
          message=`${me.display_name} accepted a ${give&&take?"stint swap":"stint cover"} with ${drivers.get(from)}. The schedule is updated.`;
        } else {
          await tx`update event_stint_trade set status=${body.action==="cancel"?"cancelled":"declined"},resolved_at=now() where id=${offer.id}`;
          message=`${me.display_name} ${body.action==="cancel"?"cancelled":"declined"} a stint offer. Assignments are unchanged.`;
        }
      }
      await tx`update event set updated_at=now() where id=${id}`;
      await tx`insert into event_update(event_id,event_car_id,author_id,kind,body) values(${id},${carId},${me.id},'system',${message})`;
    });
    return Response.json({ok:true});
  } catch(error) {
    if(error instanceof ScheduleError) return Response.json({error:error.message},{status:error.status});
    throw error;
  }
}
