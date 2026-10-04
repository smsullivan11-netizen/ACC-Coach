import { existsSync, readdirSync } from "node:fs";
import type { NextConfig } from "next";

// Track photos dropped into public/tracks/<key>.jpg replace the outline on the leaderboard cards:
// the list is read once at build time (public/ is not part of the server functions on Vercel).
const photos = existsSync("public/tracks")
  ? readdirSync("public/tracks").filter((f) => f.endsWith(".jpg")).map((f) => f.slice(0, -4))
  : [];

const nextConfig: NextConfig = {
  env: { TRACK_PHOTOS: photos.join(",") },
};

export default nextConfig;
