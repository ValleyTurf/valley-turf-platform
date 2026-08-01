// Converts a real ISO8601DateTime timestamp (an actual moment — e.g.
// Jobber's Invoice.issuedDate, PaymentRecord.entryDate, PayoutRecord.
// arrivalDate) into the "YYYY-MM-DD" calendar date it falls on in the
// business's timezone (America/Phoenix, fixed UTC-7, no DST).
//
// The bug this fixes: every sync-*.ts route's cleanDate() used to do
// `new Date(value).toISOString().slice(0, 10)` — which converts to UTC
// before slicing off the date. Phoenix is UTC-7, so anything that
// happened after 5pm Phoenix time lands on "tomorrow" once converted to
// UTC (confirmed live: an invoice issued 2026-08-01T01:26:22Z — 6:26pm
// Phoenix on July 31st — synced in showing August 1st). Extracting the
// Y/M/D via Intl.DateTimeFormat with an explicit America/Phoenix
// timeZone, instead of round-tripping through toISOString(), gives the
// calendar day the event actually happened on for this business,
// regardless of what the UTC offset happens to do to it.
//
// Safe to use even on values that already happen to be anchored at
// Phoenix midnight (e.g. Jobber's dueDate, consistently returned as
// T07:00:00Z) — this produces the identical correct date for those too,
// it just isn't relying on that coincidence.
export function toPhoenixDateString(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return null;
  }

  return `${year}-${month}-${day}`;
}
