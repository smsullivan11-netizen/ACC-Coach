import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { rebuildRatings } from "@/lib/ratings";

// Recomputes every rating from all sessions, in upload order (admins). For sessions uploaded before
// ratings existed, or after changing the rating formula.
export const maxDuration = 60;

export async function POST() {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  return Response.json(await rebuildRatings(sql));
}
