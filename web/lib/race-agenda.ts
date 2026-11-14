import { instant, ScheduleError } from "./stint-schedule";
export type Agenda = {
  starts_at: string; duration_min: number; practice_starts_at: string; practice_min: number;
  briefing_starts_at: string; briefing_min: number; qualifying_starts_at: string; qualifying_min: number;
};
export function validateAgenda(value: unknown): Agenda {
  if (!value || typeof value !== "object") throw new ScheduleError("Enter the event timetable.");
  const s = value as Record<string, unknown>;
  const date = (key: string) => {
    const v = s[key];
    if (typeof v !== "string" || !/(Z|[+-]\d\d:\d\d)$/.test(v) || !Number.isFinite(instant(v))) throw new ScheduleError("Every session needs a time with a timezone.");
    return new Date(v).toISOString();
  };
  const minutes = (key: string, max: number) => {
    const v = s[key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > max) throw new ScheduleError("Enter valid whole-minute session durations.");
    return v;
  };
  const result = { starts_at: date("starts_at"), duration_min: minutes("duration_min",1440),
    practice_starts_at: date("practice_starts_at"), practice_min: minutes("practice_min",240),
    briefing_starts_at: date("briefing_starts_at"), briefing_min: minutes("briefing_min",240),
    qualifying_starts_at: date("qualifying_starts_at"), qualifying_min: minutes("qualifying_min",240) };
  if (result.duration_min < 30 || instant(result.practice_starts_at)+result.practice_min*60000 > instant(result.briefing_starts_at) ||
      instant(result.briefing_starts_at)+result.briefing_min*60000 > instant(result.qualifying_starts_at) ||
      instant(result.qualifying_starts_at)+result.qualifying_min*60000 > instant(result.starts_at))
    throw new ScheduleError("Practice, briefing, qualifying and race must run in order without overlapping.");
  return result;
}
