import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { appUrl, startSession, stateCookie, upsertDiscordDriver } from "@/lib/auth";

// Step 2 of Discord sign-in: Discord sends the browser back with a one-time code.
const fail = (error: string) => NextResponse.redirect(`${appUrl()}/?error=${error}`, 303);

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const store = await cookies();
  const expected = store.get(stateCookie.name)?.value;
  store.delete(stateCookie.name);
  if (!code || !state || state !== expected) return fail("sign-in-expired");

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${appUrl()}/auth/callback`,
    }),
  });
  if (!tokenRes.ok) return fail("discord-error");
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const headers = { Authorization: `Bearer ${access_token}` };

  const [userRes, guildsRes] = await Promise.all([
    fetch("https://discord.com/api/users/@me", { headers }),
    fetch("https://discord.com/api/users/@me/guilds", { headers }),
  ]);
  if (!userRes.ok || !guildsRes.ok) return fail("discord-error");
  const user = (await userRes.json()) as { id: string; username: string; global_name: string | null; avatar: string | null };
  const guilds = (await guildsRes.json()) as { id: string }[];
  if (!guilds.some((g) => g.id === process.env.DISCORD_GUILD_ID)) return fail("not-in-team");

  const driverId = await upsertDiscordDriver({
    id: user.id,
    name: user.global_name || user.username,
    avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null,
  });
  await startSession(driverId);
  return NextResponse.redirect(`${appUrl()}/sessions`, 303);
}
