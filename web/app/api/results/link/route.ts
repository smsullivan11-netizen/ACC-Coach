import { currentDriver } from "@/lib/auth";
import { linkSteamId } from "@/lib/results";

// Link a driver of the imported results (Steam ID) to a team member (admins). Body: { steam_id, driver_id }.
export async function POST(request: Request) {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const { steam_id, driver_id } = (await request.json().catch(() => ({}))) as { steam_id?: string; driver_id?: string };
  if (!steam_id || !/^[A-Za-z0-9]{3,40}$/.test(steam_id) || !driver_id || !/^\d+$/.test(driver_id))
    return Response.json({ error: "steam_id and driver_id expected" }, { status: 400 });
  await linkSteamId(steam_id, driver_id);
  return Response.json({ ok: true });
}
