export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { getCurrentPortalUser } from "@/lib/currentPortalUser";
import { supabaseServer } from "@/lib/supabase-server";
import { PortalShell } from "../PortalShell";
import { sendPortalMessage } from "./actions";

type PortalMessage = {
  id: string;
  sender: "customer" | "staff";
  sender_name: string | null;
  body: string;
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

export default async function PortalMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const customer = await getCurrentPortalUser();

  if (!customer) {
    redirect("/portal/login");
  }

  const { result } = await searchParams;

  const { data, error } = await supabaseServer
    .from("portal_messages")
    .select("id, sender, sender_name, body, created_at")
    .eq("jobber_client_id", customer.jobberClientId)
    .order("created_at", { ascending: true })
    .limit(200);

  const messages = (error ? [] : data ?? []) as PortalMessage[];

  return (
    <PortalShell activeHref="/portal/messages" customerName={customer.name}>
      <section className="rounded-3xl bg-white p-6 shadow">
        <h2 className="text-lg font-bold">Messages</h2>
        <p className="mt-1 text-sm text-[#6b705c]">
          Send us a message any time — we&apos;ll reply here.
        </p>

        {result === "invalid" && (
          <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            Enter a message before sending.
          </p>
        )}

        {result === "error" && (
          <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            Something went wrong sending your message. Please try again.
          </p>
        )}

        <div className="mt-6 max-h-[28rem] space-y-3 overflow-y-auto rounded-2xl bg-[#f7f6f1] p-4">
          {messages.length === 0 ? (
            <p className="text-sm text-[#6b705c]">
              No messages yet — send us one below.
            </p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                  message.sender === "staff"
                    ? "bg-[#174734] text-white"
                    : "ml-auto bg-white text-[#174734] shadow"
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
                    ? message.sender_name || "Valley Turf Revival"
                    : "You"}{" "}
                  · {formatMessageTime(message.created_at)}
                </p>
              </div>
            ))
          )}
        </div>

        <form action={sendPortalMessage} className="mt-4 flex gap-3">
          <textarea
            name="body"
            rows={2}
            required
            placeholder="Type a message..."
            className="block w-full rounded-xl border border-[#d8d3c6] bg-white px-4 py-3 text-[#174734] outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#226246]"
          >
            Send
          </button>
        </form>
      </section>
    </PortalShell>
  );
}
