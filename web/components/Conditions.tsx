import { Clock, CloudRain, Droplets, Sun, Thermometer, Wind } from "lucide-react";

// Track conditions of a session (sent by the app from 0.1.2): temperatures, grip, rain, wind, time of day.
export type SessionConditions = {
  air_c?: [number, number]; track_c?: [number, number]; grip?: string | null; grip_worst?: string | null;
  rain?: string | null; wind_kmh?: number | null; time_of_day?: string | null;
} | null;

const temp = (t?: [number, number]) => !t ? null : Math.abs(t[1] - t[0]) < 0.5 ? `${Math.round(t[0])} °C` : `${Math.round(t[0])} → ${Math.round(t[1])} °C`;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const WET = new Set(["damp", "wet", "flooded"]);

export default function Conditions({ c, compact = false }: { c: SessionConditions; compact?: boolean }) {
  if (!c) return null;
  const wet = (c.rain && c.rain !== "none") || WET.has(c.grip_worst ?? "");
  const item = "inline-flex items-center gap-1.5 whitespace-nowrap";
  if (compact)
    return (
      <span className="inline-flex items-center gap-2 text-xs text-zinc-500">
        {/* Both temperatures, labelled (user's request: one unlabelled number was ambiguous) */}
        {c.air_c && <span className={item} title="Air temperature"><Thermometer size={12} /> Air {Math.round(c.air_c[0])}°</span>}
        {c.track_c && <span className={item} title="Track temperature"><Thermometer size={12} className="text-race" /> Track {Math.round(c.track_c[0])}°</span>}
        {wet ? <CloudRain size={13} className="text-sky-400" /> : <Sun size={13} className="text-accent/80" />}
      </span>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-300">
      {c.air_c && <span className={item} title="Air temperature"><Thermometer size={14} className="text-zinc-500" /> Air {temp(c.air_c)}</span>}
      {c.track_c && <span className={item} title="Track temperature"><Thermometer size={14} className="text-race" /> Track {temp(c.track_c)}</span>}
      {c.grip && (
        <span className={item} title="Track grip">
          <Droplets size={14} className={WET.has(c.grip) ? "text-sky-400" : "text-zinc-500"} /> {cap(c.grip)} grip
          {c.grip_worst && c.grip_worst !== c.grip && <span className="text-zinc-500">(down to {c.grip_worst})</span>}
        </span>
      )}
      <span className={item} title="Rain">
        {wet ? <CloudRain size={14} className="text-sky-400" /> : <Sun size={14} className="text-accent" />}
        {c.rain && c.rain !== "none" ? `${cap(c.rain)} rain` : "Dry"}
      </span>
      {c.wind_kmh != null && <span className={item} title="Wind"><Wind size={14} className="text-zinc-500" /> {Math.round(c.wind_kmh)} km/h</span>}
      {c.time_of_day && <span className={item} title="In-game time at the start"><Clock size={14} className="text-zinc-500" /> {c.time_of_day}</span>}
    </span>
  );
}
