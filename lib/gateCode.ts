// Pure text extraction — no Jobber/Supabase calls here on purpose, so
// it's cheaply unit-testable. Used by app/api/import/gate-codes/route.ts
// to pull a gate code out of note text we ALREADY have locally (either
// imported from Jobber via jobber_job_notes, or entered in this app's
// own visit_notes) rather than needing any new Jobber API access.
//
// Deliberately conservative: only matches when "gate"/"keypad" and
// "code"/"combo" appear together, so it doesn't misfire on unrelated
// numbers in a note (an invoice total, a phone number, etc.). A false
// negative (missing a code phrased in some other way) just means a
// customer keeps their blank gate_code and someone can enter it by
// hand, same as today — a false positive would silently write a wrong
// code into the field, which is the worse failure mode to avoid.
const GATE_CODE_PATTERNS: RegExp[] = [
  /gate\s*code\s*(?:is|are|was|=|:)?\s*([#*0-9A-Za-z]{2,10})/i,
  /(?:keypad|key\s*pad)\s*code\s*(?:is|are|was|=|:)?\s*([#*0-9A-Za-z]{2,10})/i,
  /gate\s*(?:combo|combination)\s*(?:is|are|was|=|:)?\s*([#*0-9A-Za-z]{2,10})/i,
  /code\s*(?:to|for)\s*(?:the\s*|get\s*(?:in|into)\s*(?:the\s*)?)?gate\s*(?:is|are|was|=|:)?\s*([#*0-9A-Za-z]{2,10})/i,
];

export function extractGateCode(text: string | null | undefined): string | null {
  if (!text) return null;

  for (const pattern of GATE_CODE_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;

    const code = match[1]?.replace(/[.,;]+$/, "").trim();
    if (code) return code;
  }

  return null;
}
