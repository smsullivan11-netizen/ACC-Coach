// Current release of the ACC Coach desktop app. The installer is served from web/public/downloads/
// (agent/build.ps1 copies it there and updates version, size and date). `notes`: what's new, shown on
// the download page and posted once on Discord when the release goes live (lib/discord.ts announceRelease).
export const APP_RELEASE = {
  version: "0.5",
  file: "/downloads/ACC-Coach-Setup.exe",
  sizeMb: 21.3,
  date: "2026-10-27",
  notes: [
    "Race HQ live clock: during a timed race, the app sends ACC's remaining race time to the team's Race HQ page, so its clock follows the game (only for drivers in the race plan, on the race's track).",
  ],
};

/** The app's Microsoft Store page (published 2026-10-16; listed as "direct link only": nobody finds it
 *  by searching, members install it from this link). Signed by Microsoft, so no SmartScreen or Smart
 *  App Control block, and it updates by itself. */
export const STORE_URL = "https://apps.microsoft.com/detail/9NXG975HDXPN";
