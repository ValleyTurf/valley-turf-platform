// Pure helpers for text delivery status (no server-only imports, so they
// can be used from pages and checked with a plain script). The writer
// side lives in lib/twilioDelivery.ts.
export type TextDeliveryStatus =
  | "queued"
  | "accepted"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "undelivered"
  | "failed";

const STATUS_RANK: Record<string, number> = {
  accepted: 0,
  queued: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  undelivered: 5,
  failed: 5,
};

export function isFailedStatus(status: string | null | undefined): boolean {
  return status === "failed" || status === "undelivered";
}

// Twilio can deliver callbacks out of order ("sent" arriving after
// "delivered"). A status only replaces another that ranks below it, and
// a final status never changes.
export function shouldApplyStatus(
  current: string | null | undefined,
  next: string
): boolean {
  if (!(next in STATUS_RANK)) return false;
  if (!current || !(current in STATUS_RANK)) return true;
  if (STATUS_RANK[current] >= 3) return false;
  return STATUS_RANK[next] > STATUS_RANK[current];
}

// Plain-English reason for the carrier error codes seen in practice.
export function describeTwilioError(code: string | null | undefined): string {
  switch (code) {
    case "30003":
      return "the phone was unreachable or switched off";
    case "30004":
      return "the customer's phone has blocked texts from us";
    case "30005":
      return "that number does not exist or is not active";
    case "30006":
      return "that number is a landline or cannot get texts";
    case "30007":
      return "the carrier filtered the message as spam";
    case "30008":
      return "the carrier could not deliver it (reason unknown)";
    case "21610":
      return "the customer replied STOP to texts";
    case "21614":
    case "21211":
      return "that is not a valid mobile number";
    default:
      return code ? `carrier error ${code}` : "the carrier did not deliver it";
  }
}

// What to show next to an outbound text in a thread. Null while there is
// nothing worth saying (older texts, still on its way).
export function deliveryBadge(
  status: string | null | undefined,
  errorCode: string | null | undefined
): { label: string; tone: "good" | "bad" } | null {
  if (status === "delivered" || status === "read") {
    return { label: "Delivered", tone: "good" };
  }

  if (isFailedStatus(status)) {
    return {
      label: `Not delivered: ${describeTwilioError(errorCode)}`,
      tone: "bad",
    };
  }

  return null;
}
