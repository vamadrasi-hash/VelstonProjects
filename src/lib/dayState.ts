export type DayState = "not_started" | "in_progress" | "ended";

type RosterLike = { supervisor_id: string; work_date: string; released_at: string | null };

/** Build a Map keyed by `${supId}|${date}` → DayState from roster rows. */
export function buildDayStateMap(roster: RosterLike[]): Map<string, DayState> {
  const groups = new Map<string, RosterLike[]>();
  roster.forEach((r) => {
    const k = `${r.supervisor_id}|${r.work_date}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  });
  const out = new Map<string, DayState>();
  groups.forEach((rows, k) => {
    if (rows.length === 0) out.set(k, "not_started");
    else if (rows.every((r) => !!r.released_at)) out.set(k, "ended");
    else out.set(k, "in_progress");
  });
  return out;
}

export function dayStateClasses(s: DayState) {
  if (s === "ended")       return { border: "border-status-ended/60",  bg: "bg-status-ended/5",  left: "border-l-4 border-l-status-ended",  badge: "ended" as const };
  if (s === "in_progress") return { border: "border-status-working/50", bg: "bg-status-working/5", left: "border-l-4 border-l-status-working", badge: "working" as const };
  return                          { border: "border-muted",             bg: "",                    left: "border-l-4 border-l-muted",          badge: "selected" as const };
}

export function dayStateLabel(s: DayState) {
  return s === "ended" ? "Day Ended" : s === "in_progress" ? "In Progress" : "Not Started";
}
