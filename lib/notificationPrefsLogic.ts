// Pure helpers for customer notification preferences (no server imports).

export type ReminderChannel = "both" | "text" | "email";

export const REMINDER_CHANNELS: { value: ReminderChannel; label: string; hint: string }[] = [
  { value: "both", label: "Text and email", hint: "The most reliable way to hear about a visit." },
  { value: "text", label: "Text only", hint: "Reminders go to your phone." },
  { value: "email", label: "Email only", hint: "Reminders go to your inbox." },
];

export type NotificationPrefs = {
  reminderChannel: ReminderChannel;
  reviewRequestsEnabled: boolean;
  promotionsEnabled: boolean;
};

export const DEFAULT_PREFS: NotificationPrefs = {
  reminderChannel: "both",
  reviewRequestsEnabled: true,
  promotionsEnabled: true,
};

export function parseReminderChannel(value: unknown): ReminderChannel {
  return value === "text" || value === "email" ? value : "both";
}

// Narrows who a reminder goes to by the customer's channel choice. If the
// chosen channel has nobody to send to (they picked text but only have an
// email on file), fall back to the other one rather than send nothing, so a
// preference can never cause a missed visit reminder.
export function recipientsForChannel(
  channel: ReminderChannel,
  recipients: { emails: string[]; phones: string[] }
): { emails: string[]; phones: string[] } {
  if (channel === "text" && recipients.phones.length > 0) {
    return { emails: [], phones: recipients.phones };
  }
  if (channel === "email" && recipients.emails.length > 0) {
    return { emails: recipients.emails, phones: [] };
  }
  return recipients;
}

export function describePrefs(prefs: NotificationPrefs): string[] {
  const parts: string[] = [];
  if (prefs.reminderChannel === "text") parts.push("reminders by text only");
  if (prefs.reminderChannel === "email") parts.push("reminders by email only");
  if (!prefs.reviewRequestsEnabled) parts.push("no review requests");
  if (!prefs.promotionsEnabled) parts.push("no promotions");
  return parts;
}
