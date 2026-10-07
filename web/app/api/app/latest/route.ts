import { after } from "next/server";
import { appUrl } from "@/lib/auth";
import { APP_RELEASE } from "@/lib/app-release";
import { announceRelease } from "@/lib/discord";

// Latest desktop app version, checked by the app at startup to offer updates (no sign-in needed:
// the installer is useless without a team account). The first check after a release's deploy also
// posts it on Discord (once).
export async function GET() {
  after(() => announceRelease());
  return Response.json({ version: APP_RELEASE.version, url: `${appUrl()}/download` });
}
