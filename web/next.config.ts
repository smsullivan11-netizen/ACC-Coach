import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The lap card route reads the team font and the track photos from disk
  outputFileTracingIncludes: {
    "/api/cards/lap/*": ["./app/fonts/**/*", "./public/tracks/*.jpg", "./public/team-helmet.jpg"],
  },
};

export default nextConfig;
