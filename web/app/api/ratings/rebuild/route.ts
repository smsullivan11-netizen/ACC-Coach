import { rebuildAchievements } from "@/lib/achievements";
import { currentDriver } from "@/lib/auth";
import { sql } from "@/lib/db";
import { rebuildRatings } from "@/lib/ratings";

// Recomputes every rating, then every achievement, from all sessions in upload order (admins): for
// sessions uploaded before they existed, or after changing a rule. Nothing is posted to Discord.
export const maxDuration = 60;

export async function POST() {
  const me = await currentDriver();
  if (!me?.is_admin) return Response.json({ error: "admins only" }, { status: 403 });
  const ratings = await rebuildRatings(sql);
  const achievements = await rebuildAchievements();
  return Response.json({ ...ratings, achievements: achievements.achievements });
}
