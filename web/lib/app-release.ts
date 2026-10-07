// Current release of the ACC Coach desktop app. The installer is served from web/public/downloads/
// (agent/build.ps1 copies it there and updates version, size and date). `notes`: what's new, shown on
// the download page and posted once on Discord when the release goes live (lib/discord.ts announceRelease).
export const APP_RELEASE = {
  version: "0.4",
  file: "/downloads/ACC-Coach-Setup.exe",
  sizeMb: 21.3,
  date: "2026-10-07",
  notes: [
    "After each upload, the notification shows your new rating and the change (+1.3), and any promotion.",
    "Online sessions: the app reads the server's name and the BoP the server gave your car (kg, restrictor) from ACC's log. LFM sessions are detected automatically and rated against LFM's reference times.",
  ],
};
