// The kinds of push notification this app sends (ROADMAP "Top 10
// (November 2026)" #9) and who is allowed to receive each. Plain data
// with no server imports, so the Account page's settings form and the
// server-side sender (lib/webPush.ts) read the same list.
//
// `roles` is a hard limit, not a default: money-related pushes show
// customer names next to dollar amounts on a lock screen, and crew
// members deliberately don't see dollar amounts anywhere else in the
// app. Within the kinds a person's role allows, each one is on unless
// they turn it off (migration 108's user_push_preferences).

export type PushKind =
  | "customer_message"
  | "unknown_sender"
  | "incoming_call"
  | "missed_call"
  | "payment_received"
  | "autopay_failed"
  | "low_rating"
  | "job_problem";

export type PushRole = "admin" | "manager" | "staff";

export const PUSH_KINDS: {
  kind: PushKind;
  label: string;
  description: string;
  roles: PushRole[];
}[] = [
  {
    kind: "customer_message",
    label: "Customer messages",
    description: "A customer texts, replies by email, or writes in the portal.",
    roles: ["admin", "manager", "staff"],
  },
  {
    kind: "unknown_sender",
    label: "Unknown senders",
    description: "A text or email from a number or address that isn't on any customer.",
    roles: ["admin", "manager", "staff"],
  },
  {
    kind: "incoming_call",
    label: "Incoming calls",
    description: "A call to the business number is ringing your phone, with who it is.",
    roles: ["admin"],
  },
  {
    kind: "missed_call",
    label: "Missed calls",
    description: "A call to the business number that nobody answered.",
    roles: ["admin", "manager", "staff"],
  },
  {
    kind: "payment_received",
    label: "Payments received",
    description: "A customer pays an invoice online, or autopay charges their card.",
    roles: ["admin"],
  },
  {
    kind: "autopay_failed",
    label: "Autopay failures",
    description: "A scheduled autopay charge is declined.",
    roles: ["admin"],
  },
  {
    kind: "low_rating",
    label: "Low ratings",
    description: "A customer rates a visit 4 stars or below.",
    roles: ["admin", "manager"],
  },
  {
    kind: "job_problem",
    label: "Scheduled job problems",
    description: "A background job (autopay charges, reminders, invoice sends, backups) did not run or failed.",
    roles: ["admin"],
  },
];

const KIND_SET = new Set<string>(PUSH_KINDS.map((entry) => entry.kind));

export function isPushKind(value: unknown): value is PushKind {
  return typeof value === "string" && KIND_SET.has(value);
}

export function pushKindsForRole(role: string): typeof PUSH_KINDS {
  return PUSH_KINDS.filter((entry) => (entry.roles as string[]).includes(role));
}

// Should a person with this role and these turned-off kinds get this
// kind of push?
export function shouldReceivePush(
  kind: PushKind,
  role: string | null | undefined,
  disabledKinds: readonly string[] | null | undefined
): boolean {
  const entry = PUSH_KINDS.find((candidate) => candidate.kind === kind);

  if (!entry || !role || !(entry.roles as string[]).includes(role)) return false;

  return !(disabledKinds ?? []).includes(kind);
}
