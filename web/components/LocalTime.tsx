"use client";

import { useSyncExternalStore } from "react";

// A date shown in the viewer's own time zone (the server renders in UTC), with an optional "in 3 days".
const subscribe = () => () => {};

export default function LocalTime({ iso, countdown = false, short = false }: { iso: string; countdown?: boolean; short?: boolean }) {
  const now = useSyncExternalStore(subscribe, () => Math.floor(Date.now() / 60000), () => 0);
  if (!now) return <span>{iso.slice(0, 10)}</span>;   // server render: the client fills in the local time
  const d = new Date(iso);
  const text = d.toLocaleString(undefined, short
    ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
    : { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  if (!countdown) return <span>{text}</span>;
  const min = Math.round((d.getTime() - now * 60000) / 60000);
  const rel = min < 0 ? null : min < 60 ? `in ${min} min` : min < 48 * 60 ? `in ${Math.round(min / 60)} h` : `in ${Math.round(min / 1440)} days`;
  return <span>{text}{rel && <span className="ml-2 text-accent">· {rel}</span>}</span>;
}
