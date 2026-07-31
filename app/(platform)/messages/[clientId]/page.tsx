export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { formatDateOnly } from "@/lib/format";
import { replyToCustomer, updateServiceRequestStatus } from "./actions";
import { StatusSelect } from "./StatusSelect";

type PortalMessage = {
  id: string;
  sender: "customer" | "staff";
  sender_name: string | null;
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

  const [customerResult, messagesResult, requestsResult] = await Promise.all([
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
  ]);

  const customer = customerResult.data as
    | { full_name: string | null; email: string | null; phone: string | null }
    | null;

  const messages = (messagesResult.data ?? []) as PortalMessage[];
  const requests = (requestsResult.data ?? []) as PortalServiceRequest[];

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

        <h1 className="mt-2 text-3xl font-bold">
          {customer?.full_name || "Unnamed Customer"}
        </h1>
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
            {messages.length === 0 ? (
              <p className="text-sm text-[#6b705c]">No messages yet.</p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                    message.sender === "staff"
                      ? "ml-auto bg-[#174734] text-white"
                      : "bg-white text-[#174734] shadow"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.body}</p>
                  <p
                    className={`mt-1 text-xs ${
                      message.sender === "staff"
                        ? "text-white/70"
                        : "text-[#9c9887]"
                    }`}
                  >
                    {message.sender === "staff"
                      ? message.sender_name || "Staff"
                      : customer?.full_name || "Customer"}{" "}
                    · {formatMessageTime(message.created_at)}
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
        </section>
      </div>
    </main>
  );
}
