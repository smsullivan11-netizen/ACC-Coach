import { appUrl } from "@/lib/auth";
import { APP_RELEASE } from "@/lib/app-release";

// Latest desktop app version, checked by the app at startup to offer updates (no sign-in needed:
// the installer is useless without a team account).
export async function GET() {
  return Response.json({ version: APP_RELEASE.version, url: `${appUrl()}/download` });
}
