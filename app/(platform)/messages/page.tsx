export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

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

export default async function MessagesInboxPage() {
  const [messagesResult, requestsResult] = await Promise.all([
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
  ]);

  const messages = (messagesResult.data ?? []) as PortalMessageRow[];
  const openRequests = (requestsResult.data ?? []) as PortalServiceRequestRow[];

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

  const jobberClientIds = Array.from(inboxMap.keys());

  if (jobberClientIds.length > 0) {
    const { data: customerRows } = await supabaseServer
      .from("customers")
      .select("jobber_client_id, full_name")
      .in("jobber_client_id", jobberClientIds);

    for (const customer of (customerRows ?? []) as CustomerRow[]) {
      const row = inboxMap.get(customer.jobber_client_id);

      if (row) {
        row.customerName = customer.full_name || "Unnamed Customer";
      }
    }
  }

  const inboxRows = Array.from(inboxMap.values()).sort(
    (a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1)
  );

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
          Valley Turf Revival OS
        </p>
        <h1 className="mt-2 text-3xl font-bold">Customer Portal Messages</h1>
        <p className="mt-2 text-[#6b705c]">
          Service requests and messages submitted through the customer
          portal.
        </p>

        <section className="mt-8 rounded-3xl bg-white p-5 shadow sm:p-8">
          {inboxRows.length === 0 ? (
            <p className="rounded-2xl bg-[#f7f6f1] p-5 text-[#6b705c]">
              No portal activity yet.
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

                  <div className="flex shrink-0 items-center gap-2">
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
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
