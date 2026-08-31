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

// Customer-facing "we're on our way" text, sent from a My Day card
// (app/(platform)/my-day/actions.ts's sendOnMyWay). Unlike
// sendLeadSmsAlert below (an internal alert to staff that silently no-ops
// without Twilio configured), this goes to a customer and the crew member
// who tapped the button needs to know whether it actually went out —
// same reasoning as sendPortalMagicLinkEmail returning a boolean instead
// of swallowing the failure.
export async function sendOnMyWaySms(
  toPhone: string,
  customerName: string | null
): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.error("Cannot send 'on my way' text: Twilio env vars are not set.");
    return false;
  }

  const greetingName = customerName?.trim() || "there";
  const body = `Hi ${greetingName}, this is Valley Turf Revival — we're on our way to your property now!`;

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
          To: toPhone,
          From: fromNumber,
          Body: body,
        }),
      }
    );

    if (!response.ok) {
      console.error(
        "'On my way' SMS failed:",
        response.status,
        await response.text()
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("'On my way' SMS error:", error);
    return false;
  }
}

// Customer-facing invoice text -- for customers with no email on file
// (phone-only), or as a second channel alongside email. Sends the
// stable /pay/[token] link (lib/invoices.ts's publicToken), never a raw
// Stripe Checkout Session URL -- those expire in ~24h, and a text is
// exactly the kind of thing someone might not open same-day. Same
// boolean-return, non-silent pattern as sendOnMyWaySms above -- the
// caller needs to know whether this actually went out.
export async function sendInvoiceSms(
  toPhone: string,
  customerName: string | null,
  invoiceNumber: string,
  payUrl: string
): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.error("Cannot send invoice text: Twilio env vars are not set.");
    return false;
  }

  const greetingName = customerName?.trim() || "there";
  const body = `Hi ${greetingName}, this is Valley Turf Revival. Your invoice ${invoiceNumber} is ready: ${payUrl}`;

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
          To: toPhone,
          From: fromNumber,
          Body: body,
        }),
      }
    );

    if (!response.ok) {
      console.error(
        "Invoice SMS failed:",
        response.status,
        await response.text()
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Invoice SMS error:", error);
    return false;
  }
}

export type InvoiceEmail = {
  toEmail: string;
  customerName: string | null;
  invoiceNumber: string;
  total: number;
  // The stable /pay/[publicToken] page (app/pay/[token]/), NOT a raw
  // Stripe Checkout Session URL -- those expire ~24h after creation.
  // The Checkout Session itself gets minted fresh when the customer
  // actually clicks Pay Now on that page.
  payNowUrl: string;
  pdfBuffer: Buffer;
};

// Customer-facing, like sendPortalMagicLinkEmail -- returns a boolean
// rather than silently no-op'ing, since the caller needs to know whether
// to mark the invoice "sent" or surface an error back to staff.
export async function sendInvoiceEmail(
  request: InvoiceEmail
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error("Cannot send invoice email: RESEND_API_KEY is not set.");
    return false;
  }

  const fromAddress = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const greetingName = request.customerName || "there";

  const html = `
    <div style="font-family: sans-serif; font-size: 14px; color: #174734;">
      <p style="font-size: 16px;">Hi ${escapeHtml(greetingName)},</p>
      <p>Your invoice <strong>${escapeHtml(
        request.invoiceNumber
      )}</strong> from Valley Turf Revival is attached, for <strong>$${request.total.toFixed(
    2
  )}</strong>.</p>
      <p style="margin: 24px 0;">
        <a
          href="${request.payNowUrl}"
          style="background-color: #174734; color: #ffffff; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: bold;"
        >
          Pay Now
        </a>
      </p>
      <p style="color: #6b705c; font-size: 12px;">Questions about this invoice? Just reply to this email.</p>
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
        subject: `Invoice ${request.invoiceNumber} from Valley Turf Revival`,
        html,
        attachments: [
          {
            filename: `${request.invoiceNumber}.pdf`,
            content: request.pdfBuffer.toString("base64"),
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(
        "Invoice email failed:",
        response.status,
        await response.text()
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Invoice email error:", error);
    return false;
  }
}

export type AutopayReceiptEmail = {
  toEmail: string;
  customerName: string | null;
  invoiceNumber: string;
  total: number;
  cardLast4: string | null;
  pdfBuffer: Buffer;
};

// Sent instead of sendInvoiceEmail when lib/autopay.ts's
// attemptAutopayCharge() succeeds -- a receipt, not a request for
// payment, so no Pay Now button. Same PDF-attached pattern as the
// regular invoice email for consistent recordkeeping either way.
export async function sendAutopayReceiptEmail(
  request: AutopayReceiptEmail
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error("Cannot send autopay receipt email: RESEND_API_KEY is not set.");
    return false;
  }

  const fromAddress = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const greetingName = request.customerName || "there";
  const cardSuffix = request.cardLast4 ? ` (card ending in ${request.cardLast4})` : "";

  const html = `
    <div style="font-family: sans-serif; font-size: 14px; color: #174734;">
      <p style="font-size: 16px;">Hi ${escapeHtml(greetingName)},</p>
      <p>Your invoice <strong>${escapeHtml(
        request.invoiceNumber
      )}</strong> from Valley Turf Revival has been paid automatically${escapeHtml(
    cardSuffix
  )} for <strong>$${request.total.toFixed(2)}</strong>, as part of your autopay enrollment.</p>
      <p>Your receipt is attached. No action is needed.</p>
      <p style="color: #6b705c; font-size: 12px;">Questions about this charge? Just reply to this email.</p>
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
        subject: `Invoice ${request.invoiceNumber} paid automatically -- Valley Turf Revival`,
        html,
        attachments: [
          {
            filename: `${request.invoiceNumber}.pdf`,
            content: request.pdfBuffer.toString("base64"),
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(
        "Autopay receipt email failed:",
        response.status,
        await response.text()
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Autopay receipt email error:", error);
    return false;
  }
}

// Text counterpart to sendAutopayReceiptEmail -- same reasoning as
// sendInvoiceSms existing alongside sendInvoiceEmail for phone-only
// customers.
export async function sendAutopayReceiptSms(
  toPhone: string,
  customerName: string | null,
  invoiceNumber: string,
  total: number,
  cardLast4: string | null
): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.error("Cannot send autopay receipt text: Twilio env vars are not set.");
    return false;
  }

  const greetingName = customerName?.trim() || "there";
  const cardSuffix = cardLast4 ? ` (card ending in ${cardLast4})` : "";
  const body = `Hi ${greetingName}, this is Valley Turf Revival. Invoice ${invoiceNumber} ($${total.toFixed(
    2
  )}) was paid automatically${cardSuffix} via autopay. No action needed.`;

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
          To: toPhone,
          From: fromNumber,
          Body: body,
        }),
      }
    );

    if (!response.ok) {
      console.error(
        "Autopay receipt SMS failed:",
        response.status,
        await response.text()
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Autopay receipt SMS error:", error);
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
