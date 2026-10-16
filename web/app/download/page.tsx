import { Cpu, Download, ExternalLink, HardDrive, Info, Power, Gauge, Sparkles, Store } from "lucide-react";
import type { Metadata } from "next";
import { delay, PageTitle, SectionTitle } from "@/components/ui";
import { APP_RELEASE, STORE_URL } from "@/lib/app-release";
import { requireDriver } from "@/lib/auth";

export const metadata: Metadata = { title: "Get the app" };

// Since 2026-10-16 the Microsoft Store is the way to install (signed by Microsoft: no SmartScreen or Smart
// App Control block, automatic updates); the installer stays as the alternative.
const STORE_STEPS = [
  <>Open the <a href={STORE_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline">Microsoft Store page</a> and click <strong>Get</strong> (or <strong>Install</strong>).</>,
  <>Start <strong>ACC Coach</strong> from the Start menu: it opens this site, click <strong>Link this PC</strong>. Done.</>,
  <>Drive. After each session (back in the menus), a notification tells you the laps are uploaded. New versions arrive through the Store by themselves.</>,
];

const STEPS = [
  <>Run <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">ACC-Coach-Setup.exe</code>.</>,
  <>Windows may say <em>&quot;Windows protected your PC&quot;</em>: the app is not signed by a paid certificate. Click <strong>More info</strong>, then <strong>Run anyway</strong>.</>,
  <>At the end, the app starts and opens this site: click <strong>Link this PC</strong>. Done.</>,
  <>Drive. After each session (back in the menus), a notification tells you the laps are uploaded.</>,
];

export default async function DownloadPage() {
  await requireDriver();
  const ready = APP_RELEASE.sizeMb > 0;
  return (
    <div className="max-w-3xl">
      <PageTitle icon={Download} sub="It runs in the background (icon next to the clock), records every session you drive in ACC and uploads it here automatically when the session ends. Windows 10 or 11.">
        The ACC Coach app
      </PageTitle>
      <div className="card card-red rise relative flex flex-wrap items-center gap-6 overflow-hidden p-6" style={delay(40)}>
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/team-helmet.jpg" alt="" width={72} height={72} className="relative rounded-2xl ring-1 ring-white/10" />
        <div className="relative">
          <div className="display text-xl text-white">ACC <span className="text-accent">COACH</span></div>
          <div className="text-sm text-zinc-400">Version {APP_RELEASE.version} · {APP_RELEASE.date}</div>
        </div>
        <div className="relative ml-auto flex flex-col items-end gap-1.5">
          <a href={STORE_URL} target="_blank" rel="noreferrer" className="btn btn-primary px-5 py-2.5 text-base">
            <Store size={18} /> Get it from the Microsoft Store <ExternalLink size={14} />
          </a>
          {ready && (
            <a href={APP_RELEASE.file} className="text-xs text-zinc-400 hover:text-white hover:underline">
              or download the installer ({APP_RELEASE.sizeMb} MB)
            </a>
          )}
        </div>
      </div>

      {ready && APP_RELEASE.notes.length > 0 && (
        <section className="card rise mt-5 p-5" style={delay(70)}>
          <SectionTitle icon={Sparkles}>What&apos;s new in {APP_RELEASE.version}</SectionTitle>
          <ul className="space-y-2 text-sm text-zinc-300">
            {APP_RELEASE.notes.map((n) => (
              <li key={n} className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /> {n}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="card rise mt-5 p-5" style={delay(100)}>
        <SectionTitle icon={Store}>Install from the Microsoft Store</SectionTitle>
        <ol className="space-y-3">
          {STORE_STEPS.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm text-zinc-300">
              <span className="display grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent/15 text-xs text-accent">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-zinc-500">
          Already using the installer version? Uninstall it first (Settings &gt; Apps &gt; ACC Coach), then install from the Store and link the PC once more.
          The Store page only opens from this link: the app does not show up in the Store&apos;s search.
        </p>
      </section>

      {ready && <section className="card rise mt-5 p-5" style={delay(130)}>
        <SectionTitle icon={HardDrive}>Or with the installer</SectionTitle>
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm text-zinc-300">
              <span className="display grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent/15 text-xs text-accent">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-zinc-500">On some PCs Windows&apos; Smart App Control blocks the installer outright (it is not signed): use the Store then.</p>
      </section>}

      <section className="card rise mt-5 p-5" style={delay(160)}>
        <SectionTitle icon={Info}>Good to know</SectionTitle>
        <ul className="space-y-2.5 text-sm text-zinc-400">
          <li className="flex gap-2.5"><Gauge size={16} className="mt-0.5 shrink-0 text-race" /> Live race engineer (right-click the icon → Race engineer): fuel to add, tyre pressure advice, tyre and brake wear, damage. Open it on a second screen, or share it on your Wi-Fi to follow it on a phone or a teammate&apos;s PC.</li>
          <li className="flex gap-2.5"><Power size={16} className="mt-0.5 shrink-0 text-race" /> It starts with Windows (you can turn that off in its menu: right-click the icon).</li>
          <li className="flex gap-2.5"><Cpu size={16} className="mt-0.5 shrink-0 text-race" /> It only reads the data ACC publishes for apps; it uses about 4 % of one CPU core while you drive.</li>
          <li className="flex gap-2.5"><HardDrive size={16} className="mt-0.5 shrink-0 text-race" /> Recordings are kept on your PC for 30 days, then deleted; uploaded laps stay on the site.</li>
          <li className="flex gap-2.5"><Info size={16} className="mt-0.5 shrink-0 text-race" /> If ACC and the app run with different administrator rights, the app cannot see ACC: run both normally.</li>
        </ul>
      </section>
    </div>
  );
}
