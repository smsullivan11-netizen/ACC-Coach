"use client";

import {
  AlarmClock, Archive, ArrowLeft, ArrowRight, CalendarClock, Check, ChevronRight,
  CircleAlert, Clock3, Edit3, Flag, Fuel, History, Megaphone,
  Plus, Radio, Save, Send, Settings2, ShieldCheck, Timer, Trash2, UserRound, Users, X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Driver } from "@/lib/auth";
import type { RaceHQData, RaceStint, RaceUpdate } from "@/lib/race-hq";
import styles from "./RaceHQ.module.css";

type Member = { id: string; display_name: string; avatar_url: string | null };
type ArchiveRow = { id: string; title: string; track_key: string; starts_at: string; duration_min: number; cars: number };
type Tab = "overview" | "stints" | "updates" | "pit" | "archive";

const pad = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, "0");
const duration = (seconds: number) => `${pad(seconds / 3600)}:${pad((seconds % 3600) / 60)}:${pad(seconds % 60)}`;
const hm = (iso: string) => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const day = (iso: string) => new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date(iso));
const initials = (name: string | null) => (name ?? "?").split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
const inputDate = (iso: string) => {
  const d = new Date(iso), local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

async function jsonRequest(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export default function RaceHQ({ initial, archive, members, me }: {
  initial: RaceHQData | null; archive: ArchiveRow[]; members: Member[]; me: Driver;
}) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedCar, setSelectedCar] = useState(initial?.cars[0]?.id ?? "");
  const [now, setNow] = useState(() => initial ? new Date(initial.event.server_now).getTime() : 0);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [create, setCreate] = useState(false);
  const [controls, setControls] = useState(false);

  async function refresh(silent = false) {
    if (!data) return;
    try {
      const result = await jsonRequest(`/api/race-hq?id=${data.event.id}`);
      setData(result.data);
      if (!selectedCar && result.data?.cars[0]) setSelectedCar(result.data.cars[0].id);
    } catch (e) { if (!silent) setMessage((e as Error).message); }
  }
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = data && data.event.status !== "finished" ? window.setInterval(() => refresh(true), 15_000) : undefined;
    return () => { window.clearInterval(tick); if (poll) window.clearInterval(poll); };
  // Refresh interval deliberately follows the active event id, not each polling response.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.event.id, data?.event.status]);

  if (!data) return (
    <EmptyHQ archive={archive} members={members} me={me} open={create} setOpen={setCreate}
             onCreated={() => window.location.reload()} />
  );

  const event = data.event;
  const startMs = new Date(event.starts_at).getTime(), scheduledEnd = startMs + event.duration_min * 60_000;
  const sourceMs = event.clock_updated_at ? new Date(event.clock_updated_at).getTime() : null;
  const remaining = event.status === "finished" ? 0 : event.status === "live" && event.clock_remaining_s != null && sourceMs
    ? Math.max(0, event.clock_remaining_s - Math.floor((now - sourceMs) / 1000))
    : Math.max(0, Math.floor(((event.status === "upcoming" ? startMs : scheduledEnd) - now) / 1000));
  const elapsed = Math.max(0, event.duration_min * 60 - remaining);
  const progress = event.status === "upcoming" ? 0 : Math.min(100, elapsed / (event.duration_min * 60) * 100);
  const car = data.cars.find((c) => c.id === selectedCar) ?? data.cars[0];
  const ready = data.readiness.find((r) => r.driver_id === me.id)?.ready ?? false;
  const myNext = data.stints.filter((s) => s.driver_id === me.id && new Date(s.ends_at).getTime() > now)
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))[0];

  async function act(path: string, body: unknown, success?: string) {
    setBusy(true); setMessage(null);
    try {
      await jsonRequest(path, { method: path.endsWith(event.id) ? "PATCH" : "POST", body: JSON.stringify(body) });
      if (success) setMessage(success);
      await refresh();
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className={styles.shell}>
      {event.status === "finished" && <Link href="/race-hq" className={styles.back}><ArrowLeft size={15} /> Active race</Link>}
      <div className={styles.eventHead}>
        <div><p>PCGR · ENDURANCE</p><h2>{event.title}</h2><span>{event.track_key.replaceAll("_", " ")} · {data.cars.length} car{data.cars.length === 1 ? "" : "s"}</span></div>
        <div className={event.status === "live" ? styles.live : styles.status}>{event.status}</div>
      </div>

      <section className={styles.clock}>
        <div className={styles.clockTop}>
          <span><i className={event.status === "live" ? styles.redDot : styles.yellowDot} />{event.status === "upcoming" ? "RACE STARTS IN" : event.status === "finished" ? "RACE COMPLETE" : "RACE LIVE"}</span>
          <button onClick={() => data.can_lead && event.status !== "finished" && setControls(true)} disabled={!data.can_lead || event.status === "finished"}>
            {event.clock_source === "acc" ? <Radio size={13} /> : <Clock3 size={13} />}
            {event.clock_source === "acc" ? `ACC · ${sourceMs ? Math.max(0, Math.floor((now - sourceMs) / 1000)) : 0}s ago` : event.clock_source ?? "schedule"}
          </button>
        </div>
        <div className={styles.bigClock}>{duration(remaining)}</div>
        <p>{event.status === "upcoming" ? `Green flag ${day(event.starts_at)} · ${hm(event.starts_at)}` : "TIME REMAINING"}</p>
        <div className={styles.progress}><span style={{ width: `${progress}%` }} /></div>
        <div className={styles.clockFoot}><span>{duration(elapsed)} elapsed</span><span>Scheduled {event.duration_min / 60}h</span></div>
      </section>

      <nav className={styles.tabs} aria-label="Race Day HQ sections" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
        {(["overview", "stints", "updates", "pit", "archive"] as Tab[]).map((x) => (
          <button key={x} onClick={() => setTab(x)} aria-current={tab === x ? "page" : undefined}>
            {x === "pit" ? "Pit kit" : x[0].toUpperCase() + x.slice(1)}
            {x === "updates" && data.updates.filter((u) => u.kind === "official").length > 0 && <i>{data.updates.filter((u) => u.kind === "official").length}</i>}
          </button>
        ))}
      </nav>

      {message && <p className={styles.message}>{message}</p>}
      {tab === "overview" && <Overview data={data} now={now} myNext={myNext} ready={ready} busy={busy}
        onReady={() => act(`/api/race-hq/${event.id}/readiness`, { ready: !ready }, ready ? "Readiness removed." : "The team can see you’re ready.")}
        onPlan={(id) => { setSelectedCar(id); setTab("stints"); }} onUpdates={() => setTab("updates")} />}
      {tab === "stints" && <StintPlan data={data} car={car} selected={selectedCar} setSelected={setSelectedCar}
        members={members} now={now} busy={busy} onSave={(stints) => act(`/api/race-hq/${event.id}`, { action: "plan", car_id: car.id, stints }, "Stint plan updated and posted to the race feed.")} />}
      {tab === "updates" && <Updates data={data} busy={busy} onPost={(body, kind, carId) =>
        act(`/api/race-hq/${event.id}/updates`, { body, kind, car_id: carId }, kind === "official" ? "Official update posted." : "Comment posted.")} />}
      {tab === "pit" && <PitKit data={data} selected={selectedCar} setSelected={setSelectedCar} busy={busy}
        onSave={(notes) => act(`/api/race-hq/${event.id}`, { action: "details", notes }, "Race and pit notes updated.")} />}
      {tab === "archive" && <ArchiveList events={archive} currentId={event.id} />}

      <footer className={styles.footer}>
        <span><ShieldCheck size={13} /> Team members only</span>
        <div><button onClick={() => setTab("archive")}><History size={13} /> Archive</button>{data.can_lead && event.status !== "finished" && <button onClick={() => setControls(true)}><Settings2 size={13} /> Race controls</button>}</div>
      </footer>
      {controls && <RaceControls data={data} members={members} busy={busy} close={() => setControls(false)}
        onAction={(body, success) => act(`/api/race-hq/${event.id}`, body, success).then(() => { if ((body as { action: string }).action !== "lead") setControls(false); })} />}
    </div>
  );
}

function Avatar({ name, url, mine = false }: { name: string | null; url?: string | null; mine?: boolean }) {
  // Discord avatars are already used throughout the signed-in team site.
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img className={styles.avatar} src={url} alt="" />
    : <span className={`${styles.avatar} ${mine ? styles.mine : ""}`}>{initials(name)}</span>;
}

function currentAndNext(stints: RaceStint[], carId: string, now: number) {
  const list = stints.filter((s) => s.event_car_id === carId).sort((a, b) => a.n - b.n);
  const current = list.find((s) => +new Date(s.starts_at) <= now && +new Date(s.ends_at) > now)
    ?? list.find((s) => +new Date(s.starts_at) > now) ?? list.at(-1);
  return { current, next: current ? list.find((s) => s.n === current.n + 1) : undefined };
}

function Overview({ data, now, myNext, ready, busy, onReady, onPlan, onUpdates }: {
  data: RaceHQData; now: number; myNext?: RaceStint; ready: boolean; busy: boolean;
  onReady: () => void; onPlan: (id: string) => void; onUpdates: () => void;
}) {
  const official = data.updates.find((u) => u.kind === "official");
  return <>
    {myNext && <section className={`${styles.personal} ${ready ? styles.ready : ""}`}>
      <div className={styles.personalTop}><span><UserRound size={13} /> YOUR NEXT DRIVE</span><b>{ready ? "READY CONFIRMED" : "NOT CONFIRMED"}</b></div>
      <div className={styles.personalMain}><div><h3>{myNext.driver}, your plan is set.</h3><p>{myNext.event_car_id && `Car #${data.cars.find((c) => c.id === myNext.event_car_id)?.number}`} · {day(myNext.starts_at)} {hm(myNext.starts_at)}–{hm(myNext.ends_at)}</p></div><Avatar name={myNext.driver} mine /></div>
      <div className={styles.personalBottom}><span><AlarmClock size={13} /> Be ready by <b>{hm(new Date(+new Date(myNext.starts_at) - 15 * 60_000).toISOString())}</b></span>{data.event.status !== "finished" && <button onClick={onReady} disabled={busy}><Check size={14} /> {ready ? "Ready confirmed" : "I’m ready"}</button>}</div>
    </section>}
    <Heading title="The team, right now" note="All times local" />
    <div className={styles.cars}>{data.cars.map((car) => {
      const { current, next } = currentAndNext(data.stints, car.id, now);
      const seconds = current ? Math.max(0, Math.floor((+new Date(current.ends_at) - now) / 1000)) : 0;
      return <article className={styles.car} key={car.id}>
        <header><b>#{car.number}</b><div><strong>PCGR #{car.number}</strong><span>{car.name}</span></div><i>ON TRACK</i></header>
        <div className={styles.people}>
          <div><label>DRIVING NOW</label><span><Avatar name={current?.driver ?? null} url={current?.avatar_url} /><span><strong>{current?.driver ?? "TBC"}</strong><small>Stint {current?.n ?? "–"}</small></span></span></div>
          <div><label>NEXT DRIVER</label><span><Avatar name={next?.driver ?? null} url={next?.avatar_url} mine={next?.driver_id === data.me.id} /><span><strong>{next?.driver ?? "TBC"}{next?.driver_id === data.me.id ? " · you" : ""}</strong><small>{next ? `Handover ${hm(next.starts_at)}` : "Finish"}</small></span></span></div>
        </div>
        <footer><span><Fuel size={13} /> Next stop <b>{duration(seconds)}</b></span><button onClick={() => onPlan(car.id)}>Stint plan <ArrowRight size={13} /></button></footer>
      </article>;
    })}</div>
    <Heading title="Latest from the pit wall" action={<button onClick={onUpdates}>View all <ArrowRight size={13} /></button>} />
    {official ? <UpdateCard update={official} /> : <div className={styles.emptySmall}>No official race updates yet.</div>}
  </>;
}

function Heading({ title, note, action }: { title: string; note?: string; action?: ReactNode }) {
  return <div className={styles.heading}><h3>{title}</h3>{note && <span>{note}</span>}{action && <div>{action}</div>}</div>;
}

function UpdateCard({ update }: { update: RaceUpdate }) {
  return <article className={`${styles.update} ${update.kind === "official" ? styles.official : ""}`}>
    <Avatar name={update.author} url={update.avatar_url} />
    <div><header><strong>{update.author ?? "Race lead"}</strong><time>{hm(update.created_at)}</time></header>
      {update.kind === "official" && <label><Megaphone size={12} /> OFFICIAL UPDATE</label>}
      <p>{update.body}</p>{update.car_number && <small>Car #{update.car_number}</small>}</div>
  </article>;
}

function StintPlan({ data, car, selected, setSelected, members, now, busy, onSave }: {
  data: RaceHQData; car: RaceHQData["cars"][number]; selected: string; setSelected: (id: string) => void;
  members: Member[]; now: number; busy: boolean; onSave: (stints: unknown[]) => void;
}) {
  const source = useMemo(() => data.stints.filter((s) => s.event_car_id === car.id).sort((a, b) => a.n - b.n), [data.stints, car.id]);
  const [full, setFull] = useState(false), [editing, setEditing] = useState(false), [draft, setDraft] = useState(source);
  const current = source.find((s) => +new Date(s.starts_at) <= now && +new Date(s.ends_at) > now);
  const plan = editing ? draft : source;
  const shown = full ? plan : plan.filter((s) => !current || (s.n >= current.n - 1 && s.n <= current.n + 5));
  function patch(id: string, values: Partial<RaceStint>) { setDraft((all) => all.map((s) => s.id === id ? { ...s, ...values } : s)); }
  return <>
    <div className={styles.panelTitle}><div><h3>Stint plan</h3><p>Plan A · changes are posted to the race feed</p></div>{data.can_lead && data.event.status !== "finished" && <button onClick={() => { if (!editing) setDraft(source); setEditing(!editing); }}><Edit3 size={14} /> {editing ? "Cancel" : "Edit"}</button>}</div>
    <div className={styles.carSwitch}>{data.cars.map((c) => <button key={c.id} onClick={() => { setEditing(false); setSelected(c.id); }} aria-pressed={selected === c.id}><b>#{c.number}</b><span>{c.name}</span></button>)}</div>
    <div className={styles.planTools}><div><button onClick={() => setFull(false)} aria-pressed={!full}>Now & next</button><button onClick={() => setFull(true)} aria-pressed={full}>Full race</button></div><span>{day(data.event.starts_at)} · local time</span></div>
    <div className={styles.schedule}>{shown.map((stint) => {
      const active = stint.id === current?.id;
      return <div className={`${styles.stint} ${active ? styles.activeStint : ""}`} key={stint.id}>
        <b>{stint.n}</b><div>{editing ? <select value={stint.driver_id ?? ""} onChange={(e) => patch(stint.id, { driver_id: e.target.value, driver: members.find((m) => m.id === e.target.value)?.display_name ?? null })}>{members.map((m) => <option value={m.id} key={m.id}>{m.display_name}</option>)}</select> : <strong>{stint.driver ?? "TBC"}{stint.driver_id === data.me.id ? " · you" : ""}</strong>}<small>{active ? "On track" : stint.note || "Planned stint"}</small></div>
        <span>{editing ? <><input type="datetime-local" value={inputDate(stint.starts_at)} onChange={(e) => patch(stint.id, { starts_at: new Date(e.target.value).toISOString() })} /><input type="datetime-local" value={inputDate(stint.ends_at)} onChange={(e) => patch(stint.id, { ends_at: new Date(e.target.value).toISOString() })} /></> : <>{hm(stint.starts_at)}–{hm(stint.ends_at)}<small>{Math.round((+new Date(stint.ends_at) - +new Date(stint.starts_at)) / 60_000)} min</small></>}</span>
      </div>;
    })}</div>
    {editing && <button className={styles.primary} disabled={busy} onClick={() => { onSave(draft.map((s) => ({ id: s.id, driver_id: s.driver_id, starts_at: s.starts_at, ends_at: s.ends_at, note: s.note }))); setEditing(false); }}><Save size={15} /> Save plan & post update</button>}
  </>;
}

function Updates({ data, busy, onPost }: { data: RaceHQData; busy: boolean; onPost: (body: string, kind: string, carId: string | null) => void }) {
  const [filter, setFilter] = useState<"all" | "official">("all"), [body, setBody] = useState(""), [official, setOfficial] = useState(false), [car, setCar] = useState("");
  const updates = filter === "official" ? data.updates.filter((u) => u.kind === "official") : data.updates;
  return <>
    <div className={styles.panelTitle}><div><h3>Race updates</h3><p>One shared thread for every team car.</p></div></div>
    <div className={styles.feedTools}><div><button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button><button aria-pressed={filter === "official"} onClick={() => setFilter("official")}>Official</button></div>{data.can_lead && <span><ShieldCheck size={13} /> Race lead view</span>}</div>
    <div className={styles.feed}>{updates.map((u) => <UpdateCard key={u.id} update={u} />)}</div>
    {data.event.status !== "finished" && <form className={styles.composer} onSubmit={(e) => { e.preventDefault(); if (!body.trim()) return; onPost(body.trim(), official ? "official" : "comment", car || null); setBody(""); }}>
      <header><label htmlFor="race-comment">Add to the conversation</label>{data.can_lead && <label><input type="checkbox" checked={official} onChange={(e) => setOfficial(e.target.checked)} /> Official update</label>}</header>
      <textarea id="race-comment" rows={3} maxLength={1200} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Acknowledge a change or update the team…" />
      <footer><select value={car} onChange={(e) => setCar(e.target.value)}><option value="">All cars</option>{data.cars.map((c) => <option key={c.id} value={c.id}>Car #{c.number}</option>)}</select><button disabled={busy || !body.trim()}><Send size={14} /> {official ? "Post update" : "Post comment"}</button></footer>
    </form>}
  </>;
}

function PitKit({ data, selected, setSelected, busy, onSave }: { data: RaceHQData; selected: string; setSelected: (id: string) => void; busy: boolean; onSave: (notes: string) => void }) {
  const car = data.cars.find((c) => c.id === selected) ?? data.cars[0];
  const [editing, setEditing] = useState(false), [notes, setNotes] = useState(data.event.notes ?? "");
  return <>
    <div className={styles.panelTitle}><div><h3>Pit kit</h3><p>The essentials, ready when you need them.</p></div>{data.can_lead && data.event.status !== "finished" && <button onClick={() => setEditing(!editing)}><Edit3 size={14} /> {editing ? "Cancel" : "Edit notes"}</button>}</div>
    <div className={styles.carSwitch}>{data.cars.map((c) => <button key={c.id} onClick={() => setSelected(c.id)} aria-pressed={selected === c.id}><b>#{c.number}</b><span>{c.name}</span></button>)}</div>
    <div className={styles.callout}><CircleAlert size={17} /><div><strong>Confirm these values in practice</strong><p>Race leads can keep the final pit menu and setup notes in the event notes.</p></div></div>
    <section className={styles.kit}><h4><Fuel size={15} /> Standard stop · #{car.number}</h4><dl><div><dt>Planned stint</dt><dd>{Math.round(data.event.duration_min / Math.max(1, data.stints.filter((s) => s.event_car_id === car.id).length))} min average</dd></div><div><dt>Safe fuel</dt><dd>TBC</dd></div><div><dt>Tyre change</dt><dd>TBC</dd></div></dl></section>
    <section className={styles.kit}><h4><Settings2 size={15} /> Race notes</h4>{editing ? <><textarea className="mt-3 w-full rounded-lg border border-white/10 bg-white/[0.05] p-3 text-sm text-zinc-100" rows={6} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} /><button className={styles.primary} disabled={busy} onClick={() => { onSave(notes); setEditing(false); }}><Save size={14} /> Save race notes</button></> : <p>{data.event.notes || "No confirmed pit or setup notes yet."}</p>}</section>
  </>;
}

function RaceControls({ data, members, busy, close, onAction }: { data: RaceHQData; members: Member[]; busy: boolean; close: () => void; onAction: (body: unknown, success: string) => void }) {
  const [clock, setClock] = useState(duration(data.event.clock_remaining_s ?? data.event.duration_min * 60));
  const [lead, setLead] = useState("");
  return <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}><section className={styles.modal} role="dialog" aria-modal="true" aria-label="Race controls">
    <header><h3>Race controls</h3><button onClick={close} aria-label="Close"><X size={17} /></button></header>
    <div className={styles.controlBlock}><label>Time remaining</label><input value={clock} onChange={(e) => setClock(e.target.value)} placeholder="18:42:16" /><button className={styles.primary} disabled={busy} onClick={() => { const p = clock.split(":").map(Number); if (p.length !== 3 || p.some(Number.isNaN)) return; onAction({ action: "clock", remaining_s: p[0] * 3600 + p[1] * 60 + p[2], status: "live" }, "Race clock updated."); }}><Timer size={15} /> Start or correct race clock</button></div>
    <div className={styles.controlBlock}><label>Race leads</label><div className={styles.leads}>{data.leads.map((l) => <span key={l.id}>{l.display_name}{data.me.is_admin && l.id !== data.me.id && <button onClick={() => onAction({ action: "lead", driver_id: l.id, enabled: false }, "Race lead removed.")}><X size={12} /></button>}</span>)}</div>{data.me.is_admin && <><select value={lead} onChange={(e) => setLead(e.target.value)}><option value="">Choose teammate…</option>{members.filter((m) => !data.leads.some((l) => l.id === m.id)).map((m) => <option value={m.id} key={m.id}>{m.display_name}</option>)}</select><button disabled={!lead || busy} onClick={() => onAction({ action: "lead", driver_id: lead, enabled: true }, "Race lead added.")}><Users size={14} /> Add race lead</button></>}</div>
    <div className={styles.danger}><button disabled={busy} onClick={() => onAction({ action: "finish" }, "Race moved to the archive.")}><Archive size={14} /> Finish and archive race</button></div>
  </section></div>;
}

function EmptyHQ({ archive, members, me, open, setOpen, onCreated }: { archive: ArchiveRow[]; members: Member[]; me: Driver; open: boolean; setOpen: (x: boolean) => void; onCreated: () => void }) {
  return <div className={styles.shell}>
    <div className={styles.empty}><Flag size={30} /><h2>No active race</h2><p>The next race will appear here with its clock, cars, stint plan and team updates.</p>{me.is_admin && <button className={styles.primary} onClick={() => setOpen(true)}><CalendarClock size={15} /> Create the next race</button>}</div>
    {archive.length > 0 && <><Heading title="Race archive" note={`${archive.length} saved`} /><div className={styles.archive}>{archive.map((e) => <Link href={`/race-hq?event=${e.id}`} key={e.id}><span><strong>{e.title}</strong><small>{day(e.starts_at)} · {e.cars} car{e.cars === 1 ? "" : "s"}</small></span><ChevronRight size={17} /></Link>)}</div></>}
    {open && <CreateRace members={members} close={() => setOpen(false)} created={onCreated} />}
  </div>;
}

function ArchiveList({ events, currentId }: { events: ArchiveRow[]; currentId?: string }) {
  return <>
    <div className={styles.panelTitle}><div><h3>Race archive</h3><p>Past plans, decisions and race updates stay together.</p></div></div>
    {events.length ? <div className={styles.archive}>{events.map((e) => <Link href={`/race-hq?event=${e.id}`} key={e.id} aria-current={e.id === currentId ? "page" : undefined}><span><strong>{e.title}</strong><small>{day(e.starts_at)} · {e.track_key.replaceAll("_", " ")} · {e.cars} car{e.cars === 1 ? "" : "s"}</small></span><ChevronRight size={17} /></Link>)}</div> : <div className={styles.emptySmall}>Finished races will appear here.</div>}
  </>;
}

function CreateRace({ members, close, created }: { members: Member[]; close: () => void; created: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const four = members.slice(0, Math.min(4, members.length)).map((m) => m.id);
  const [cars, setCars] = useState([{ number: "330", name: "Ford Mustang GT3", car_key: "ford_mustang_gt3", driver_ids: four }, { number: "331", name: "Team car 2", car_key: "", driver_ids: four }]);
  const [title, setTitle] = useState("24 Hours of the Nürburgring"), [track, setTrack] = useState("nurburgring_24h"), [start, setStart] = useState(""), [stint, setStint] = useState(65), [notes, setNotes] = useState("");
  function carPatch(i: number, patch: Partial<(typeof cars)[number]>) { setCars((all) => all.map((c, k) => k === i ? { ...c, ...patch } : c)); }
  return <div className={styles.overlay}><form className={`${styles.modal} ${styles.create}`} onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(null); try { await jsonRequest("/api/race-hq", { method: "POST", body: JSON.stringify({ title, track_key: track, starts_at: new Date(start).toISOString(), duration_min: 1440, stint_min: stint, notes, cars }) }); created(); } catch (x) { setError((x as Error).message); setBusy(false); } }}>
    <header><h3>Create the next race</h3><button type="button" onClick={close} aria-label="Close"><X size={17} /></button></header>
    <label>Race title<input value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
    <div className={styles.formGrid}><label>Track key<input value={track} onChange={(e) => setTrack(e.target.value)} required /></label><label>Green flag<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required /></label></div>
    <label>Planned stint length, minutes<input type="number" min={10} max={240} value={stint} onChange={(e) => setStint(+e.target.value)} /></label>
    {cars.map((car, i) => <fieldset key={i}><legend>Team car {i + 1}</legend><div className={styles.formGrid}><label>Number<input value={car.number} onChange={(e) => carPatch(i, { number: e.target.value })} required /></label><label>Car name<input value={car.name} onChange={(e) => carPatch(i, { name: e.target.value })} required /></label></div><label>Four drivers<select multiple size={Math.min(6, members.length)} value={car.driver_ids} onChange={(e) => carPatch(i, { driver_ids: [...e.target.selectedOptions].map((o) => o.value) })}>{members.map((m) => <option value={m.id} key={m.id}>{m.display_name}</option>)}</select><small>Hold Ctrl or Command to choose four.</small></label>{cars.length > 1 && <button type="button" className="mt-3 inline-flex items-center gap-1.5 text-xs text-red-300" onClick={() => setCars((all) => all.filter((_, k) => k !== i))}><Trash2 size={13} /> Remove this car</button>}</fieldset>)}
    {cars.length < 4 && <button type="button" className={styles.primary} onClick={() => setCars((all) => [...all, { number: "", name: "", car_key: "", driver_ids: four }])}><Plus size={14} /> Add another team car</button>}
    <label>Race and pit notes<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
    {error && <p className={styles.error}>{error}</p>}<button className={styles.primary} disabled={busy || members.length < 1}><Flag size={15} /> {busy ? "Creating…" : "Create Race Day HQ"}</button>
  </form></div>;
}
