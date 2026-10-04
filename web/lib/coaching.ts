import "server-only";
import { sql } from "./db";
import { lapTime, prettyKey } from "./format";
import { paceReference } from "./targets";
import { decodeChannel, type EncodedChannel } from "./trace";

// Coaching summary of a session, from data only (no AI service): where the driver loses time
// against the team's best lap (corner by corner, split into braking/entry and exit, with what to
// change), how the session went (consistency, track limits, mistakes, progress) and how they
// drive (stint length, breaks, late sessions), then one to three things to focus on next time.
// Thresholds are first guesses: tune them with the team.

export type Tone = "good" | "tip" | "warning";
export type Note = { topic: "technique" | "consistency" | "discipline" | "progress" | "wellbeing"; tone: Tone; text: string };
export type CornerCoaching = {
  number: number;
  name: string | null;
  loss_s: number;          // vs the reference lap (positive = time lost)
  entry_s: number;         // braking and turn-in, up to the reference's apex
  exit_s: number;          // apex to the end of the corner, plus the straight before the next braking
  advice: string[];
  start_m: number;
  end_m: number;
  // The teammate fastest through this corner (when faster than you): who to learn it from
  mentor?: { driver: string; gain_s: number; lap_id: string } | null;
};
export type Coaching = {
  headline: string;
  lap: { id: string; time_ms: number } | null;
  reference: { id: string; driver: string; time_ms: number; own: boolean } | null;
  gap_s: number | null;
  phases: { entry_s: number; exit_s: number } | null;
  losses: CornerCoaching[];
  strengths: CornerCoaching[];
  notes: Note[];
  focus: string[];
};

type LapRow = { id: string; number: number; t: number; comparable: boolean; excluded_reasons: string[]; distance_m: number };
type CR = {
  corner_number: number; time_s: number; entry_speed_kmh: number | null; braking_point_m: number | null;
  lift_point_m: number | null; max_brake_pct: number | null; min_speed_kmh: number | null; apex_m: number | null;
  throttle_pickup_m: number | null; full_throttle_m: number | null; coasting_s: number | null; exit_speed_kmh: number | null;
};

const MIN_CORNER_LOSS_S = 0.05;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const s2 = (x: number) => `${Math.abs(x).toFixed(2)} s`;
const minutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")}` : `${Math.round(m)} min`);
const label = (c: { number: number; name: string | null }) => `T${c.number}${c.name ? ` (${c.name})` : ""}`;

/** Elapsed time of a lap at distance d (m) from its time channel (1 m grid). */
function timeAt(time: Float64Array, d: number) {
  const p = Math.min(Math.max(d, 0), time.length - 1), i = Math.min(Math.floor(p), time.length - 2);
  return time[i] + (time[i + 1] - time[i]) * (p - i);
}

/** What to change in a corner: the driver's corner results against the reference's. */
function cornerAdvice(you: CR, ref: CR, refName: string, entryLoss: number, exitLoss: number): string[] {
  const entry: [number, string][] = [], exit: [number, string][] = [];
  const d = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b);
  const bp = d(you.braking_point_m, ref.braking_point_m);
  if (bp != null && bp < -5)
    entry.push([-bp, `Brake about ${Math.round(-bp)} m later: ${refName} brakes at ${Math.round(ref.braking_point_m!)} m, you at ${Math.round(you.braking_point_m!)} m.`]);
  if (bp != null && bp > 5 && entryLoss > MIN_CORNER_LOSS_S)
    entry.push([bp, `You brake ${Math.round(bp)} m later than ${refName} but still lose time before the apex: the entry is overdriven. Brake a touch earlier and aim for a cleaner apex.`]);
  if (you.braking_point_m == null && ref.braking_point_m != null && entryLoss > MIN_CORNER_LOSS_S)
    entry.push([10, `${refName} brakes here and you only lift: a short, firm brake can rotate the car better than a long lift.`]);
  const peak = d(you.max_brake_pct, ref.max_brake_pct);
  if (peak != null && peak < -10)
    entry.push([-peak / 2, `Press the brake harder at the start: peak ${Math.round(you.max_brake_pct!)} % against ${Math.round(ref.max_brake_pct!)} %.`]);
  const vmin = d(you.min_speed_kmh, ref.min_speed_kmh);
  if (vmin != null && vmin < -3)
    entry.push([-vmin * 2, `Carry more speed to the apex: ${Math.round(you.min_speed_kmh!)} km/h against ${Math.round(ref.min_speed_kmh!)} km/h. Release the brake more progressively as you turn in.`]);
  const coast = d(you.coasting_s, ref.coasting_s);
  if (coast != null && coast > 0.15)
    entry.push([coast * 40, `You coast ${coast.toFixed(2)} s longer between brake and throttle: keep a little brake into the turn-in, then go straight to the throttle.`]);
  const pickup = d(you.throttle_pickup_m, ref.throttle_pickup_m);
  if (pickup != null && pickup > 8)
    exit.push([pickup, `Back on the throttle about ${Math.round(pickup)} m earlier (you at ${Math.round(you.throttle_pickup_m!)} m, ${refName} at ${Math.round(ref.throttle_pickup_m!)} m).`]);
  const full = d(you.full_throttle_m, ref.full_throttle_m);
  if (full != null && full > 12)
    exit.push([full, `Full throttle ${Math.round(full)} m earlier: a later apex and opening the steering sooner let you commit earlier.`]);
  const vexit = d(you.exit_speed_kmh, ref.exit_speed_kmh);
  if (vexit != null && vexit < -3)
    exit.push([-vexit * 2, `Your exit is ${Math.round(-vexit)} km/h slower, and that carries all the way down the next straight.`]);

  const byWeight = (xs: [number, string][]) => xs.sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  const first = entryLoss >= exitLoss ? [byWeight(entry), byWeight(exit)] : [byWeight(exit), byWeight(entry)];
  const out = [...first[0].slice(0, 2), ...first[1].slice(0, 1)].slice(0, 2);
  if (!out.length)
    out.push(entryLoss >= exitLoss
      ? `The time goes before the apex without one clear cause: compare your line and braking with ${refName} in the replay.`
      : `The time goes after the apex: compare how early ${refName} unwinds the steering and commits to the throttle.`);
  return out;
}

export async function coachSession(sessionId: string): Promise<Coaching | null> {
  const [s] = await sql<{ driver_id: string; driver: string; track_id: string; car_class: string | null; type: string | null;
                          start: Date | null; uploaded: Date }[]>`
    select s.driver_id, d.display_name as driver, s.track_id, c.class as car_class, s.session_type as type,
           s.recorded_at as start, s.uploaded_at as uploaded
    from session s join driver d on d.id = s.driver_id left join car c on c.id = s.car_id where s.id = ${sessionId}`;
  if (!s) return null;
  const laps = await sql<LapRow[]>`
    select id, number, coalesce(official_lap_time_ms, game_lap_time_ms, lap_time_ms) as t, comparable, excluded_reasons, distance_m
    from lap where session_id = ${sessionId} order by number`;
  if (!laps.length || laps.every((l) => l.excluded_reasons.includes("track_edges"))) return null;   // edge laps only: nothing to coach
  const valid = laps.filter((l) => l.comparable);
  const flying = laps.filter((l) => !l.excluded_reasons.some((r) => r.startsWith("pit_") || r === "distance" || r === "track_edges"));
  const notes: Note[] = [];
  const focus: { weight: number; text: string }[] = [];

  // --- Technique: best lap of the session against the team's best lap ---------------------------
  const best = [...valid].sort((a, b) => a.t - b.t)[0] ?? null;
  let reference: Coaching["reference"] = null, gap: number | null = null, phases: Coaching["phases"] = null;
  let losses: CornerCoaching[] = [], strengths: CornerCoaching[] = [];
  if (best) {
    const [mine] = await sql<{ map_id: string | null; time: EncodedChannel | null }[]>`
      select l.corner_map_id as map_id, tr.channels->'time_s' as time from lap l left join lap_trace tr on tr.lap_id = l.id where l.id = ${best.id}`;
    const [ref] = mine?.map_id ? await sql<{ id: string; driver: string; driver_id: string; t: number; time: EncodedChannel }[]>`
      select l.id, d.display_name as driver, d.id as driver_id, coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms) as t,
             tr.channels->'time_s' as time
      from lap l join session ss on ss.id = l.session_id join driver d on d.id = ss.driver_id left join car c on c.id = ss.car_id
      join lap_trace tr on tr.lap_id = l.id
      where ss.track_id = ${s.track_id} and c.class is not distinct from ${s.car_class} and l.comparable
        and l.session_id <> ${sessionId} and l.corner_map_id = ${mine.map_id} and tr.channels ? 'time_s'
      order by 4 limit 1` : [];
    if (ref && mine?.time) {
      const own = ref.driver_id === s.driver_id;
      const refName = own ? "your best lap" : ref.driver;
      reference = { id: ref.id, driver: ref.driver, time_ms: ref.t, own };
      gap = (best.t - ref.t) / 1000;
      const tYou = decodeChannel(mine.time), tRef = decodeChannel(ref.time);
      const corners = await sql<(CR & { name: string | null; start_m: number; end_m: number; k: number; side: "you" | "ref" })[]>`
        select k.name, k.start_m * (tr.length * tr.step_m / m.length_m) as start_m, k.end_m * (tr.length * tr.step_m / m.length_m) as end_m,
               case when cr.lap_id = ${best.id} then 'you' else 'ref' end as side, cr.*
        from corner_result cr join corner k on k.corner_map_id = cr.corner_map_id and k.number = cr.corner_number
        join corner_map m on m.id = cr.corner_map_id join lap_trace tr on tr.lap_id = cr.lap_id
        where cr.lap_id in (${best.id}, ${ref.id}) order by cr.corner_number`;
      const you = new Map(corners.filter((c) => c.side === "you").map((c) => [c.corner_number, c]));
      const them = corners.filter((c) => c.side === "ref");
      const delta = (m: number) => timeAt(tYou, m) - timeAt(tRef, m);
      const rows = them.flatMap((r) => {
        const y = you.get(r.corner_number);
        if (!y) return [];
        const b = r.braking_point_m ?? r.lift_point_m ?? r.start_m;
        const a = r.apex_m ?? (r.start_m + r.end_m) / 2;
        const B = Math.min(Math.max(b, r.start_m), r.end_m), A = Math.min(Math.max(a, B), r.end_m);
        return [{ r, y, approach: delta(B) - delta(r.start_m), entry: delta(A) - delta(B), exit: delta(r.end_m) - delta(A) }];
      });
      // The straight before a braking zone depends on the previous corner's exit
      rows.forEach((row, i) => { rows[(i - 1 + rows.length) % rows.length].exit += row.approach; });
      const all = rows.map(({ r, y, entry, exit }) => ({
        y, r, out: { number: r.corner_number, name: r.name, loss_s: entry + exit, entry_s: entry, exit_s: exit,
                     start_m: r.start_m, end_m: r.end_m, advice: [] as string[] } as CornerCoaching,
      }));
      phases = { entry_s: all.reduce((a, c) => a + c.out.entry_s, 0), exit_s: all.reduce((a, c) => a + c.out.exit_s, 0) };
      losses = all.filter((c) => c.out.loss_s >= MIN_CORNER_LOSS_S).sort((a, b) => b.out.loss_s - a.out.loss_s).slice(0, 3)
        .map(({ y, r, out }) => ({ ...out, advice: cornerAdvice(y, r, refName, out.entry_s, out.exit_s) }));
      // Mentor: per weak corner, the teammate with the best time through it (same map and class)
      if (losses.length) {
        const mentors = await sql<{ corner_number: number; driver: string; lap_id: string; gain: number }[]>`
          select distinct on (cb.corner_number) cb.corner_number, d.display_name as driver, cb.lap_id, mine.time_s - cb.time_s as gain
          from corner_best cb join driver d on d.id = cb.driver_id
          join corner_result mine on mine.lap_id = ${best.id} and mine.corner_number = cb.corner_number and mine.corner_map_id = cb.corner_map_id
          where cb.corner_map_id = ${mine.map_id} and cb.driver_id <> ${s.driver_id}
            and cb.car_class is not distinct from ${s.car_class} and cb.corner_number in ${sql(losses.map((l) => l.number))}
            and cb.time_s < mine.time_s - 0.03
          order by cb.corner_number, cb.time_s`;
        for (const l of losses) {
          const m = mentors.find((x) => x.corner_number === l.number);
          l.mentor = m ? { driver: m.driver, gain_s: m.gain, lap_id: m.lap_id } : null;
        }
      }
      strengths = all.filter((c) => c.out.loss_s <= -MIN_CORNER_LOSS_S).sort((a, b) => a.out.loss_s - b.out.loss_s).slice(0, 2)
        .map((c) => c.out);

      if (gap <= 0) {
        notes.push({ topic: "progress", tone: "good", text: own
          ? `New personal best on this track: ${lapTime(best.t)}, ${s2(gap)} quicker than your previous best.`
          : gap === 0
            ? `Fastest lap of the team: ${lapTime(best.t)}, equal to ${ref.driver}'s.`
            : `Fastest lap of the team: ${lapTime(best.t)}, ${s2(gap)} ahead of ${ref.driver}. You are the reference now.` });
      }
      const totalLoss = losses.reduce((a, c) => a + c.loss_s, 0);
      if (phases && gap > 0.1) {
        const { entry_s, exit_s } = phases;
        if (entry_s > 0.1 && entry_s >= exit_s * 1.5)
          focus.push({ weight: entry_s, text: `Corner entries: ${s2(entry_s)} of your ${s2(gap)} gap goes between the braking point and the apex. Push more on entry: brake later and release the brake progressively to carry speed to the apex.` });
        else if (exit_s > 0.1 && exit_s >= entry_s * 1.5)
          focus.push({ weight: exit_s, text: `Corner exits: ${s2(exit_s)} of your ${s2(gap)} gap comes after the apex. Get the car turned earlier so you can open the steering and commit to full throttle sooner.` });
        else if (losses.length)
          focus.push({ weight: totalLoss, text: `${losses.map(label).join(", ")}: these corners hold ${s2(totalLoss)} of your ${s2(gap)} gap. Work on them one at a time, starting with ${label(losses[0])}.` });
      }

      // Recurring weak corner in the driver's previous sessions here (same map)
      if (losses.length) {
        const history = await sql<{ session_id: string; corner_number: number; loss: number }[]>`
          with mine as (
            select l.session_id, cr.corner_number, min(cr.time_s) as t
            from corner_result cr join lap l on l.id = cr.lap_id join session ss on ss.id = l.session_id
            where ss.driver_id = ${s.driver_id} and ss.track_id = ${s.track_id} and l.comparable
              and cr.corner_map_id = ${mine.map_id} and ss.id <> ${sessionId}
              and ss.id in (select id from session where driver_id = ${s.driver_id} and track_id = ${s.track_id}
                            and id <> ${sessionId} order by uploaded_at desc limit 3)
            group by 1, 2),
          team as (
            select cr.corner_number, min(cr.time_s) as t from corner_result cr join lap l on l.id = cr.lap_id
            where cr.corner_map_id = ${mine.map_id} and l.comparable group by 1)
          select distinct on (mine.session_id) mine.session_id, mine.corner_number, mine.t - team.t as loss
          from mine join team using (corner_number) order by mine.session_id, mine.t - team.t desc`;
        const repeats = history.filter((h) => h.corner_number === losses[0].number).length;
        if (repeats >= 2)
          notes.push({ topic: "technique", tone: "warning", text: `${label(losses[0])} was also your biggest loss in ${repeats} of your last ${history.length} sessions here: it is a habit, not a one-off. Make it the first thing you work on next time.` });
      }
      if (strengths.length)
        notes.push({ topic: "technique", tone: "good", text: `Strong at ${strengths.map(label).join(" and ")}: you gain ${s2(-strengths.reduce((a, c) => a + c.loss_s, 0))} on ${refName} there. Keep that approach.` });
    }
  }

  // --- Consistency, track limits, mistakes, progress -----------------------------------------------
  if (!valid.length && flying.length)
    notes.push({ topic: "discipline", tone: "warning", text: "No valid lap in this session: every flying lap was invalidated. A lap only counts if it is clean, so build up within the track limits first." });
  if (flying.length >= 4 && valid.length < flying.length) {
    const lost = flying.length - valid.length, share = lost / flying.length;
    if (share >= 0.25)
      focus.push({ weight: share * 2, text: `Track limits: ${lost} of ${flying.length} laps were invalidated. Leave a little margin on corner exits: an invalid lap is worth nothing, in qualifying as in a race.` });
  }
  if (best && valid.length >= 3) {
    const rest = valid.filter((l) => l.id !== best.id).map((l) => (l.t - best.t) / best.t);
    const spread = median(rest);
    if (spread > 0.01)
      focus.push({ weight: spread * 100, text: `Consistency: your typical lap is ${((spread * best.t) / 1000).toFixed(2)} s off your best. Aim for five laps in a row within three tenths before pushing harder: fixed braking markers help.` });
    else if (spread < 0.004)
      notes.push({ topic: "consistency", tone: "good", text: `Very consistent: your laps stay within ${((spread * best.t) / 1000).toFixed(2)} s of your best. You can afford to push for more pace now.` });
    const big = flying.filter((l) => l.t > best.t * 1.07 && !l.excluded_reasons.includes("distance"));
    if (big.length)
      notes.push({ topic: "discipline", tone: "tip", text: `${big.length} lap${big.length > 1 ? "s were" : " was"} more than 7 % off your best: probably mistakes or offs. In a race one off costs more than ten small mistakes, so build the pace progressively.` });
    const firstValid = valid[0];
    if (firstValid.id !== best.id && (firstValid.t - best.t) / 1000 > 0.5)
      notes.push({ topic: "progress", tone: "good", text: `You improved by ${s2((firstValid.t - best.t) / 1000)} from your first valid lap to your best.` });
  }
  // Lasting pace drop: 3 or more complete laps in a row, after the best lap, each over 2 % slower
  // than it (one slow lap is a mistake; tyre wear alone stays well under 2 %). Car damage is not
  // recorded yet, hence the "if the car was not damaged".
  if (best) {
    let run = 0, longest = 0, from = 0;
    for (const l of flying.filter((x) => x.number > best.number && !x.excluded_reasons.includes("distance"))) {
      run = l.t > best.t * 1.02 ? run + 1 : 0;
      if (run > longest) { longest = run; from = l.number - run + 1; }
    }
    if (longest >= 3)
      notes.push({ topic: "wellbeing", tone: "warning", text: `From lap ${from}, ${longest} laps in a row were more than 2 % off your best. If the car was not damaged, that is fatigue or lost focus talking: take a break instead of piling up laps, tired laps build bad habits.` });
  }
  // Target lap time of this car on this track (LFM 101 % for the team's cars), and the session's
  // optimal lap: the sum of the driver's best time through each corner over the session's valid laps
  const target = best ? await paceReference(sql, sessionId) : null;
  const [opt] = best ? await sql<{ ms: number | null }[]>`
    select case when count(*) = (select count(*) from corner k where k.corner_map_id = l0.corner_map_id)
                then round(sum(t) * 1000)::int end as ms
    from (select cr.corner_number, min(cr.time_s) as t
          from corner_result cr join lap l on l.id = cr.lap_id
          where l.session_id = ${sessionId} and l.comparable
            and cr.corner_map_id = (select corner_map_id from lap where id = ${best.id})
          group by 1) x, (select corner_map_id from lap where id = ${best.id}) l0
    group by l0.corner_map_id` : [];
  const optimal = opt?.ms && opt.ms < best!.t ? ` Your optimal lap time: ${lapTime(opt.ms)}.` : "";
  if (best && target?.target_ms) {
    const off = (best.t - target.target_ms) / 1000;
    notes.push(off <= 0
      ? { topic: "progress", tone: "good", text: `Target beaten: ${lapTime(best.t)} against ${lapTime(target.target_ms)} for the ${prettyKey(target.car)} here.${optimal}` }
      : { topic: "progress", tone: "tip", text: `Target for the ${prettyKey(target.car)} here: ${lapTime(target.target_ms)}. You are ${s2(off)} away (${((off * 100000) / target.target_ms).toFixed(1)} %).${optimal}` });
  } else if (optimal) {
    notes.push({ topic: "progress", tone: "tip", text: optimal.trim() });
  }
  if (flying.length > 0 && flying.length < 5)
    notes.push({ topic: "progress", tone: "tip", text: `Short run (${flying.length} flying lap${flying.length > 1 ? "s" : ""}). Runs of 8 to 10 laps are where consistency is built.` });

  // --- The driver: stint length, breaks, time of day ------------------------------------------
  const driven = laps.reduce((a, l) => a + l.t, 0) / 60000;
  if (s.start) {
    const day = await sql<{ id: string; start: Date; minutes: number }[]>`
      select ss.id, ss.recorded_at as start,
             (select coalesce(sum(coalesce(official_lap_time_ms, game_lap_time_ms, lap_time_ms)), 0) from lap where session_id = ss.id)::float8 / 60000 as minutes
      from session ss, (select recorded_at as t from session where id = ${sessionId}) me
      where ss.driver_id = ${s.driver_id} and ss.recorded_at between me.t - interval '8 hours' and me.t
      order by ss.recorded_at`;
    // Chain back from this session while the gaps between sessions are under 20 minutes
    let stint = driven, i = day.findIndex((x) => x.id === sessionId);
    while (i > 0) {
      const prev = day[i - 1], prevEnd = new Date(prev.start).getTime() + prev.minutes * 60000;
      if (new Date(day[i].start).getTime() - prevEnd > 20 * 60000) break;
      stint += prev.minutes;
      i--;
    }
    if (stint >= 120)
      notes.push({ topic: "wellbeing", tone: "warning", text: `You have been driving for ${minutes(stint)} with no real break. Take 15 minutes away from the screen, drink some water and move: focus and reaction time fade well before you feel tired.` });
    else if (stint >= 75)
      notes.push({ topic: "wellbeing", tone: "tip", text: `${minutes(stint)} of driving in a row: plan a short break before the next run. Fresh laps are better laps.` });
    const hour = new Date(s.start).getHours();   // the PC's local time, stored as is
    if (hour >= 0 && hour < 5)
      notes.push({ topic: "wellbeing", tone: "tip", text: "Late-night session: lack of sleep costs consistency and reaction time more than any setup change. Your best driving comes when you are rested." });
  }
  if (s.type === "race" && valid.length)
    notes.push({ topic: "discipline", tone: "tip", text: "Race session: judge it on average pace and clean laps rather than on the best lap." });

  const focusList = focus.sort((a, b) => b.weight - a.weight).slice(0, 3).map((f) => f.text);
  if (!focusList.length && losses.length)
    focusList.push(`${label(losses[0])}: your biggest loss (${s2(losses[0].loss_s)}). ${losses[0].advice[0]}`);
  const headline = !best
    ? "No valid lap to analyse in this session."
    : reference == null
      ? `Best lap ${lapTime(best.t)}. No team reference on this corner map yet: the corner analysis starts once another lap is recorded here.`
      : gap! <= 0
        ? `${lapTime(best.t)}: ${reference.own ? "a new personal best" : "the team's fastest lap"}. Great session.`
        : `${s2(gap!)} off ${reference.own ? "your best" : `the team best (${reference.driver}, ${lapTime(reference.time_ms)})`}${losses.length ? `, most of it at ${losses.slice(0, 2).map(label).join(" and ")}` : ""}.`;
  return { headline, lap: best ? { id: best.id, time_ms: best.t } : null, reference, gap_s: gap, phases, losses, strengths, notes, focus: focusList };
}
