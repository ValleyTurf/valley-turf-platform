// One place that posts a text to Twilio, so every customer text asks
// Twilio to report back its delivery status (see
// app/api/webhooks/twilio-status/route.ts and lib/twilioDelivery.ts).
// Returns the raw fetch Response so existing call sites keep their
// `response.ok` / `response.text()` handling unchanged.
import "server-only";
import { getBaseUrl, resolveBaseUrl } from "@/lib/baseUrl";

export const TWILIO_STATUS_CALLBACK_PATH = "/api/webhooks/twilio-status";

async function statusCallbackUrl(): Promise<string> {
  try {
    return `${await getBaseUrl()}${TWILIO_STATUS_CALLBACK_PATH}`;
  } catch {
    // No request context (should not happen for a send, but never let
    // it block a text going out).
    return `${resolveBaseUrl(null, process.env.VERCEL_ENV, process.env.APP_BASE_URL)}${TWILIO_STATUS_CALLBACK_PATH}`;
  }
}

export async function sendTwilioMessage(params: {
  accountSid: string;
  authToken: string;
  to: string;
  from: string;
  body: string;
}): Promise<Response> {
  const callback = await statusCallbackUrl();

  return fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${params.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${params.accountSid}:${params.authToken}`
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: params.to,
        From: params.from,
        Body: params.body,
        StatusCallback: callback,
      }),
    }
  );
}

// Twilio's message SID from a successful send response. Reads a clone so
// the caller can still use the original body. Never throws.
export async function twilioSidOf(response: Response): Promise<string | null> {
  try {
    const data = (await response.clone().json()) as { sid?: unknown };
    return typeof data.sid === "string" ? data.sid : null;
  } catch {
    return null;
  }
}
