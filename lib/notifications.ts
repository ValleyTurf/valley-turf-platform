// New-lead alerts, sent by email (Resend) and text (Twilio).
//
// Both channels are optional and independently gated by env vars — until
// those are configured in Vercel, this quietly does nothing. That lets
// email go live as soon as RESEND_API_KEY is set, without waiting on
// Twilio's carrier registration (A2P 10DLC) to clear.
//
// See the comment at the top of lib/supabase-server.ts — same guard,
// same reason. This file reads RESEND_API_KEY/TWILIO_* directly.
import "server-only";

// Overridable via env vars so who gets alerted doesn't require a code
// change + redeploy. Falls back to the original hardcoded values if unset.
const ALERT_EMAIL = process.env.ALERT_EMAIL || "valleyturfrevival@gmail.com";
const ALERT_PHONE = process.env.ALERT_PHONE || "+14803314596";

export type NewLeadAlert = {
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  campaignName: string | null;
};

export async function sendNewLeadAlerts(lead: NewLeadAlert): Promise<void> {
  await Promise.allSettled([sendLeadEmailAlert(lead), sendLeadSmsAlert(lead)]);
}

function escapeHtml(value: string | null): string {
  if (!value) return "—";

  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendLeadEmailAlert(lead: NewLeadAlert): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return;
  }

  const fromAddress = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  const subject = `New lead: ${lead.name || "Unknown"}${
    lead.campaignName ? ` (${lead.campaignName})` : ""
  }`;

  const html = `
    <div style="font-family: sans-serif; font-size: 14px; color: #174734;">
      <p style="font-size: 16px; font-weight: bold;">New lead captured</p>
      <p><strong>Name:</strong> ${escapeHtml(lead.name)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(lead.phone)}</p>
      <p><strong>Email:</strong> ${escapeHtml(lead.email)}</p>
      <p><strong>Source:</strong> ${escapeHtml(lead.source)}</p>
      <p><strong>Campaign:</strong> ${escapeHtml(lead.campaignName)}</p>
    </div>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: ALERT_EMAIL,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      console.error(
        "Lead email alert failed:",
        response.status,
        await response.text()
      );
    }
  } catch (error) {
    console.error("Lead email alert error:", error);
  }
}

export type PortalMagicLinkEmail = {
  toEmail: string;
  customerName: string | null;
  loginUrl: string;
};

// Unlike sendNewLeadAlerts (an internal alert to staff), this goes out to
// a customer, so silently no-op'ing when RESEND_API_KEY isn't set would
// be a real problem — a customer who can never get their sign-in link is
// worse than the login page just not existing. The route handler that
// calls this surfaces the returned boolean back to the user as an error
// message instead of pretending it worked.
export async function sendPortalMagicLinkEmail(
  request: PortalMagicLinkEmail
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error(
      "Cannot send portal magic link email: RESEND_API_KEY is not set."
    );
    return false;
  }

  const fromAddress = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const greetingName = request.customerName || "there";

  const html = `
    <div style="font-family: sans-serif; font-size: 14px; color: #174734;">
      <p style="font-size: 16px;">Hi ${escapeHtml(greetingName)},</p>
      <p>Use the link below to sign in to your Valley Turf Revival customer portal. This link is valid for 15 minutes and can only be used once.</p>
      <p style="margin: 24px 0;">
        <a
          href="${request.loginUrl}"
          style="background-color: #174734; color: #ffffff; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: bold;"
        >
          Sign in to your account
        </a>
      </p>
      <p style="color: #6b705c; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: request.toEmail,
        subject: "Sign in to your Valley Turf Revival portal",
        html,
      }),
    });

    if (!response.ok) {
      console.error(
        "Portal magic link email failed:",
        response.status,
        await response.text()
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Portal magic link email error:", error);
    return false;
  }
}

async function sendLeadSmsAlert(lead: NewLeadAlert): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return;
  }

  const body = [
    `New lead: ${lead.name || "Unknown"}`,
    lead.phone,
    lead.campaignName,
  ]
    .filter(Boolean)
    .join(" · ");

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${accountSid}:${authToken}`
          ).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: ALERT_PHONE,
          From: fromNumber,
          Body: body,
        }),
      }
    );

    if (!response.ok) {
      console.error(
        "Lead SMS alert failed:",
        response.status,
        await response.text()
      );
    }
  } catch (error) {
    console.error("Lead SMS alert error:", error);
  }
}
