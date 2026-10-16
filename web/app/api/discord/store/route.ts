import { currentDriver, env } from "@/lib/auth";
import { announceStore } from "@/lib/discord";

// Posts "ACC Coach is on the Microsoft Store" to the team's Discord channel, once (admins, Settings).
export async function POST() {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  if (!env("DISCORD_WEBHOOK_URL")) return Response.json({ error: "DISCORD_WEBHOOK_URL is not set on the server" }, { status: 409 });
  const result = await announceStore();
  if (result === "already") return Response.json({ error: "The Store announcement was already posted." }, { status: 409 });
  if (result === "failed") return Response.json({ error: "Discord refused the message: try again later." }, { status: 502 });
  return Response.json({ ok: true });
}
