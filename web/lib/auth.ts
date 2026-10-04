import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "./db";

// Sign-in with Discord, restricted to members of the team's Discord server (DISCORD_GUILD_ID).
// Browser sessions: random token in an httpOnly cookie, only its sha256 is stored (web_session).
// Agents (recorder / upload script): personal upload tokens, also stored as sha256 (agent_token).

export const SESSION_COOKIE = "acc_session";
export const STATE_COOKIE = "acc_oauth_state";
export const NEXT_COOKIE = "acc_next";

/** A path on this site to return to after signing in ("/link?…"), never another site. */
export const safeNext = (next: string | null | undefined) =>
  next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : null;
const SESSION_DAYS = 30;

export type Driver = { id: string; display_name: string; avatar_url: string | null; is_admin: boolean };

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = (prefix = "") => prefix + randomBytes(32).toString("base64url");

/** A setting, without the spaces or tabs that easily come along when pasting it into a dashboard. */
export const env = (name: string) => (process.env[name] ?? "").trim();

export const appUrl = () => (env("APP_URL") || "http://localhost:3000").replace(/\/$/, "");
export const discordConfigured = () =>
  Boolean(env("DISCORD_CLIENT_ID") && env("DISCORD_CLIENT_SECRET") && env("DISCORD_GUILD_ID"));
// Local development only: sign in without Discord (never available in production builds)
export const devLoginEnabled = () => process.env.NODE_ENV !== "production" && env("DEV_LOGIN") === "1";

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

export async function startSession(driverId: string) {
  const token = newToken();
  await sql`insert into web_session (id_hash, driver_id, expires_at)
            values (${sha256(token)}, ${driverId}, now() + make_interval(days => ${SESSION_DAYS}))`;
  await sql`update driver set last_seen_at = now() where id = ${driverId}`;
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(SESSION_DAYS * 86400));
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await sql`delete from web_session where id_hash = ${sha256(token)}`;
  store.delete(SESSION_COOKIE);
}

export async function currentDriver(): Promise<Driver | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [driver] = await sql<Driver[]>`
    select d.id, d.display_name, d.avatar_url, d.is_admin
    from web_session s join driver d on d.id = s.driver_id
    where s.id_hash = ${sha256(token)} and s.expires_at > now()`;
  return driver ?? null;
}

/** For pages: the signed-in driver, or back to the home page. */
export async function requireDriver(): Promise<Driver> {
  const driver = await currentDriver();
  if (!driver) redirect("/");
  return driver;
}

/** For API routes: browser session, or `Authorization: Bearer <upload token>` (agents). */
export async function driverFromRequest(request: Request): Promise<Driver | null> {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const [driver] = await sql<Driver[]>`
      update agent_token t set last_used_at = now()
      from driver d
      where t.token_hash = ${sha256(auth.slice(7).trim())} and t.revoked_at is null and d.id = t.driver_id
      returning d.id, d.display_name, d.avatar_url, d.is_admin`;
    return driver ?? null;
  }
  return currentDriver();
}

/** Creates or updates a driver from a Discord profile; returns the driver id. */
export async function upsertDiscordDriver(profile: { id: string; name: string; avatar: string | null }) {
  const [row] = await sql<{ id: string }[]>`
    insert into driver (display_name, discord_id, avatar_url)
    values (${profile.name}, ${profile.id}, ${profile.avatar})
    on conflict (discord_id) do update set display_name = excluded.display_name, avatar_url = excluded.avatar_url
    returning id`;
  return row.id;
}

export const stateCookie = { name: STATE_COOKIE, options: cookieOptions(600) };
