// Pure helpers for calling customers through the CRM's business number
// ("click to call": the business number rings the staff member's own phone
// first, then connects to the customer, who sees the business number).

// US-friendly E.164: 10 digits -> +1..., 11 digits starting with 1 -> +1...,
// an explicit "+" number is kept. Returns null if it cannot be a real number.
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (trimmed.startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function isE164(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\+[1-9]\d{7,14}$/.test(value);
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// TwiML for the second leg: dial the customer, showing the business number.
export function bridgeTwiml(params: { callerId: string; to: string; actionUrl: string }): string {
  return (
    `<Response><Dial callerId="${escapeXml(params.callerId)}" timeout="30" ` +
    `action="${escapeXml(params.actionUrl)}" method="POST">` +
    `${escapeXml(params.to)}</Dial></Response>`
  );
}

export function describeOutboundOutcome(
  status: string | undefined,
  durationSeconds: string | undefined
): string {
  switch (status) {
    case "completed": {
      const seconds = Number(durationSeconds ?? 0);
      const minutes = Math.floor(seconds / 60);
      const remaining = seconds % 60;
      return `Connected -- ${minutes > 0 ? `${minutes}m ${remaining}s` : `${remaining}s`}`;
    }
    case "no-answer":
      return "Customer did not answer";
    case "busy":
      return "Customer's line was busy";
    case "failed":
    case "canceled":
      return "Call couldn't connect";
    default:
      return "Call ended";
  }
}
