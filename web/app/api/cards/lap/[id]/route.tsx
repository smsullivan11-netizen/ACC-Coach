import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { currentDriver } from "@/lib/auth";
import { validCardSignature } from "@/lib/cards";
import { sql } from "@/lib/db";
import { carShortName, lapTime } from "@/lib/format";
import { hasPhoto, trackInfo, trackKey } from "@/lib/tracks";

// Lap card (PNG, 1200 × 630) for Discord and social media: track photo, lap time, driver, car,
// position in the team and the target. Signed-in members, or a signed link (lib/cards.ts).
// Font and photos are read from disk with literal paths, so the build includes only those folders.

const jpeg = (b: Buffer) => `data:image/jpeg;base64,${b.toString("base64")}`;

export async function GET(request: Request, ctx: RouteContext<"/api/cards/lap/[id]">) {
  const id = (await ctx.params).id.replace(/\.png$/, "");
  if (!/^\d+$/.test(id)) return new Response("not found", { status: 404 });
  const sig = new URL(request.url).searchParams.get("s");
  if (!validCardSignature(id, sig) && !(await currentDriver())) return new Response("sign in", { status: 401 });

  const [lap] = await sql<{ number: number; t: number; comparable: boolean; driver: string; track: string; car: string | null;
                             date: string; position: number | null; gap_ms: number | null; drivers: number | null; target_ms: number | null }[]>`
    select l.number, coalesce(l.official_lap_time_ms, l.game_lap_time_ms, l.lap_time_ms) as t, l.comparable,
           d.display_name as driver, t.key as track, c.key as car, to_char(coalesce(s.recorded_at, s.uploaded_at), 'DD Mon YYYY') as date,
           r.position::int, r.gap_ms,
           (select count(*) from lap_ranking x where x.track_id = s.track_id and x.car_class is not distinct from c.class)::int as drivers,
           ct.target_ms
    from lap l join session s on s.id = l.session_id join driver d on d.id = s.driver_id join track t on t.id = s.track_id
    left join car c on c.id = s.car_id left join lap_ranking r on r.lap_id = l.id
    left join car_target ct on ct.track_key = lower(t.key) and ct.car_key = c.key
    where l.id = ${id}`;
  if (!lap) return new Response("not found", { status: 404 });

  const info = trackInfo(lap.track);
  const [konexy, photo, helmet] = await Promise.all([
    readFile(join(process.cwd(), "app", "fonts", "KonexyPersonalUse.otf")),
    hasPhoto(lap.track) ? readFile(join(process.cwd(), "public", "tracks", `${trackKey(lap.track)}.jpg`)).then(jpeg) : null,
    readFile(join(process.cwd(), "public", "team-helmet.jpg")).then(jpeg),
  ]);
  const record = lap.position === 1;
  const vsTarget = lap.target_ms != null ? (lap.t - lap.target_ms) / 1000 : null;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#070707", color: "#fff", fontFamily: "sans-serif" }}>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} width={1200} height={630} style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "cover" }} alt="" />
        )}
        <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, display: "flex",
                      background: "linear-gradient(90deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.75) 50%, rgba(0,0,0,0.2) 100%)" }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 8, display: "flex", background: "linear-gradient(90deg, #ffd200 0%, #e10600 60%)" }} />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", padding: "56px 64px", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={helmet} width={64} height={64} style={{ borderRadius: 14 }} alt="" />
            <div style={{ display: "flex", fontFamily: "Konexy", fontSize: 30 }}>
              ACC <span style={{ color: "#ffd200", marginLeft: 12 }}>COACH</span>
            </div>
            <div style={{ display: "flex", marginLeft: "auto", fontFamily: "Konexy", fontSize: 22, color: "#e10600", letterSpacing: 4 }}>PCGR</div>
          </div>
          <div style={{ display: "flex", marginTop: 70, fontFamily: "Konexy", fontSize: 58, maxWidth: 900 }}>{info?.name ?? lap.track}</div>
          <div style={{ display: "flex", marginTop: 6, fontSize: 30, color: "#d4d4d8" }}>
            {lap.driver} · {lap.car ? carShortName(lap.car) : ""} · {lap.date}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 28, marginTop: 34 }}>
            <div style={{ display: "flex", fontSize: 120, fontWeight: 800, color: "#ffd200", lineHeight: 1 }}>{lapTime(lap.t)}</div>
            {record && (
              <div style={{ display: "flex", marginBottom: 14, padding: "8px 18px", borderRadius: 999, background: "#ffd200", color: "#070707", fontSize: 28, fontWeight: 700 }}>
                TEAM RECORD
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 40, marginTop: 26, fontSize: 28, color: "#a1a1aa" }}>
            {lap.position != null && !record && <span>P{lap.position} of {lap.drivers} · +{((lap.gap_ms ?? 0) / 1000).toFixed(3)} s to the record</span>}
            {vsTarget != null && (
              <span style={{ color: vsTarget <= 0 ? "#4ade80" : "#fca5a5" }}>
                {vsTarget <= 0 ? "Target beaten" : `Target ${lapTime(lap.target_ms!)} · ${vsTarget > 0 ? "+" : ""}${vsTarget.toFixed(3)} s`}
              </span>
            )}
            {!lap.comparable && <span>invalid lap</span>}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200, height: 630,
      fonts: [{ name: "Konexy", data: konexy.buffer.slice(konexy.byteOffset, konexy.byteOffset + konexy.byteLength) as ArrayBuffer, weight: 400, style: "normal" }],
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}
