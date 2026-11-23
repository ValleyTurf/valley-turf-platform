// Pure helpers for moving customers from Jobber payments to native ones
// (no server imports, so they are unit-testable).

export const MAX_INVITES_PER_BATCH = 25;
export const REINVITE_AFTER_DAYS = 3;
// Invites only go out during the day, Phoenix time (start inclusive, end exclusive).
export const INVITE_WINDOW_START_HOUR = 9;
export const INVITE_WINDOW_END_HOUR = 18;

export type MigrationStage = "switched" | "card_saved" | "invited" | "not_invited";

export function migrationStage(input: {
  native: boolean;
  cardSaved: boolean;
  lastInvitedAt: string | null;
}): MigrationStage {
  if (input.native) return "switched";
  if (input.cardSaved) return "card_saved";
  if (input.lastInvitedAt) return "invited";
  return "not_invited";
}

export function phoenixHour(now: Date): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    hour12: false,
  }).format(now);
  // "24" can appear at midnight in some runtimes.
  return Number(hour) % 24;
}

export function inviteWindowOpen(now: Date): boolean {
  const hour = phoenixHour(now);
  return hour >= INVITE_WINDOW_START_HOUR && hour < INVITE_WINDOW_END_HOUR;
}

// The next 9:00am Phoenix at or after "now". Phoenix is UTC-7 all year (no
// daylight saving), so 9:00am there is always 16:00 UTC.
export function nextInviteOpening(now: Date): Date {
  const phoenixDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const today = new Date(`${phoenixDate}T${String(INVITE_WINDOW_START_HOUR + 7).padStart(2, "0")}:00:00Z`);
  if (today.getTime() >= now.getTime()) return today;
  return new Date(today.getTime() + 86_400_000);
}

// "tomorrow at 9am" / "today at 9am" / "Mon, Nov 30 at 9am", Phoenix time.
export function describeOpening(opening: Date, now: Date): string {
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(d);
  if (dayKey(opening) === dayKey(now)) return "today at 9am";
  if (dayKey(opening) === dayKey(new Date(now.getTime() + 86_400_000))) return "tomorrow at 9am";
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(opening);
  return `${label} at 9am`;
}

export function daysBetween(fromIso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

export type InviteSkipReason =
  | "already_native"
  | "card_saved"
  | "opted_out"
  | "invited_recently"
  | "no_contact";

export function inviteSkipReason(input: {
  native: boolean;
  cardSaved: boolean;
  optedOut: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  lastInvitedAt: string | null;
  now: Date;
}): InviteSkipReason | null {
  if (input.native) return "already_native";
  if (input.cardSaved) return "card_saved";
  if (input.optedOut) return "opted_out";
  if (!input.hasPhone && !input.hasEmail) return "no_contact";
  if (input.lastInvitedAt && daysBetween(input.lastInvitedAt, input.now) < REINVITE_AFTER_DAYS) {
    return "invited_recently";
  }
  return null;
}

export const SKIP_REASON_TEXT: Record<InviteSkipReason, string> = {
  already_native: "Already on native invoicing",
  card_saved: "Already saved a card (switch them instead)",
  opted_out: "Opted out of messages",
  invited_recently: `Invited in the last ${REINVITE_AFTER_DAYS} days`,
  no_contact: "No phone or email on file",
};

export function firstNameFor(fullName: string | null): string {
  const trimmed = fullName?.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

// The invite text is written by a person, with two placeholders that are
// filled in per customer: {first_name} and {link}.
export const MAX_TEMPLATE_LENGTH = 600;

export function defaultInviteTemplate(businessName: string, phoneDisplay: string): string {
  return (
    `Hi {first_name}, this is ${businessName}. We're moving our billing to a new system. ` +
    `Please save a card here so your invoices are paid automatically (takes about a minute): {link} ` +
    `Your card is only charged when an invoice is ready. Questions? Call or text ${phoneDisplay}.`
  );
}

export function validateInviteTemplate(template: string): string | null {
  const trimmed = template.trim();

  if (!trimmed) return "Write the message first.";
  if (!trimmed.includes("{link}")) return "The message must include {link} so each customer gets their own card link.";
  if (trimmed.length > MAX_TEMPLATE_LENGTH) return `Keep the message under ${MAX_TEMPLATE_LENGTH} characters.`;

  return null;
}

export function renderInviteMessage(template: string, values: { firstName: string; link: string }): string {
  return template
    .trim()
    .split("{first_name}")
    .join(values.firstName)
    .split("{link}")
    .join(values.link);
}

// A text over 160 characters is sent (and billed) as several segments.
export function smsSegments(length: number): number {
  return length <= 160 ? 1 : Math.ceil(length / 153);
}

export function inviteEmailSubject(businessName: string): string {
  return `Save a card for automatic payment - ${businessName}`;
}
