// New-lead alerts, sent by email (Resend) and text (Twilio).
//
// Both channels are optional and independently gated by env vars — until
// those are configured in Vercel, this quietly does nothing. That lets
// email go live as soon as RESEND_API_KEY is set, without waiting on
// Twilio's carrier registration (A2P 10DLC) to clear.
//
// See the comment at the top of lib/supabase-server.ts — same guard,
// same reason. This file reads RESEND_API_KEY/TWILIO_* directly.
//
// Every customer-facing send below (not the internal staff alerts at
// the bottom of this file) takes a jobberClientId and logs itself to
// contact_history (lib/contactHistory.ts) after a successful send --
// that's what powers the Customer page's Contact History section. The
// logging call is fire-and-forget from each send function's
// perspective: logContactHistory() never throws, so a logging hiccup
// can't turn a successful text/email into a reported failure.
import "server-only";
import { logContactHistory } from "@/lib/contactHistory";
import { replyToAddressFor } from "@/lib/replyRouting";

// Overridable via env vars so who gets alerted doesn't require a code
// change + redeploy. Falls back to the original hardcoded values if unset.
const ALERT_EMAIL = process.env.ALERT_EMAIL || "valleyturfrevival@gmail.com";
const ALERT_PHONE = process.env.ALERT_PHONE || "+14803314596";

// Every customer-facing send uses this as its From header -- Resend (and
// email generally) accepts "Display Name <address>" for the from field,
// but every send in this file was just passing the bare address, so
// Gmail/Outlook had nothing to show but the address's local part (e.g.
// "invoices") as the sender name. Centralized here so every send shows
// "Valley Turf Revival" regardless of which mailbox it's actually sent
// from (invoices@, no-reply@, etc.).
function fromHeader(): string {
  const address = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  return `Valley Turf Revival <${address}>`;
}

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

// Same escaping as escapeHtml above, minus its "—" fallback for empty
// input -- used for staff-typed free text (sendManualEmail's body) where
// an empty paragraph should just render as nothing, not a literal dash.
function escapeHtmlText(value: string): string {
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
        from: fromHeader(),
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
  jobberClientId: string | null;
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
        from: fromHeader(),
        to: request.toEmail,
        reply_to: replyToAddressFor(request.jobberClientId),
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

    const data = (await response.json()) as { id?: string };

    await logContactHistory({
      jobberClientId: request.jobberClientId,
      channel: "email",
      subject: "Portal Sign-In Link",
      summary: "Sent a magic sign-in link for the customer portal.",
      resendEmailId: data.id ?? null,
    });

    return true;
  } catch (error) {
    console.error("Portal magic link email error:", error);
    return false;
  }
}

export type ManualEmail = {
  toEmail: string;
  customerName: string | null;
  subject: string;
  body: string;
  jobberClientId: string | null;
  createdByUserId?: string | null;
  createdByName?: string | null;
};

// Staff-composed, one-off email -- unlike every other function in this
// file (a fixed, pre-written message triggered by some event), this
// sends whatever subject/body a staff member types into the "Compose
// Email" form (see lib/composeEmailAction.ts and
// app/components/ComposeEmailForm.tsx, rendered on the Customer page,
// the Reactivation Pipeline, and Customer Intelligence). Plain
// paragraphs, no button/CTA chrome -- staff are writing this themselves,
// so it should read like a normal email, not an automated notice.
export async function sendManualEmail(request: ManualEmail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error("Cannot send manual email: RESEND_API_KEY is not set.");
    return false;
  }

  // Each blank-line-separated chunk of the staff-typed body becomes its
  // own paragraph; single newlines within a chunk become <br> -- close
  // enough to how the plain text reads without asking staff to write any
  // HTML themselves.
  const html = `
    <div style="font-family: sans-serif; font-size: 14px; color: #174734;">
      ${request.body
        .split(/\n{2,}/)
        .map(
          (paragraph) =>
            `<p>${escapeHtmlText(paragraph).replace(/\n/g, "<br>")}</p>`
        )
        .join("")}
    </div>
  `;

  const replyTo = replyToAddressFor(request.jobberClientId);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromHeader(),
        to: request.toEmail,
        reply_to: replyTo,
        subject: request.subject,
        html,
      }),
    });

    if (!response.ok) {
      // Logs the computed reply_to value alongside the failure -- when
      // this fires as a 422 "Invalid 'reply_to' field", the value here
      // is the fastest way to see exactly what Resend rejected and why
      // (a stray character in RESEND_REPLY_DOMAIN, an unexpected
      // jobberClientId shape, etc.) without guessing.
      console.error(
        "Manual email failed:",
        response.status,
        await response.text(),
        "reply_to attempted:",
        replyTo
      );
      return false;
    }

    const data = (await response.json()) as { id?: string };

    await logContactHistory({
      jobberClientId: request.jobberClientId,
      channel: "email",
      subject: request.subject,
      summary: request.body,
      resendEmailId: data.id ?? null,
      createdByUserId: request.createdByUserId ?? null,
      createdByName: request.createdByName ?? null,
    });

    return true;
  } catch (error) {
    console.error("Manual email error:", error);
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
  customerName: string | null,
  jobberClientId: string | null
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

    await logContactHistory({
      jobberClientId,
      channel: "sms",
      subject: "On My Way",
      summary: body,
    });

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
  payUrl: string,
  jobberClientId: string | null
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

    await logContactHistory({
      jobberClientId,
      channel: "sms",
      subject: `Invoice ${invoiceNumber} Sent`,
      summary: body,
    });

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
  jobberClientId: string | null;
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
        from: fromHeader(),
        to: request.toEmail,
        reply_to: replyToAddressFor(request.jobberClientId),
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

    const data = (await response.json()) as { id?: string };

    await logContactHistory({
      jobberClientId: request.jobberClientId,
      channel: "email",
      subject: `Invoice ${request.invoiceNumber} Sent`,
      summary: `Invoice for $${request.total.toFixed(2)}.`,
      relatedType: "invoice",
      resendEmailId: data.id ?? null,
    });

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
  jobberClientId: string | null;
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
        from: fromHeader(),
        to: request.toEmail,
        reply_to: replyToAddressFor(request.jobberClientId),
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

    const data = (await response.json()) as { id?: string };

    await logContactHistory({
      jobberClientId: request.jobberClientId,
      channel: "email",
      subject: `Invoice ${request.invoiceNumber} Autopay Receipt`,
      summary: `Paid automatically for $${request.total.toFixed(2)}${
        request.cardLast4 ? ` (card ending in ${request.cardLast4})` : ""
      }.`,
      relatedType: "invoice",
      resendEmailId: data.id ?? null,
    });

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
  cardLast4: string | null,
  jobberClientId: string | null
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

    await logContactHistory({
      jobberClientId,
      channel: "sms",
      subject: `Invoice ${invoiceNumber} Autopay Receipt`,
      summary: body,
      relatedType: "invoice",
    });

    return true;
  } catch (error) {
    console.error("Autopay receipt SMS error:", error);
    return false;
  }
}

// Pre-visit reminder text (Tier 3, Jobber Independence Roadmap) --
// fired by lib/visitReminders.ts's cron-driven send loop at whichever
// day-offsets are enabled in visit_reminder_rules (Ryan's default: 4
// days and 2 days before the visit). Same boolean-return pattern as
// sendOnMyWaySms -- the cron route logs failures per-visit rather than
// silently losing track of who didn't get reminded.
export async function sendVisitReminderSms(
  toPhone: string,
  customerName: string | null,
  visitLabel: string,
  visitDateLabel: string,
  jobberClientId: string | null
): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.error("Cannot send visit reminder text: Twilio env vars are not set.");
    return false;
  }

  const greetingName = customerName?.trim() || "there";
  const body = `Hi ${greetingName}, this is Valley Turf Revival. Reminder: your ${visitLabel} visit is scheduled for ${visitDateLabel}. Reply to this number if you need to reschedule.`;

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
        "Visit reminder SMS failed:",
        response.status,
        await response.text()
      );
      return false;
    }

    await logContactHistory({
      jobberClientId,
      channel: "sms",
      subject: "Visit Reminder",
      summary: body,
    });

    return true;
  } catch (error) {
    console.error("Visit reminder SMS error:", error);
    return false;
  }
}

// Email counterpart to sendVisitReminderSms -- same reasoning as
// sendInvoiceEmail existing alongside sendInvoiceSms, sent independently
// (not either/or) so a customer with both on file gets both.
export async function sendVisitReminderEmail(
  toEmail: string,
  customerName: string | null,
  visitLabel: string,
  visitDateLabel: string,
  jobberClientId: string | null
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error("Cannot send visit reminder email: RESEND_API_KEY is not set.");
    return false;
  }

  const greetingName = customerName || "there";

  const html = `
    <div style="font-family: sans-serif; font-size: 14px; color: #174734;">
      <p style="font-size: 16px;">Hi ${escapeHtml(greetingName)},</p>
      <p>This is a reminder that your <strong>${escapeHtml(
        visitLabel
      )}</strong> visit with Valley Turf Revival is scheduled for <strong>${escapeHtml(
    visitDateLabel
  )}</strong>.</p>
      <p style="color: #6b705c; font-size: 12px;">Need to reschedule? Just reply to this email or give us a call.</p>
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
        from: fromHeader(),
        to: toEmail,
        reply_to: replyToAddressFor(jobberClientId),
        subject: `Reminder: your ${visitLabel} visit is coming up`,
        html,
      }),
    });

    if (!response.ok) {
      console.error(
        "Visit reminder email failed:",
        response.status,
        await response.text()
      );
      return false;
    }

    const data = (await response.json()) as { id?: string };

    await logContactHistory({
      jobberClientId,
      channel: "email",
      subject: "Visit Reminder",
      summary: `Reminder for ${visitLabel} visit on ${visitDateLabel}.`,
      resendEmailId: data.id ?? null,
    });

    return true;
  } catch (error) {
    console.error("Visit reminder email error:", error);
    return false;
  }
}

// Review-request text (Tier 3) -- built and wired per Ryan's request, but
// review_request_settings.enabled defaults false (migration 055), so
// lib/reviewRequests.ts never actually calls this in production until
// Ryan turns it on from Settings. Kept here rather than inline in
// lib/reviewRequests.ts to match every other outbound message in this
// file living in one place.
export async function sendReviewRequestSms(
  toPhone: string,
  customerName: string | null,
  reviewUrl: string,
  jobberClientId: string | null
): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.error("Cannot send review request text: Twilio env vars are not set.");
    return false;
  }

  const greetingName = customerName?.trim() || "there";
  const body = `Hi ${greetingName}, thanks for choosing Valley Turf Revival! If you have a minute, we'd really appreciate a quick review: ${reviewUrl}`;

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
        "Review request SMS failed:",
        response.status,
        await response.text()
      );
      return false;
    }

    await logContactHistory({
      jobberClientId,
      channel: "sms",
      subject: "Review Request",
      summary: body,
    });

    return true;
  } catch (error) {
    console.error("Review request SMS error:", error);
    return false;
  }
}

// Email counterpart to sendReviewRequestSms -- same "built, not active"
// status (see header comment above).
export async function sendReviewRequestEmail(
  toEmail: string,
  customerName: string | null,
  reviewUrl: string,
  jobberClientId: string | null
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error("Cannot send review request email: RESEND_API_KEY is not set.");
    return false;
  }

  const greetingName = customerName || "there";

  const html = `
    <div style="font-family: sans-serif; font-size: 14px; color: #174734;">
      <p style="font-size: 16px;">Hi ${escapeHtml(greetingName)},</p>
      <p>Thanks for choosing Valley Turf Revival! If you have a minute, we'd really appreciate a quick review.</p>
      <p style="margin: 24px 0;">
        <a
          href="${reviewUrl}"
          style="background-color: #174734; color: #ffffff; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: bold;"
        >
          Leave a Review
        </a>
      </p>
      <p style="color: #6b705c; font-size: 12px;">Thanks for your support -- it means a lot to a local business.</p>
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
        from: fromHeader(),
        to: toEmail,
        reply_to: replyToAddressFor(jobberClientId),
        subject: "How did we do?",
        html,
      }),
    });

    if (!response.ok) {
      console.error(
        "Review request email failed:",
        response.status,
        await response.text()
      );
      return false;
    }

    const data = (await response.json()) as { id?: string };

    await logContactHistory({
      jobberClientId,
      channel: "email",
      subject: "Review Request",
      summary: "Asked for a Google review.",
      resendEmailId: data.id ?? null,
    });

    return true;
  } catch (error) {
    console.error("Review request email error:", error);
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
