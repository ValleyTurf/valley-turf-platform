export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { ReactNode } from "react";
import { supabaseServer } from "@/lib/supabase-server";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { computeDisplayStatus, isQuoteStatus, type QuoteStatus } from "@/lib/quotes";
import { acceptQuote, declineQuote, markQuoteViewed } from "./actions";

type PublicQuote = {
  id: string;
  quote_number: number;
  recipient_name: string;
  service_category: string | null;
  description: string;
  price_total: number | string;
  status: QuoteStatus;
  expires_at: string | null;
  response_note: string | null;
};

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-10 text-[#174734] sm:px-6">
      <div className="mx-auto max-w-xl">
        <p className="text-center text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
          Valley Turf Revival
        </p>
        {children}
      </div>
    </main>
  );
}

export default async function PublicQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { token } = await params;
  const { result } = await searchParams;

  const { data, error } = await supabaseServer
    .from("quotes")
    .select(
      "id, quote_number, recipient_name, service_category, description, price_total, status, expires_at, response_note"
    )
    .eq("public_token", token)
    .single();

  if (error || !data || !isQuoteStatus(data.status)) {
    return (
      <Shell>
        <h1 className="mt-4 text-center text-2xl font-bold">
          Quote not found
        </h1>
        <p className="mt-3 text-center text-[#6b705c]">
          This link doesn&apos;t match a quote we have on file. Double-check
          the link, or contact us directly.
        </p>
      </Shell>
    );
  }

  const quote = data as PublicQuote;
  const displayStatus = computeDisplayStatus(quote.status, quote.expires_at);

  if (quote.status === "sent" || quote.status === "accepted" || quote.status === "declined") {
    // "sent" (and anything already responded to) is a real, deliverable
    // quote — a customer landing here for the first time counts as a
    // view. Draft quotes don't record a view; the link isn't meant to
    // be live yet.
    await markQuoteViewed(quote.id);
  }

  return (
    <Shell>
      <h1 className="mt-4 text-center text-3xl font-bold">
        Quote for {quote.recipient_name}
      </h1>
      <p className="mt-1 text-center text-sm text-[#6b705c]">
        Quote #{quote.quote_number}
        {quote.service_category ? ` · ${quote.service_category}` : ""}
      </p>

      <section className="mt-8 rounded-3xl bg-white p-6 shadow sm:p-8">
        <p className="text-center text-5xl font-bold">
          {formatCurrency(quote.price_total)}
        </p>

        <p className="mt-6 whitespace-pre-wrap text-[#174734]">
          {quote.description}
        </p>

        {quote.expires_at && (
          <p className="mt-6 text-sm text-[#6b705c]">
            Valid until {formatDateOnly(quote.expires_at)}.
          </p>
        )}
      </section>

      {result === "error" && (
        <p className="mt-4 rounded-xl bg-red-50 p-4 text-center text-sm font-semibold text-red-700">
          That didn&apos;t go through — the quote may have changed since you
          loaded this page. Refresh and try again, or contact us directly.
        </p>
      )}

      {displayStatus === "draft" && (
        <p className="mt-6 rounded-xl bg-amber-50 p-4 text-center text-sm font-semibold text-amber-800">
          This quote isn&apos;t ready to view yet. Please contact us if you
          were sent this link.
        </p>
      )}

      {displayStatus === "expired" && (
        <p className="mt-6 rounded-xl bg-amber-50 p-4 text-center text-sm font-semibold text-amber-800">
          This quote has expired. Contact us for an updated price.
        </p>
      )}

      {displayStatus === "accepted" && (
        <p className="mt-6 rounded-xl bg-green-50 p-4 text-center text-sm font-semibold text-green-800">
          You accepted this quote. We&apos;ll be in touch to schedule the
          work.
        </p>
      )}

      {displayStatus === "declined" && (
        <div className="mt-6 rounded-xl bg-[#f0eee6] p-4 text-center text-sm font-semibold text-[#6b705c]">
          <p>You declined this quote.</p>
          {quote.response_note && (
            <p className="mt-2 font-normal italic">
              &ldquo;{quote.response_note}&rdquo;
            </p>
          )}
        </div>
      )}

      {displayStatus === "sent" && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <form action={acceptQuote.bind(null, token)}>
            <button
              type="submit"
              className="w-full rounded-xl bg-[#174734] px-5 py-4 text-center text-base font-bold text-white transition hover:bg-[#226246]"
            >
              Accept Quote
            </button>
          </form>

          <details className="rounded-xl border border-[#d8d3c6] bg-white p-4">
            <summary className="cursor-pointer text-center text-base font-bold text-[#6b705c]">
              Decline
            </summary>

            <form action={declineQuote.bind(null, token)} className="mt-3 space-y-2">
              <label
                htmlFor="note"
                className="text-xs font-semibold text-[#6b705c]"
              >
                Anything you&apos;d like us to know? (optional)
              </label>
              <textarea
                id="note"
                name="note"
                rows={3}
                className="w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
              <button
                type="submit"
                className="w-full rounded-xl border border-red-300 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
              >
                Decline Quote
              </button>
            </form>
          </details>
        </div>
      )}
    </Shell>
  );
}
