import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { appUrl, devLoginEnabled, startSession, upsertDiscordDriver } from "@/lib/auth";

// Local development only (DEV_LOGIN=1, never in production): sign in as a test driver without
// Discord, e.g. /auth/dev?name=Alice
export async function GET(request: NextRequest) {
  if (!devLoginEnabled()) return new Response("Not found", { status: 404 });
  const name = request.nextUrl.searchParams.get("name") || "Dev Driver";
  const driverId = await upsertDiscordDriver({ id: `dev-${name.toLowerCase()}`, name, avatar: null });
  await startSession(driverId);
  return NextResponse.redirect(`${appUrl()}/`, 303);
}
