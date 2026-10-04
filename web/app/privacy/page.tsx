import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Privacy policy" };

// Public (no sign-in): the Microsoft Store listing links here. Keep it in line with what the app and
// the site actually do when either changes.
export default function PrivacyPage() {
  return (
    <div className="max-w-3xl">
      <PageTitle icon={ShieldCheck} sub="Last updated: October 5, 2026">Privacy policy</PageTitle>
      <div className="card p-6 text-zinc-300 [&_h2]:mt-8 [&_h2]:font-medium [&_h2]:text-white [&_li]:mt-1.5 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
      <p>
        ACC Coach (this site and the ACC Coach desktop app) is a private tool run by a sim-racing team for its own
        members. It is not a commercial service: there are no ads, no trackers, and no data is sold or shared with
        anyone outside the team.
      </p>

      <h2>What the desktop app records</h2>
      <ul>
        <li>
          Only while Assetto Corsa Competizione is running, the data the game publishes for apps: inputs (throttle,
          brake, steering, gear), speed, the car&apos;s position on track, lap times and lap validity, and the session
          details (track, car, session type, the driver name set in the game).
        </li>
        <li>Nothing else on your PC: no other programs, files, keystrokes or browsing.</li>
        <li>
          Recordings are stored in the app&apos;s folder on your PC and deleted 30 days after they have been uploaded.
          The app also stores the team site&apos;s address, your driver name and an upload token that links the PC to
          your account.
        </li>
      </ul>

      <h2>What is uploaded to the team site</h2>
      <ul>
        <li>After each session: the laps (times, validity, lap traces on a 1 m grid, per-corner results).</li>
        <li>
          Sign-in uses Discord: your Discord ID, username and avatar are stored. The list of your Discord servers is
          read only to check that you are a member of the team&apos;s server; it is not stored.
        </li>
        <li>A sign-in cookie keeps you signed in. No other cookies are used.</li>
      </ul>

      <h2>Who can see it</h2>
      <p className="mt-2">
        Only signed-in team members. Every member can see everyone&apos;s laps, comparisons, ratings and driver
        profiles: that is the purpose of the tool.
      </p>
      <ul>
        <li>Team news (new records, personal bests, achievements, rating changes) is posted in the team&apos;s Discord channel.</li>
        <li>
          A lap card (an image with the track, the driver&apos;s name, the car and the lap time) can be opened by anyone who
          has its link, so it can be shown on Discord or shared. Members choose to share it; nothing else is public.
        </li>
      </ul>

      <h2>Where it is stored, and for how long</h2>
      <ul>
        <li>The site is hosted by Vercel; the database by Neon (Frankfurt, EU).</li>
        <li>
          Lap traces are deleted after 60 days, except each driver&apos;s best laps and their 10 most recent sessions.
          Lap times, results and ratings are kept as long as the team uses the site.
        </li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>Unlink a PC at any time by revoking its token in Settings; quit or uninstall the app to stop recording.</li>
        <li>Ask a team admin to delete your data: your account, laps and ratings are removed.</li>
      </ul>

      <h2>Contact</h2>
      <p className="mt-2">Questions or requests: contact a team admin on the team&apos;s Discord server.</p>
      </div>
    </div>
  );
}
