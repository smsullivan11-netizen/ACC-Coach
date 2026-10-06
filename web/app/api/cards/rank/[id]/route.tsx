import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { PCGR_RED, RankSymbol } from "@/components/ui";
import { currentDriver } from "@/lib/auth";
import { validRankSignature } from "@/lib/cards";
import { sql } from "@/lib/db";
import { rankFor } from "@/lib/ranks";

// Rank promotion card (PNG, 1200 × 630) for the Discord post: the old rank's gauge → the new one,
// in their colours (lib/ranks.ts), the driver and the new rating. Signed link (lib/cards.ts).

const jpeg = (b: Buffer) => `data:image/jpeg;base64,${b.toString("base64")}`;

export async function GET(request: Request, ctx: RouteContext<"/api/cards/rank/[id]">) {
  const id = (await ctx.params).id.replace(/\.png$/, "");
  const q = new URL(request.url).searchParams;
  const from = q.get("from") ?? "", to = q.get("to") ?? "";
  if (!/^\d+$/.test(id) || !/^\d+(\.\d)?$/.test(from) || !/^\d+(\.\d)?$/.test(to)) return new Response("not found", { status: 404 });
  if (!validRankSignature(id, from, to, q.get("s")) && !(await currentDriver())) return new Response("sign in", { status: 401 });
  const [d] = await sql<{ display_name: string }[]>`select display_name from driver where id = ${id}`;
  if (!d) return new Response("not found", { status: 404 });

  const before = rankFor(Number(from)), after = rankFor(Number(to));
  const [konexy, helmet] = await Promise.all([
    readFile(join(process.cwd(), "app", "fonts", "KonexyPersonalUse.otf")),
    readFile(join(process.cwd(), "public", "team-helmet.jpg")).then(jpeg),
  ]);
  const badge = (r: typeof after, size: number, dim: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, opacity: dim ? 0.55 : 1 }}>
      <div style={{ display: "flex", width: size + 48, height: size + 48, alignItems: "center", justifyContent: "center", borderRadius: 36,
                    background: `${r.color}26`, border: `3px solid ${r.color}aa`, boxShadow: dim ? "none" : `0 0 60px ${r.color}88` }}>
        <RankSymbol rank={r} size={size} track="#ffffff" />
      </div>
      <div style={{ display: "flex", fontFamily: "Konexy", fontSize: dim ? 30 : 40, color: r.color }}>{r.title.toUpperCase()}</div>
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", position: "relative", color: "#fff", fontFamily: "sans-serif",
                    background: `radial-gradient(circle at 25% 60%, ${before.color}33, transparent 45%), radial-gradient(circle at 75% 60%, ${after.color}55, transparent 50%), #070707` }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 10, display: "flex", background: `linear-gradient(90deg, ${before.color}, ${after.color})` }} />
        <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "44px 64px 0" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={helmet} width={56} height={56} style={{ borderRadius: 12 }} alt="" />
          <div style={{ display: "flex", fontFamily: "Konexy", fontSize: 26 }}>ACC <span style={{ color: "#ffd200", marginLeft: 10 }}>COACH</span></div>
          <div style={{ display: "flex", marginLeft: "auto", fontFamily: "Konexy", fontSize: 20, letterSpacing: 4 }}>
            <span style={{ color: "#ffffff" }}>PC</span><span style={{ color: PCGR_RED }}>GR</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 6 }}>
          <div style={{ display: "flex", fontSize: 26, letterSpacing: 8, color: "#a1a1aa", fontWeight: 700 }}>RANK UP</div>
          <div style={{ display: "flex", fontFamily: "Konexy", fontSize: 60, marginTop: 4 }}>{d.display_name}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 56, marginTop: 18 }}>
          {badge(before, 104, true)}
          <div style={{ display: "flex", fontSize: 90, color: after.color, marginTop: -50 }}>→</div>
          {badge(after, 150, false)}
        </div>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: 14, marginTop: 14 }}>
          <span style={{ fontSize: 26, color: "#a1a1aa" }}>Overall Driver Rating</span>
          <span style={{ fontSize: 54, fontWeight: 800, color: after.color }}>{Number(to).toFixed(1)}</span>
          <span style={{ fontSize: 26, color: "#71717a" }}>from {Number(from).toFixed(1)}</span>
        </div>
      </div>
    ),
    {
      width: 1200, height: 630,
      fonts: [{ name: "Konexy", data: konexy.buffer.slice(konexy.byteOffset, konexy.byteOffset + konexy.byteLength) as ArrayBuffer, weight: 400, style: "normal" }],
      headers: { "Cache-Control": "public, max-age=86400" },
    },
  );
}
