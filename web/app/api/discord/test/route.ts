import { currentDriver, env } from "@/lib/auth";
import { testWebhook } from "@/lib/discord";

// Sends a test message to the team's Discord channel (admins).
export async function POST() {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  if (!env("DISCORD_WEBHOOK_URL")) return Response.json({ error: "DISCORD_WEBHOOK_URL is not set on the server" }, { status: 409 });
  await testWebhook();
  return Response.json({ ok: true });
}
