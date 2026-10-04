import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { appUrl, env } from "./auth";

// Shareable lap cards (/api/cards/lap/<id>): images of a lap for Discord and social media. The rest
// of the site needs a sign-in; a card link carries a signature instead, so Discord can show it.
// The signature uses CARD_SECRET, or the Discord client secret when it is not set (both server-only).

const secret = () => env("CARD_SECRET") || env("DISCORD_CLIENT_SECRET") || "dev-only-card-secret";

export const cardSignature = (lapId: string) =>
  createHmac("sha256", secret()).update(`lap-card:${lapId}`).digest("base64url").slice(0, 22);

export function validCardSignature(lapId: string, sig: string | null) {
  if (!sig) return false;
  const a = Buffer.from(cardSignature(lapId)), b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Public link to a lap's card. `v` busts Discord's image cache when the lap's data changes. */
export const lapCardUrl = (lapId: string, v?: string | number) =>
  `${appUrl()}/api/cards/lap/${lapId}.png?s=${cardSignature(lapId)}${v != null ? `&v=${v}` : ""}`;
