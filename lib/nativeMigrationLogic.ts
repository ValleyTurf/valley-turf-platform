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

export function buildInviteSms(params: {
  firstName: string;
  link: string;
  businessName: string;
  phoneDisplay: string;
}): string {
  return (
    `Hi ${params.firstName}, this is ${params.businessName}. We're moving our billing to a new system. ` +
    `Please save a card here so your invoices are paid automatically (takes about a minute): ${params.link} ` +
    `Your card is only charged when an invoice is ready. Questions? Call or text ${params.phoneDisplay}.`
  );
}

export function buildInviteEmail(params: {
  firstName: string;
  link: string;
  businessName: string;
  phoneDisplay: string;
}): { subject: string; body: string } {
  return {
    subject: `Save a card for automatic payment - ${params.businessName}`,
    body:
      `Hi ${params.firstName},\n\n` +
      `We're moving our billing to a new system at ${params.businessName}. To keep things simple, ` +
      `please save a card on file using this secure link (it takes about a minute):\n\n${params.link}\n\n` +
      `Your card will only be charged when an invoice is ready for your service, and you'll get a receipt each time. ` +
      `You can turn automatic payment off any time by contacting us.\n\n` +
      `Questions? Call or text us at ${params.phoneDisplay}.\n\nThank you,\n${params.businessName}`,
  };
}
