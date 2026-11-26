// Starts a click-to-call through the CRM's Twilio number: Twilio calls the
// staff member's own phone first; when they answer, the bridge route
// (app/api/webhooks/twilio-voice-outbound) dials the customer with the
// business number as caller ID.
import "server-only";
import { getBaseUrl } from "@/lib/baseUrl";
import { isE164 } from "@/lib/outboundCallLogic";

export const OUTBOUND_BRIDGE_PATH = "/api/webhooks/twilio-voice-outbound";

export async function startBridgedCall(params: {
  staffPhone: string;
  customerPhone: string;
  // Omitted when dialing a number that is not a saved customer.
  jobberClientId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return { ok: false, error: "Twilio is not configured." };
  }

  if (!isE164(params.staffPhone) || !isE164(params.customerPhone)) {
    return { ok: false, error: "A phone number is not in a valid format." };
  }

  const query = new URLSearchParams({ to: params.customerPhone });
  if (params.jobberClientId) query.set("client", params.jobberClientId);
  const url = `${await getBaseUrl()}${OUTBOUND_BRIDGE_PATH}?${query.toString()}`;

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: params.staffPhone,
        From: fromNumber,
        Url: url,
        Method: "POST",
        Timeout: "25",
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("Twilio call create failed:", response.status, text.slice(0, 300));
    return {
      ok: false,
      error: "Twilio could not start the call. Check that the business number can make voice calls.",
    };
  }

  return { ok: true };
}
