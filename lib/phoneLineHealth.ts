// Gathers what Twilio and the CRM say about the business phone line and runs
// the checks in phoneLineHealthLogic.ts. Read-only.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { getForwardingNumbers } from "@/lib/callForwarding";
import { evaluatePhoneLine, type PhoneLineFinding } from "@/lib/phoneLineHealthLogic";

const PRODUCTION_ORIGIN = "https://go.valleyturfrevival.com";

async function twilioGet(path: string): Promise<unknown | null> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!sid || !token) return null;

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/${path}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });

    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export async function checkPhoneLine(): Promise<PhoneLineFinding[]> {
  const fromNumber = process.env.TWILIO_FROM_NUMBER ?? null;

  const [numberData, balanceData, forwardNumbers, cellRows] = await Promise.all([
    fromNumber ? twilioGet(`IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(fromNumber)}`) : null,
    twilioGet("Balance.json"),
    getForwardingNumbers().catch(() => [] as string[]),
    supabaseServer.from("users").select("phone").eq("role", "admin").not("phone", "is", null),
  ]);

  const twilioReachable = numberData !== null;
  const numbers = (numberData as { incoming_phone_numbers?: Array<Record<string, unknown>> } | null)
    ?.incoming_phone_numbers;
  const number = numbers?.[0];
  const capabilities = number?.capabilities as { voice?: boolean } | undefined;
  const balanceRaw = (balanceData as { balance?: string } | null)?.balance;
  const balance = balanceRaw !== undefined && Number.isFinite(Number(balanceRaw)) ? Number(balanceRaw) : null;

  return evaluatePhoneLine({
    fromNumber,
    twilioReachable,
    numberFound: Boolean(number),
    voiceCapable: capabilities?.voice ?? null,
    voiceUrl: (number?.voice_url as string | null | undefined) ?? null,
    voiceMethod: (number?.voice_method as string | null | undefined) ?? null,
    smsUrl: (number?.sms_url as string | null | undefined) ?? null,
    balance,
    forwardNumbers,
    savedCellCount: cellRows.error ? 0 : (cellRows.data ?? []).length,
    expectedVoiceUrl: `${PRODUCTION_ORIGIN}/api/webhooks/twilio-voice`,
    expectedSmsPath: "/api/webhooks/twilio",
  });
}
