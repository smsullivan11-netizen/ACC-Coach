export type Slot = { id: string | null; driver_id: string | null; planning_driver_id?: string | null; starts_at: string; ends_at: string; note: string | null };
export type SavedSlot = { id: string; n: number; driver_id: string | null; planning_driver_id?: string | null; starts_at: string | Date; ends_at: string | Date; note: string | null };
export const instant = (value: string | Date) => new Date(value as string).getTime();
export class ScheduleError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export function validateSlots(value: unknown, start: number, end: number): Slot[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 300) throw new ScheduleError("A plan needs 1–300 stint slots.");
  const ids = new Set<string>();
  const slots = value.map((s): Slot => {
    if (!s || typeof s !== "object") throw new ScheduleError("Invalid stint.");
    const id = s.id === null || s.id === undefined ? null : s.id;
    const driver = s.driver_id === "" || s.driver_id === undefined || s.driver_id === null ? null : s.driver_id;
    const planning = s.planning_driver_id == null || s.planning_driver_id === "" ? null : s.planning_driver_id;
    if (planning!==null && (typeof planning!=="string" || !/^\d+$/.test(planning) || driver!==null)) throw new ScheduleError("Choose one roster driver or planning driver per stint.");
    if ((id !== null && (typeof id !== "string" || !/^\d+$/.test(id) || ids.has(id))) ||
        (driver !== null && (typeof driver !== "string" || !/^\d+$/.test(driver)))) throw new ScheduleError("Invalid or repeated stint/driver ID.");
    if (id) ids.add(id);
    if (typeof s.starts_at !== "string" || typeof s.ends_at !== "string" || !/(Z|[+-]\d\d:\d\d)$/.test(s.starts_at) || !/(Z|[+-]\d\d:\d\d)$/.test(s.ends_at)) throw new ScheduleError("Stint times need an explicit timezone.");
    const a = instant(s.starts_at), b = instant(s.ends_at);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b - a < 60000 || b - a > 240 * 60000) throw new ScheduleError("Each stint must last 1–240 minutes.");
    if (s.note != null && (typeof s.note !== "string" || s.note.length > 300)) throw new ScheduleError("Stint notes must be 300 characters or fewer.");
    return { id, driver_id: driver, planning_driver_id: planning, starts_at: new Date(a).toISOString(), ends_at: new Date(b).toISOString(), note: s.note?.trim() || null };
  });
  if (instant(slots[0].starts_at) !== start || instant(slots[slots.length - 1].ends_at) !== end) throw new ScheduleError("The plan must cover the race from green flag to scheduled finish.");
  if (slots.some((s, i) => i > 0 && instant(s.starts_at) !== instant(slots[i - 1].ends_at))) throw new ScheduleError("Stints must be continuous, with no gaps or overlaps.");
  return slots;
}
export function protectStarted(slots: Slot[], saved: SavedSlot[], now: number) {
  const byId = new Map(saved.map((s) => [String(s.id), s]));
  for (const s of slots) {
    if (s.id && !byId.has(s.id)) throw new ScheduleError("A stint belongs to another plan. Reload the latest schedule.", 409);
    if (instant(s.starts_at) <= now && (!s.id || instant(byId.get(s.id)!.starts_at) > now)) throw new ScheduleError("New stints must start in the future.", 409);
  }
  saved.forEach((old) => {
    if (instant(old.starts_at) > now) return;
    const index = slots.findIndex((s) => s.id === String(old.id)), next = slots[index];
    if (!next || old.n !== index + 1 || next.driver_id !== (old.driver_id === null ? null : String(old.driver_id)) ||
        (next.planning_driver_id??null)!==(old.planning_driver_id==null?null:String(old.planning_driver_id)) || instant(next.starts_at) !== instant(old.starts_at) || instant(next.ends_at) !== instant(old.ends_at) || next.note !== (old.note?.trim() || null))
      throw new ScheduleError("Started and completed stints cannot be changed or removed.", 409);
  });
}
