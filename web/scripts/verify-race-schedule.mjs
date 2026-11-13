// Operational check after migrations/build. Logs timetable metadata only, never credentials.
import postgres from "postgres";
const sql=postgres(process.env.DATABASE_URL.trim(),{max:1,prepare:false,onnotice:()=>{}});
try {
  const events=await sql`select id,title,starts_at,duration_min,practice_starts_at,practice_min,briefing_starts_at,briefing_min,qualifying_starts_at,qualifying_min
    from event where status='upcoming' and archived_at is null order by starts_at limit 1`;
  console.log("Upcoming event timetable:",JSON.stringify(events));
  const [review]=await sql`select count(*)::int as n from event_signup s join driver d on d.id=s.driver_id join event e on e.id=s.event_id
    where d.discord_id='review-store' and e.status='upcoming' and e.archived_at is null`;
  console.log("Reviewer upcoming race registrations:",review.n);
  if(events.length && new Date(events[0].starts_at).toISOString().startsWith("2026-11-14") &&
     (new Date(events[0].starts_at).toISOString()!=="2026-11-14T10:30:00.000Z" || events[0].duration_min!==1440))
    throw new Error("November 14 event timetable did not match the requested start/duration.");
} finally {await sql.end();}
