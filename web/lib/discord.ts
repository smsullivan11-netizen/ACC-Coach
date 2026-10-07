import "server-only";
import { APP_RELEASE } from "./app-release";
import { appUrl, env, REVIEW_DISCORD_ID } from "./auth";
import { lapCardUrl, rankCardUrl } from "./cards";
import { sql } from "./db";
import { rankFor, rankLevel } from "./ranks";
import { carShortName, lapTime } from "./format";
import { trackInfo } from "./tracks";

// Team news on Discord through a webhook (DISCORD_WEBHOOK_URL, created in the channel's settings:
// Integrations > Webhooks). No bot to host: the site posts after each upload. Never fails an upload.

const YELLOW = 0xffd200, GREEN = 0x22c55e;

async function post(body: unknown) {
  const url = env("DISCORD_WEBHOOK_URL");
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "ACC Coach", avatar_url: `${appUrl()}/team-helmet.jpg`, allowed_mentions: { parse: [] }, ...body as object }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error("discord webhook", res.status, await res.text());
  } catch (e) {
    console.error("discord webhook failed", e);
  }
}

/** After an upload: team record, record equalled or personal best (with the lap card), and rank promotions. */
export async function announceSession(sessionId: string) {
  if (!env("DISCORD_WEBHOOK_URL")) return;
  const [s] = await sql<{ driver: string; driver_id: string; track: string; car: string | null }[]>`
    select d.display_name as driver, d.id as driver_id, t.key as track, c.key as car
    from session s join driver d on d.id = s.driver_id join track t on t.id = s.track_id left join car c on c.id = s.car_id
    where s.id = ${sessionId}`;
  if (!s) return;
  const [{ reviewer }] = await sql<{ reviewer: boolean }[]>`
    select coalesce(discord_id = ${REVIEW_DISCORD_ID}, false) as reviewer from driver where id = ${s.driver_id}`;
  if (reviewer) return;   // the Store's test account: never announced
  const track = trackInfo(s.track)?.name ?? s.track;
  const embeds: object[] = [];

  // The session's best lap, if it is now the driver's best on the track (it is in the ranking)
  const [best] = await sql<{ lap_id: string; t: number; position: number; gap_ms: number; drivers: number; prev: number | null; team_prev: number | null }[]>`
    select r.lap_id, r.lap_time_ms as t, r.position::int, r.gap_ms,
           (select count(*) from lap_ranking x where x.track_id = r.track_id and x.car_class is not distinct from r.car_class)::int as drivers,
           (select min(coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms)) from lap l join session ss on ss.id = l.session_id
            left join car c on c.id = ss.car_id where ss.driver_id = r.driver_id and ss.track_id = r.track_id
              and c.class is not distinct from r.car_class and l.comparable and ss.id < ${sessionId}) as prev,
           (select min(coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms)) from lap l join session ss on ss.id = l.session_id
            left join car c on c.id = ss.car_id where ss.track_id = r.track_id and c.class is not distinct from r.car_class
              and l.comparable and ss.id < ${sessionId}) as team_prev
    from lap_ranking r join lap l on l.id = r.lap_id where l.session_id = ${sessionId}`;
  if (best) {
    // A record beats every earlier lap of the team in the class; equal to it is a shared record
    const record = best.team_prev == null || best.t < best.team_prev;
    const equal = !record && best.t === best.team_prev;
    const improved = best.prev != null ? ` (${((best.t - best.prev) / 1000).toFixed(3)} s)` : "";
    embeds.push({
      color: record ? YELLOW : GREEN,
      title: record ? `👑 New team record at ${track}` : equal ? `🤝 Team record equalled at ${track}` : `⏱️ New personal best at ${track}`,
      description: `**${s.driver}** · ${lapTime(best.t)}${improved} · ${s.car ? carShortName(s.car) : ""}\n` +
        (record ? "Fastest lap of the team." : equal ? "Same time as the team record." : `P${best.position} of ${best.drivers} in the team, +${(best.gap_ms / 1000).toFixed(3)} s to the record.`),
      url: `${appUrl()}/laps/${best.lap_id}`,
      image: { url: lapCardUrl(best.lap_id, best.t) },
    });
  }
  // Rank promotion (lib/ranks.ts): the only post besides lap records
  const [r] = await sql<{ rating: number; prev: number | null }[]>`
    select rating, prev from (select session_id, rating, lag(rating) over (order by id) as prev
                              from driver_rating where driver_id = ${s.driver_id}) x
    where session_id = ${sessionId}`;   // only this upload's rating: no repeat when a session is not rated
  if (r?.prev != null && rankLevel(r.rating) > rankLevel(r.prev)) embeds.push(promotion(s.driver, s.driver_id, r.rating, r.prev));
  if (embeds.length) await post({ embeds });
}

const promotion = (driver: string, driverId: string, rating: number, prev: number) => {
  const rank = rankFor(rating);
  return {
    color: parseInt(rank.color.slice(1), 16),
    title: `🎖️ ${driver} ranks up: ${rankFor(prev).title} → ${rank.title}`,
    description: `Overall Driver Rating **${rating.toFixed(1)}** (from ${prev.toFixed(1)}).`,
    url: `${appUrl()}/drivers/${driverId}`,
    image: { url: rankCardUrl(driverId, prev, rating) },
  };
};

/** Every driver's current rating (their latest rating row). */
export async function currentRatings() {
  const rows = await sql<{ driver_id: string; rating: number }[]>`
    select distinct on (driver_id) driver_id, rating from driver_rating order by driver_id, id desc`;
  return new Map(rows.map((r) => [r.driver_id, r.rating]));
}

/** After ratings were replayed (Recompute all ratings, a session type changed, edge laps): posts the
 *  rank promotions it caused, like after an upload. Rank drops are not posted. */
export async function announcePromotions(before: Map<string, number>) {
  if (!env("DISCORD_WEBHOOK_URL")) return;
  const after = await currentRatings();
  const up = [...after].filter(([id, r]) => before.has(id) && rankLevel(r) > rankLevel(before.get(id)!));
  if (!up.length) return;
  const names = new Map((await sql<{ id: string; display_name: string }[]>`
    select id, display_name from driver where id in ${sql(up.map(([id]) => id))}`).map((d) => [d.id, d.display_name]));
  const embeds = up.map(([id, r]) => promotion(names.get(id) ?? "A driver", id, r, before.get(id)!));
  for (let i = 0; i < embeds.length; i += 10) await post({ embeds: embeds.slice(i, i + 10) });   // Discord: 10 per message
}

/** A new desktop app version (lib/app-release.ts, user's request 2026-10-07), posted once: the first
 *  upload or app update check after the deploy posts it (site_state 'app_announced', migration 0015). */
export async function announceRelease() {
  if (!env("DISCORD_WEBHOOK_URL") || !(APP_RELEASE.sizeMb > 0)) return;
  try {
    const first = await sql`
      insert into site_state (key, value) values ('app_announced', ${APP_RELEASE.version})
      on conflict (key) do update set value = excluded.value, updated_at = now()
        where site_state.value is distinct from excluded.value
      returning key`;
    if (!first.length) return;   // already posted
  } catch (e) {
    console.error("release announcement", e);   // before migration 0015
    return;
  }
  await post({ embeds: [{
    color: YELLOW,
    title: `🆕 ACC Coach ${APP_RELEASE.version} is out`,
    description: [
      ...APP_RELEASE.notes.map((n) => `• ${n}`),
      "",
      `**Installer**: download it from the [download page](${appUrl()}/download) and run it over the old one.`,
      "**Microsoft Store**: it updates by itself once the Store has published it (a few days).",
    ].join("\n"),
    url: `${appUrl()}/download`,
  }] });
}

/** Admin test message from Settings. */
export const testWebhook = () => post({ content: "✅ ACC Coach is connected to this channel." });
