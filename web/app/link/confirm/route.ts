import { NextResponse } from "next/server";
import { appUrl, currentDriver, newToken, sha256 } from "@/lib/auth";
import { sql } from "@/lib/db";

// "Link this PC" button: creates an upload token for the signed-in driver and hands it to the
// desktop app listening on this PC. Only reachable by a form posted from our own page: the session
// cookie is SameSite=Lax, so another site cannot post here on a driver's behalf.
export async function POST(request: Request) {
  const driver = await currentDriver();
  if (!driver) return NextResponse.redirect(`${appUrl()}/`, 303);
  const form = await request.formData();
  const port = String(form.get("port") ?? "");
  const state = String(form.get("state") ?? "");
  if (!/^\d{4,5}$/.test(port) || +port < 1024 || +port > 65535 || !/^[A-Za-z0-9_-]{16,128}$/.test(state))
    return new Response("Invalid link request", { status: 400 });

  const token = newToken("acc_");
  await sql`insert into agent_token (driver_id, token_hash, label)
            values (${driver.id}, ${sha256(token)}, ${"ACC Coach app"})`;
  const params = new URLSearchParams({ token, state, name: driver.display_name });
  return NextResponse.redirect(`http://127.0.0.1:${port}/callback?${params}`, 303);
}
