// Plain (no directive) shared helper — used by both the server-rendered
// page (none currently, but kept directive-free so it stays importable
// from either side) and client components (VisitDetailModal's reschedule
// form, ScheduleInteractive's drag-and-drop handler). Converts a raw UTC
// ISO timestamp into the Phoenix-local date/time strings the reschedule
// UI and <input type="date">/<input type="time"> need.
export function phoenixDateTimeParts(iso: string | null): {
  date: string;
  time: string;
} {
  if (!iso) return { date: "", time: "" };

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return { date: "", time: "" };

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(parsed);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  const date = `${get("year")}-${get("month")}-${get("day")}`;

  // Some ICU implementations render midnight as "24:00" with hour12:
  // false instead of "00:00" — normalize so <input type="time"> accepts
  // it (it rejects "24:00" as invalid).
  let hour = get("hour");
  if (hour === "24") hour = "00";

  const time = `${hour}:${get("minute")}`;

  return { date, time };
}
