// Pure helpers for where incoming calls to the business number ring.
import { escapeXml, toE164 } from "@/lib/outboundCallLogic";

// The cells saved on admins' Account pages, de-duplicated and valid. Falls
// back to the alert phone only if nobody has saved one yet.
export function pickForwardNumbers(
  savedPhones: Array<string | null | undefined>,
  fallback: string | null | undefined
): string[] {
  const numbers: string[] = [];

  for (const raw of savedPhones) {
    const e164 = toE164(raw);
    if (e164 && !numbers.includes(e164)) numbers.push(e164);
  }

  if (numbers.length === 0) {
    const fb = toE164(fallback);
    if (fb) numbers.push(fb);
  }

  return numbers;
}

// Rings every number at once; the first person to answer gets the call.
export function forwardTwiml(params: { numbers: string[]; timeout: number; actionUrl: string }): string {
  const targets = params.numbers.map((n) => `<Number>${escapeXml(n)}</Number>`).join("");

  return (
    `<Response><Dial timeout="${params.timeout}" action="${escapeXml(params.actionUrl)}" method="POST">` +
    `${targets}</Dial></Response>`
  );
}
