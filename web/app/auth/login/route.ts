import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appUrl, discordConfigured, newToken, stateCookie } from "@/lib/auth";

// Step 1 of Discord sign-in: send the browser to Discord's consent page.
// Scopes: identify (who you are) and guilds (to check you are in the team's Discord server).
export async function GET() {
  if (!discordConfigured()) return NextResponse.redirect(`${appUrl()}/?error=discord-not-configured`, 303);
  const state = newToken();
  (await cookies()).set(stateCookie.name, state, stateCookie.options);
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: `${appUrl()}/auth/callback`,
    response_type: "code",
    scope: "identify guilds",
    state,
  });
  return NextResponse.redirect(`https://discord.com/oauth2/authorize?${params}`, 303);
}
