export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { toPhoenixDateString } from "@/lib/phoenixDate";

type PortalMessageRow = {
  jobber_client_id: string;
  sender: "customer" | "staff";
  body: string;
  read_at: string | null;
  created_at: string;
};

type PortalServiceRequestRow = {
  jobber_client_id: string;
  status: string;
  created_at: string;
};

// Customer replies to any email OR text this app sends -- email via
// lib/replyRouting.ts + the Resend webhook, SMS via the Twilio webhook
// (app/api/webhooks/twilio/route.ts), matched by phone number.
type InboundMessageRow = {
  jobber_client_id: string | null;
  channel: "email" | "sms" | "call";
  subject: string | null;
  summary: string | null;
  read_at: string | null;
  created_at: string;
};

// Every automated/manual text and email this app sends -- visit
// reminders, invoice sends/reminders, quote follow-ups, receipts,
// Compose Email/On My Way, etc. (every logContactHistory call in
// lib/notifications.ts). Ryan asked to be able to see these in the
// inbox too, not just customer-initiated activity, so he can confirm
// e.g. today's visit reminders actually went out.
type OutboundMessageRow = {
  jobber_client_id: string | null;
  channel: "email" | "sms" | "call";
  subject: string | null;
  summary: string | null;
  created_at: string;
};

type CustomerRow = {
  jobber_client_id: string;
  full_name: string | null;
};

type InboxRow = {
  jobberClientId: string;
  customerName: string;
  lastActivityAt: string;
  lastMessagePreview: string | null;
  unreadCount: number;
  openRequestCount: number;
};

type SentTodayRow = {
  jobberClientId: string | null;
  customerName: string;
  channel: "email" | "sms" | "call";
  subject: string | null;
  createdAt: string;
};

// Same "today shows just a time, anything older shows a short date"
// convention as the "Sent today" panel above, just also covering
// non-today activity since this is a customer's most recent contact
// ever, not only from today.
function formatInboxTimestamp(iso: string, todayPhoenix: string | null): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return "";

  if (todayPhoenix && toPhoenixDateString(iso) === todayPhoenix) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Phoenix",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
  }).format(date);
}

export default async function MessagesInboxPage() {
  const [messagesResult, requestsResult, inboundMessagesResult, outboundResult] =
    await Promise.all([
      supabaseServer
        .from("portal_messages")
        .select("jobber_client_id, sender, body, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(1000),

      supabaseServer
        .from("portal_service_requests")
        .select("jobber_client_id, status, created_at")
        .neq("status", "resolved")
        .order("created_at", { ascending: false })
        .limit(500),

      // Customer replies to any email OR text this app sends (see
      // lib/replyRouting.ts + app/api/webhooks/resend/route.ts for email,
      // app/api/webhooks/twilio/route.ts for SMS) -- these used to only
      // ever show up buried on the individual Customer page's Contact
      // History. Merged into this same inbox below so a new reply is just
      // as visible as a new portal chat message.
      supabaseServer
        .from("contact_history")
        .select("jobber_client_id, channel, subject, summary, read_at, created_at")
        .in("channel", ["email", "sms"])
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(500),

      // Every outbound text/email this app has sent, most recent first.
      // Used both for the "Sent today" panel below and to fold into each
      // customer's lastActivityAt so the inbox reflects contact in either
      // direction, not just what the customer initiated.
      supabaseServer
        .from("contact_history")
        .select("jobber_client_id, channel, subject, summary, created_at")
        .eq("direction", "outbound")
        .in("channel", ["email", "sms"])
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);

  const messages = (messagesResult.data ?? []) as PortalMessageRow[];
  const openRequests = (requestsResult.data ?? []) as PortalServiceRequestRow[];
  const inboundMessages = (inboundMessagesResult.data ?? []) as InboundMessageRow[];
  const outboundMessages = (outboundResult.data ?? []) as OutboundMessageRow[];

  const inboxMap = new Map<string, InboxRow>();

  function getOrCreate(jobberClientId: string): InboxRow {
    const existing = inboxMap.get(jobberClientId);

    if (existing) return existing;

    const created: InboxRow = {
      jobberClientId,
      customerName: "Unnamed Customer",
      lastActivityAt: "1970-01-01T00:00:00Z",
      lastMessagePreview: null,
      unreadCount: 0,
      openRequestCount: 0,
    };

    inboxMap.set(jobberClientId, created);

    return created;
  }

  // Messages are already ordered newest-first, so the first time we see
  // a given customer here is genuinely their most recent message.
  for (const message of messages) {
    const row = getOrCreate(message.jobber_client_id);

    if (!row.lastMessagePreview) {
      row.lastMessagePreview = message.body;
    }

    if (message.created_at > row.lastActivityAt) {
      row.lastActivityAt = message.created_at;
    }

    if (message.sender === "customer" && !message.read_at) {
      row.unreadCount += 1;
    }
  }

  for (const request of openRequests) {
    const row = getOrCreate(request.jobber_client_id);

    row.openRequestCount += 1;

    if (request.created_at > row.lastActivityAt) {
      row.lastActivityAt = request.created_at;
    }
  }

  // Inbound messages are already ordered newest-first too, so same
  // "first time seen wins the preview" logic as the portal messages loop
  // above.
  for (const inbound of inboundMessages) {
    if (!inbound.jobber_client_id) continue;

    const row = getOrCreate(inbound.jobber_client_id);
    const icon = inbound.channel === "sms" ? "💬" : "✉️";
    const preview =
      inbound.summary?.trim() ||
      inbound.subject ||
      (inbound.channel === "sms" ? "New text reply" : "New email reply");

    if (inbound.created_at > row.lastActivityAt) {
      row.lastActivityAt = inbound.created_at;

      // Newest activity overall for this customer -- let this reply take
      // over the preview line even if a portal message was seen first, so
      // the preview always reflects whatever actually came in last.
      row.lastMessagePreview = `${icon} ${preview}`;
    } else if (!row.lastMessagePreview) {
      row.lastMessagePreview = `${icon} ${preview}`;
    }

    if (!inbound.read_at) {
      row.unreadCount += 1;
    }
  }

  // Outbound sends never count toward unreadCount (nothing for staff to
  // "read" -- staff sent it), but they do count toward lastActivityAt and
  // can supply the preview line, same "newest wins" logic as above. This
  // is what makes lastActivityAt genuinely "most recent contact, either
  // direction" instead of only reflecting what the customer sent in.
  for (const outbound of outboundMessages) {
    if (!outbound.jobber_client_id) continue;

    const row = getOrCreate(outbound.jobber_client_id);
    const icon = outbound.channel === "sms" ? "💬" : "✉️";
    const preview = `${icon} ${outbound.subject || outbound.summary || "Sent"}`;

    if (outbound.created_at > row.lastActivityAt) {
      row.lastActivityAt = outbound.created_at;
      row.lastMessagePreview = preview;
    } else if (!row.lastMessagePreview) {
      row.lastMessagePreview = preview;
    }
  }

  // Today's outbound sends, newest first -- lets Ryan confirm at a
  // glance that e.g. this morning's visit reminders actually went out,
  // without having to click into every individual customer thread.
  const todayPhoenix = toPhoenixDateString(new Date().toISOString());
  const sentToday: SentTodayRow[] = outboundMessages
    .filter((row) => toPhoenixDateString(row.created_at) === todayPhoenix)
    .map((row) => ({
      jobberClientId: row.jobber_client_id,
      customerName: "Unnamed Customer",
      channel: row.channel,
      subject: row.subject || row.summary || "Sent",
      createdAt: row.created_at,
    }));

  const jobberClientIds = Array.from(
    new Set([...inboxMap.keys(), ...sentToday.map((r) => r.jobberClientId).filter(Boolean) as string[]])
  );

  const customerNameById = new Map<string, string>();

  if (jobberClientIds.length > 0) {
    const { data: customerRows } = await supabaseServer
      .from("customers")
      .select("jobber_client_id, full_name")
      .in("jobber_client_id", jobberClientIds);

    for (const customer of (customerRows ?? []) as CustomerRow[]) {
      customerNameById.set(
        customer.jobber_client_id,
        customer.full_name || "Unnamed Customer"
      );

      const row = inboxMap.get(customer.jobber_client_id);

      if (row) {
        row.customerName = customer.full_name || "Unnamed Customer";
      }
    }
  }

  for (const row of sentToday) {
    if (row.jobberClientId) {
      row.customerName = customerNameById.get(row.jobberClientId) || "Unnamed Customer";
    }
  }

  const inboxRows = Array.from(inboxMap.values()).sort(
    (a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1)
  );

  sentToday.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
          Valley Turf Revival OS
        </p>
        <h1 className="mt-2 text-3xl font-bold">Messages</h1>
        <p className="mt-2 text-[#6b705c]">
          Portal chat, service requests, and every outbound text/email
          (visit reminders, invoices, receipts, and more), all in one
          place.
        </p>

        <section className="mt-8 rounded-3xl bg-white p-5 shadow sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Sent today</h2>
            <span className="text-xs font-semibold text-[#9c7a20]">
              {sentToday.length} sent
            </span>
          </div>

          {sentToday.length === 0 ? (
            <p className="mt-3 rounded-2xl bg-[#f7f6f1] p-4 text-sm text-[#6b705c]">
              Nothing sent out yet today.
            </p>
          ) : (
            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {sentToday.map((row, index) => {
                const icon = row.channel === "sms" ? "💬" : "✉️";
                const time = new Intl.DateTimeFormat("en-US", {
                  timeZone: "America/Phoenix",
                  hour: "numeric",
                  minute: "2-digit",
                }).format(new Date(row.createdAt));

                const content = (
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#e7e2d5] px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">
                        {icon} {row.customerName}
                      </p>
                      <p className="truncate text-xs text-[#6b705c]">{row.subject}</p>
                    </div>
                    <span className="shrink-0 text-xs text-[#9c9887]">{time}</span>
                  </div>
                );

                return row.jobberClientId ? (
                  <Link
                    key={`${row.jobberClientId}-${row.createdAt}-${index}`}
                    href={`/messages/${encodeURIComponent(row.jobberClientId)}`}
                    className="block transition hover:opacity-80"
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={`unlinked-${row.createdAt}-${index}`}>{content}</div>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-3xl bg-white p-5 shadow sm:p-8">
          {inboxRows.length === 0 ? (
            <p className="rounded-2xl bg-[#f7f6f1] p-5 text-[#6b705c]">
              No messages yet.
            </p>
          ) : (
            <div className="space-y-3">
              {inboxRows.map((row) => (
                <Link
                  key={row.jobberClientId}
                  href={`/messages/${encodeURIComponent(row.jobberClientId)}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-[#e7e2d5] p-5 transition hover:border-[#d4af37]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold">{row.customerName}</p>
                    {row.lastMessagePreview ? (
                      <p className="mt-1 truncate text-sm text-[#6b705c]">
                        {row.lastMessagePreview}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-xs text-[#9c9887]">
                      {formatInboxTimestamp(row.lastActivityAt, todayPhoenix)}
                    </span>

                    <div className="flex items-center gap-2">
                      {row.openRequestCount > 0 ? (
                        <span className="rounded-full bg-[#faf4e3] px-3 py-1 text-xs font-bold text-[#9c7a20]">
                          {row.openRequestCount} open request
                          {row.openRequestCount === 1 ? "" : "s"}
                        </span>
                      ) : null}

                      {row.unreadCount > 0 ? (
                        <span className="rounded-full bg-[#174734] px-3 py-1 text-xs font-bold text-white">
                          {row.unreadCount} unread
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
