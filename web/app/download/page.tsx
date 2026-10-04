import { requireDriver } from "@/lib/auth";
import { APP_RELEASE } from "@/lib/app-release";

export default async function DownloadPage() {
  await requireDriver();
  const ready = APP_RELEASE.sizeMb > 0;
  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-white">The ACC Coach app</h1>
      <p className="mt-2 text-zinc-400">
        It runs in the background (icon next to the clock), records every session you drive in ACC and uploads it
        here automatically when the session ends. Windows 10 or 11.
      </p>
      {ready ? (
        <a href={APP_RELEASE.file}
           className="mt-6 inline-block rounded-md bg-accent px-5 py-2.5 font-semibold text-ink hover:brightness-110">
          Download ACC Coach {APP_RELEASE.version} ({APP_RELEASE.sizeMb} MB)
        </a>
      ) : (
        <p className="mt-6 text-zinc-500">The first version is being prepared.</p>
      )}
      <h2 className="mt-10 font-medium text-white">Install</h2>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-zinc-300">
        <li>Run <code>ACC-Coach-Setup.exe</code>.</li>
        <li>
          Windows may say <em>&quot;Windows protected your PC&quot;</em>: the app is not signed by a paid certificate.
          Click <strong>More info</strong>, then <strong>Run anyway</strong>.
        </li>
        <li>At the end, the app starts and opens this site: click <strong>Link this PC</strong>. Done.</li>
        <li>Drive. After each session (back in the menus), a notification tells you the laps are uploaded.</li>
      </ol>
      <h2 className="mt-10 font-medium text-white">Good to know</h2>
      <ul className="mt-2 list-disc space-y-2 pl-5 text-zinc-400">
        <li>It starts with Windows (you can turn that off in its menu: right-click the icon).</li>
        <li>It only reads the data ACC publishes for apps; it uses about 4 % of one CPU core while you drive.</li>
        <li>Recordings are kept on your PC for 30 days, then deleted; uploaded laps stay on the site.</li>
        <li>If ACC and the app run with different administrator rights, the app cannot see ACC: run both normally.</li>
      </ul>
    </div>
  );
}
