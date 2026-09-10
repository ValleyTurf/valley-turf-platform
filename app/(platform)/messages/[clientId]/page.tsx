export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { formatDateOnly } from "@/lib/format";
import { markInboundMessagesRead } from "@/lib/contactHistory";
import {
  replyToCustomerByEmail,
  replyToCustomerBySms,
  updateServiceRequestStatus,
} from "./actions";
import { StatusSelect } from "./StatusSelect";
import { ReplyForm } from "./ReplyForm";

type PortalMessage = {
  id: string;
  sender: "customer" | "staff";
  sender_name: string | null;
  body: string;
  created_at: string;
};

type InboundEmail = {
  id: string;
  subject: string | null;
  summary: string | null;
  created_at: string;
};

// A staff reply sent via replyToCustomerByEmail (actions.ts) -- these are
// real outbound emails logged to contact_history the same way Compose
// Email on the Customer page logs its sends, so they need to be merged
// into this thread too, or a staff reply would go out but never show up
// here again after the page re-renders.
type OutboundEmail = {
  id: string;
  subject: string | null;
  summary: string | null;
  created_by_name: string | null;
  created_at: string;
};

// Every outbound text this app has sent this customer -- visit
// reminders, "On My Way", invoice sends/reminders, quote follow-ups,
// receipts, etc. (every sendXSms() in lib/notifications.ts). Ryan asked
// to see outgoing texts in Messages, not just email, so this thread
// needs its own query the way outboundEmailsResult already exists below.
type OutboundSms = {
  id: string;
  subject: string | null;
  summary: string | null;
  created_at: string;
};

// A customer's reply to any text this app sends -- captured via the
// Twilio inbound webhook (app/api/webhooks/twilio/route.ts), matched to
// this customer by phone number and logged to contact_history the same
// shape inbound email replies already use.
type InboundSms = {
  id: string;
  subject: string | null;
  summary: string | null;
  created_at: string;
};

// A single shape both portal chat messages and inbound email replies get
// normalized into so the thread below can render/sort them together --
// emails are always customer-sent (this app only ever logs a customer's
// *reply* as direction: "inbound", never a staff-sent email, into this
// view), so they render on the same side as a customer's chat bubbles.
type ThreadItem = {
  id: string;
  kind: "chat" | "email" | "sms";
  sender: "customer" | "staff";
  senderLabel: string;
  subject: string | null;
  body: string;
  created_at: string;
};

type PortalServiceRequest = {
  id: string;
  message: string;
  status: string;
  phone: string | null;
  created_at: string;
};

function formatMessageTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function CustomerMessageThreadPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const jobberClientId = decodeURIComponent(clientId);

  const [
    customerResult,
    messagesResult,
    requestsResult,
    emailsResult,
    outboundEmailsResult,
    outboundSmsResult,
    inboundSmsResult,
  ] = await Promise.all([
      supabaseServer
        .from("customers")
        .select("full_name, email, phone")
        .eq("jobber_client_id", jobberClientId)
        .maybeSingle(),

      supabaseServer
        .from("portal_messages")
        .select("id, sender, sender_name, body, created_at")
        .eq("jobber_client_id", jobberClientId)
        .order("created_at", { ascending: true })
        .limit(200),

      supabaseServer
        .from("portal_service_requests")
        .select("id, message, status, phone, created_at")
        .eq("jobber_client_id", jobberClientId)
        .order("created_at", { ascending: false })
        .limit(50),

      // Customer replies to any email this app sends — see
      // lib/replyRouting.ts and the email.received branch in
      // app/api/webhooks/resend/route.ts for how these get here.
      supabaseServer
        .from("contact_history")
        .select("id, subject, summary, created_at")
        .eq("jobber_client_id", jobberClientId)
        .eq("channel", "email")
        .eq("direction", "inbound")
        .order("created_at", { ascending: true })
        .limit(200),

      // Staff replies sent via the Reply box below (replyToCustomerByEmail)
      // and any Compose Email sends from the Customer page -- both log
      // here as channel: "email", direction: "outbound" (logContactHistory's
      // default), so both need to render as this customer's staff-sent
      // messages in the thread.
      supabaseServer
        .from("contact_history")
        .select("id, subject, summary, created_by_name, created_at")
        .eq("jobber_client_id", jobberClientId)
        .eq("channel", "email")
        .eq("direction", "outbound")
        .order("created_at", { ascending: true })
        .limit(200),

      // Outbound texts to this customer -- visit reminders, "On My Way",
      // invoice sends/reminders, quote follow-ups, receipts, etc.
      supabaseServer
        .from("contact_history")
        .select("id, subject, summary, created_at")
        .eq("jobber_client_id", jobberClientId)
        .eq("channel", "sms")
        .eq("direction", "outbound")
        .order("created_at", { ascending: true })
        .limit(200),

      // Customer replies to any text this app sends -- see
      // app/api/webhooks/twilio/route.ts for how these get here (matched
      // by phone number rather than a reply-routing address like email
      // uses).
      supabaseServer
        .from("contact_history")
        .select("id, subject, summary, created_at")
        .eq("jobber_client_id", jobberClientId)
        .eq("channel", "sms")
        .eq("direction", "inbound")
        .order("created_at", { ascending: true })
        .limit(200),
    ]);

  const customer = customerResult.data as
    | { full_name: string | null; email: string | null; phone: string | null }
    | null;

  const messages = (messagesResult.data ?? []) as PortalMessage[];
  const requests = (requestsResult.data ?? []) as PortalServiceRequest[];
  const inboundEmails = (emailsResult.data ?? []) as InboundEmail[];
  const outboundEmails = (outboundEmailsResult.data ?? []) as OutboundEmail[];
  const outboundSms = (outboundSmsResult.data ?? []) as OutboundSms[];
  const inboundSms = (inboundSmsResult.data ?? []) as InboundSms[];

  const threadItems: ThreadItem[] = [
    ...messages.map(
      (message): ThreadItem => ({
        id: `chat-${message.id}`,
        kind: "chat",
        sender: message.sender,
        senderLabel:
          message.sender === "staff"
            ? message.sender_name || "Staff"
            : customer?.full_name || "Customer",
        subject: null,
        body: message.body,
        created_at: message.created_at,
      })
    ),
    ...inboundEmails.map(
      (email): ThreadItem => ({
        id: `email-${email.id}`,
        kind: "email",
        sender: "customer",
        senderLabel: customer?.full_name || "Customer",
        subject: email.subject,
        body: email.summary || "(No message body.)",
        created_at: email.created_at,
      })
    ),
    ...outboundEmails.map(
      (email): ThreadItem => ({
        id: `outbound-email-${email.id}`,
        kind: "email",
        sender: "staff",
        senderLabel: email.created_by_name || "Staff",
        subject: email.subject,
        body: email.summary || "(No message body.)",
        created_at: email.created_at,
      })
    ),
    ...outboundSms.map(
      (sms): ThreadItem => ({
        id: `outbound-sms-${sms.id}`,
        kind: "sms",
        sender: "staff",
        senderLabel: "Staff",
        subject: sms.subject,
        body: sms.summary || "(No message body.)",
        created_at: sms.created_at,
      })
    ),
    ...inboundSms.map(
      (sms): ThreadItem => ({
        id: `inbound-sms-${sms.id}`,
        kind: "sms",
        sender: "customer",
        senderLabel: customer?.full_name || "Customer",
        subject: sms.subject,
        body: sms.summary || "(No message body.)",
        created_at: sms.created_at,
      })
    ),
  ].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const unreadIds = messages
    .filter((message) => message.sender === "customer")
    .map((message) => message.id);

  if (unreadIds.length > 0) {
    // Viewing the thread counts as reading it — same "load the page,
    // mark it seen" convention as the public quote page's
    // markQuoteViewed(). Unconditional update is fine here: setting
    // read_at on an already-read message just rewrites the same-ish
    // timestamp field, no harm done.
    await supabaseServer
      .from("portal_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("jobber_client_id", jobberClientId)
      .eq("sender", "customer")
      .is("read_at", null);
  }

  // Same "viewing counts as reading" convention, applied to inbound
  // email/SMS replies (migration 057's read_at column) — keeps this
  // page's unread counts in the /messages inbox and the Sidebar badge in
  // sync with what staff have actually looked at.
  await markInboundMessagesRead(jobberClientId);

  const replyToCustomerByEmailWithId = replyToCustomerByEmail.bind(null, jobberClientId);
  const replyToCustomerBySmsWithId = replyToCustomerBySms.bind(null, jobberClientId);

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/messages"
          className="text-sm font-semibold text-[#9c7a20] hover:underline"
        >
          ← All Messages
        </Link>

        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-3xl font-bold">
            {customer?.full_name || "Unnamed Customer"}
          </h1>

          <Link
            href={`/customers/${encodeURIComponent(jobberClientId)}`}
            className="text-sm font-semibold text-[#9c7a20] hover:underline"
          >
            View full profile →
          </Link>
        </div>
        <p className="mt-1 text-sm text-[#6b705c]">
          {[customer?.email, customer?.phone].filter(Boolean).join(" · ")}
        </p>

        {requests.length > 0 && (
          <section className="mt-6 rounded-3xl bg-white p-5 shadow sm:p-6">
            <h2 className="text-lg font-bold">Service Requests</h2>

            <div className="mt-4 space-y-3">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-2xl border border-[#e7e2d5] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="whitespace-pre-wrap text-[#174734]">
                        {request.message}
                      </p>
                      <p className="mt-2 text-xs text-[#6b705c]">
                        Submitted {formatDateOnly(request.created_at)}
                        {request.phone ? ` · ${request.phone}` : ""}
                      </p>
                    </div>

                    <StatusSelect
                      requestId={request.id}
                      jobberClientId={jobberClientId}
                      currentStatus={request.status}
                      action={updateServiceRequestStatus}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-6 rounded-3xl bg-white p-5 shadow sm:p-6">
          <h2 className="text-lg font-bold">Messages</h2>

          <div className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto rounded-2xl bg-[#f7f6f1] p-4">
            {threadItems.length === 0 ? (
              <p className="text-sm text-[#6b705c]">No messages yet.</p>
            ) : (
              threadItems.map((item) => (
                <div
                  key={item.id}
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                    item.sender === "staff"
                      ? "ml-auto bg-[#174734] text-white"
                      : "bg-white text-[#174734] shadow"
                  }`}
                >
                  {item.kind === "email" || item.kind === "sms" ? (
                    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
                      {item.kind === "sms" ? "💬 Text" : "✉️ Email"}
                      {item.subject ? ` · ${item.subject}` : ""}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap">{item.body}</p>
                  <p
                    className={`mt-1 text-xs ${
                      item.sender === "staff" ? "text-white/70" : "text-[#9c9887]"
                    }`}
                  >
                    {item.senderLabel} · {formatMessageTime(item.created_at)}
                  </p>
                </div>
              ))
            )}
          </div>

          <ReplyForm
            onSubmitEmail={replyToCustomerByEmailWithId}
            onSubmitSms={replyToCustomerBySmsWithId}
          />
          <p className="mt-2 text-xs text-[#9c9887]">
            Sends a real email or text to the customer and logs here.
          </p>
        </section>
      </div>
    </main>
  );
}
