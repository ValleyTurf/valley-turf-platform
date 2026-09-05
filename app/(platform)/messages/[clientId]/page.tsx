export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { formatDateOnly } from "@/lib/format";
import { markInboundEmailsRead } from "@/lib/contactHistory";
import { replyToCustomer, updateServiceRequestStatus } from "./actions";
import { StatusSelect } from "./StatusSelect";

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

// A single shape both portal chat messages and inbound email replies get
// normalized into so the thread below can render/sort them together --
// emails are always customer-sent (this app only ever logs a customer's
// *reply* as direction: "inbound", never a staff-sent email, into this
// view), so they render on the same side as a customer's chat bubbles.
type ThreadItem = {
  id: string;
  kind: "chat" | "email";
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

  const [customerResult, messagesResult, requestsResult, emailsResult] =
    await Promise.all([
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
    ]);

  const customer = customerResult.data as
    | { full_name: string | null; email: string | null; phone: string | null }
    | null;

  const messages = (messagesResult.data ?? []) as PortalMessage[];
  const requests = (requestsResult.data ?? []) as PortalServiceRequest[];
  const inboundEmails = (emailsResult.data ?? []) as InboundEmail[];

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
  // email replies (migration 057's read_at column) — keeps this page's
  // unread counts in the /messages inbox and the Sidebar badge in sync
  // with what staff have actually looked at.
  await markInboundEmailsRead(jobberClientId);

  const replyToCustomerWithId = replyToCustomer.bind(null, jobberClientId);

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
                  {item.kind === "email" ? (
                    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
                      ✉️ Email{item.subject ? ` · ${item.subject}` : ""}
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

          <form action={replyToCustomerWithId} className="mt-4 flex gap-3">
            <textarea
              name="body"
              rows={2}
              required
              placeholder="Type a reply..."
              className="block w-full rounded-xl border border-[#d8d3c6] bg-white px-4 py-3 text-[#174734] outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Reply
            </button>
          </form>
          <p className="mt-2 text-xs text-[#9c9887]">
            This reply goes through the customer portal chat. To reply by
            email instead, use Compose Email on the customer&apos;s{" "}
            <Link
              href={`/customers/${encodeURIComponent(jobberClientId)}`}
              className="font-semibold text-[#9c7a20] hover:underline"
            >
              profile page
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
