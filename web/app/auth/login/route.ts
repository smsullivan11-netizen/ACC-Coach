import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { appUrl, discordConfigured, env, NEXT_COOKIE, newToken, safeNext, stateCookie } from "@/lib/auth";

// Step 1 of Discord sign-in: send the browser to Discord's consent page.
// Scopes: identify (who you are) and guilds (to check you are in the team's Discord server).
// ?next=/path brings the user back there after signing in (e.g. the desktop app's link page).
export async function GET(request: NextRequest) {
  if (!discordConfigured()) return NextResponse.redirect(`${appUrl()}/?error=discord-not-configured`, 303);
  const state = newToken();
  const store = await cookies();
  store.set(stateCookie.name, state, stateCookie.options);
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  if (next) store.set(NEXT_COOKIE, next, stateCookie.options);
  else store.delete(NEXT_COOKIE);
  const params = new URLSearchParams({
    client_id: env("DISCORD_CLIENT_ID"),
    redirect_uri: `${appUrl()}/auth/callback`,
    response_type: "code",
    scope: "identify guilds",
    state,
  });
  return NextResponse.redirect(`https://discord.com/oauth2/authorize?${params}`, 303);
}
