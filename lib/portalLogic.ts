// Pure helpers for the customer portal (no server imports, so they are
// unit-testable). The portal shows customers as little as is useful: the
// month of their next service until the appointment is locked in, invoices
// that are real (no drafts or voids), and times in the business's time zone.

export const PHOENIX_TZ = "America/Phoenix";
// A visit is "locked in" once it is this many days away or closer (the same
// 4-day mark the first reminder goes out on).
export const VISIT_LOCKED_IN_DAYS = 4;

function phoenixDateParts(date: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PHOENIX_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

// Whole calendar days from today to the visit's day, in Phoenix.
export function phoenixDaysUntil(startAt: Date, now: Date): number {
  const a = phoenixDateParts(now);
  const b = phoenixDateParts(startAt);
  const dayA = Date.UTC(a.y, a.m - 1, a.d);
  const dayB = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((dayB - dayA) / 86_400_000);
}

export type VisitDisplay = { lockedIn: boolean; label: string };

// "Thursday, Dec 3 at 9:00 AM" once locked in, otherwise just "December 2026".
export function describeVisit(startAtIso: string | null, now: Date): VisitDisplay | null {
  if (!startAtIso) return null;
  const start = new Date(startAtIso);
  if (Number.isNaN(start.getTime())) return null;

  if (phoenixDaysUntil(start, now) <= VISIT_LOCKED_IN_DAYS) {
    const label = new Intl.DateTimeFormat("en-US", {
      timeZone: PHOENIX_TZ,
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(start);
    return { lockedIn: true, label: label.replace(/, (\d{1,2}:\d{2})/, " at $1") };
  }

  const month = new Intl.DateTimeFormat("en-US", {
    timeZone: PHOENIX_TZ,
    month: "long",
    year: "numeric",
  }).format(start);
  return { lockedIn: false, label: month };
}

// A timestamp for the messages thread, Phoenix time.
export function formatPortalTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PHOENIX_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

// Drafts and voided invoices are internal; customers never see them.
export function isCustomerVisibleInvoiceStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return s !== "draft" && s !== "void" && s !== "voided" && s !== "archived";
}

export type InvoiceBalanceLabel = "paid" | "due" | "none";

export function invoiceBalanceLabel(status: string | null | undefined, balance: number): InvoiceBalanceLabel {
  if (balance > 0) return "due";
  return (status ?? "").toLowerCase() === "paid" ? "paid" : "none";
}

// "%" and "_" are wildcards in a Postgres ILIKE; escape them (and the escape
// character) so an email typed into the sign-in form only matches itself.
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export const PORTAL_LOGIN_MAX_LINKS = 3;
export const PORTAL_LOGIN_WINDOW_MINUTES = 15;

export function loginLinkRateLimited(recentLinkCount: number): boolean {
  return recentLinkCount >= PORTAL_LOGIN_MAX_LINKS;
}

// A visit the customer can look back on: finished work, not a canceled or
// still-scheduled one.
export function isCompletedVisit(
  status: string | null | undefined,
  completedAt: string | null | undefined
): boolean {
  return Boolean(completedAt) || (status ?? "").toUpperCase() === "COMPLETED";
}

// "Thursday, Nov 12, 2026" for a past visit, in Phoenix time.
export function formatPastVisitDate(startAtIso: string | null): string {
  if (!startAtIso) return "Date unknown";
  const date = new Date(startAtIso);
  if (Number.isNaN(date.getTime())) return "Date unknown";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PHOENIX_TZ,
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
