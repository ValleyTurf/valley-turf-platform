export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import {
  computeDisplayStatus,
  quoteStatusLabel,
  isQuoteStatus,
  QUOTE_STATUSES,
  type QuoteStatus,
} from "@/lib/quotes";

type QuoteRow = {
  id: string;
  quote_number: number;
  recipient_name: string;
  service_category: string | null;
  price_total: number | string;
  status: string;
  expires_at: string | null;
  created_at: string;
};

type QuotesPageProps = {
  searchParams: Promise<{ status?: string; q?: string }>;
};

const STATUS_BADGE_CLASSES: Record<QuoteStatus, string> = {
  draft: "bg-[#f0eee6] text-[#6b705c]",
  sent: "bg-blue-50 text-blue-800",
  accepted: "bg-green-50 text-green-800",
  declined: "bg-red-50 text-red-700",
  expired: "bg-amber-50 text-amber-800",
};

function escapeSearchValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, "\\,");
}

export default async function QuotesPage({ searchParams }: QuotesPageProps) {
  const params = await searchParams;
  const statusFilter = isQuoteStatus(params.status) ? params.status : "all";
  const search = (params.q ?? "").trim();

  let query = supabaseServer
    .from("quotes")
    .select(
      "id, quote_number, recipient_name, service_category, price_total, status, expires_at, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (search) {
    query = query.ilike("recipient_name", `%${escapeSearchValue(search)}%`);
  }

  const { data, error } = await query;
  const allQuotes = (data ?? []) as QuoteRow[];

  const quotes = allQuotes.filter((quote) => {
    if (statusFilter === "all") return true;
    if (!isQuoteStatus(quote.status)) return false;
    return computeDisplayStatus(quote.status, quote.expires_at) === statusFilter;
  });

  const totals = quotes.reduce(
    (acc, quote) => {
      const display = isQuoteStatus(quote.status)
        ? computeDisplayStatus(quote.status, quote.expires_at)
        : "draft";
      if (display === "accepted") acc.accepted += Number(quote.price_total) || 0;
      acc.count += 1;
      return acc;
    },
    { accepted: 0, count: 0 }
  );

  function statusUrl(status: QuoteStatus | "all"): string {
    const p = new URLSearchParams();
    if (status !== "all") p.set("status", status);
    if (search) p.set("q", search);
    const qs = p.toString();
    return qs ? `/quotes?${qs}` : "/quotes";
  }

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Quotes</h1>
            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Flat-price quotes for customers and leads, each with a
              shareable link they can accept or decline.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href="/quotes/pricing"
              className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
            >
              Manage Pricing
            </Link>
            <Link
              href="/quotes/new"
              className="rounded-xl bg-[#d4af37] px-5 py-3 text-center text-sm font-bold text-[#174734] transition hover:bg-[#e6c766]"
            >
              + New Quote
            </Link>
          </div>
        </header>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <form method="GET" className="flex flex-wrap items-end gap-3">
            {statusFilter !== "all" && (
              <input type="hidden" name="status" value={statusFilter} />
            )}
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="q" className="text-xs font-bold text-[#9c7a20]">
                Search by name
              </label>
              <input
                id="q"
                name="q"
                type="text"
                defaultValue={search}
                placeholder="Recipient name…"
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Search
            </button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={statusUrl("all")} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${statusFilter === "all" ? "bg-[#174734] text-white" : "border border-[#d8d3c6] bg-white text-[#6b705c] hover:border-[#d4af37]"}`}>
              All
            </Link>
            {QUOTE_STATUSES.map((status) => (
              <Link
                key={status}
                href={statusUrl(status)}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                  statusFilter === status
                    ? "bg-[#174734] text-white"
                    : "border border-[#d8d3c6] bg-white text-[#6b705c] hover:border-[#d4af37]"
                }`}
              >
                {quoteStatusLabel(status)}
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl bg-white p-5 shadow">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
              Quotes Shown
            </p>
            <p className="mt-2 text-3xl font-bold">{totals.count}</p>
          </article>
          <article className="rounded-2xl bg-white p-5 shadow">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
              Accepted Value (shown)
            </p>
            <p className="mt-2 text-3xl font-bold text-green-700">
              {formatCurrency(totals.accepted)}
            </p>
          </article>
        </section>

        {error ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">Quotes could not be loaded</p>
            <p className="mt-1 text-sm text-red-600">{error.message}</p>
          </section>
        ) : quotes.length === 0 ? (
          <section className="mt-6 rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-[#6b705c]">
              No quotes match this filter yet.
            </p>
          </section>
        ) : (
          <section className="mt-6 space-y-3">
            {quotes.map((quote) => {
              const displayStatus = isQuoteStatus(quote.status)
                ? computeDisplayStatus(quote.status, quote.expires_at)
                : "draft";

              return (
                <Link
                  key={quote.id}
                  href={`/quotes/${quote.id}`}
                  className="flex flex-col gap-3 rounded-2xl border border-[#e7e2d5] bg-white p-5 shadow-sm transition hover:border-[#d4af37] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#9c7a20]">
                      Quote #{quote.quote_number}
                    </p>
                    <p className="mt-0.5 truncate font-bold">
                      {quote.recipient_name}
                    </p>
                    <p className="mt-0.5 text-sm text-[#6b705c]">
                      {quote.service_category || "General"} ·{" "}
                      {formatDateOnly(quote.created_at)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-4 sm:text-right">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_BADGE_CLASSES[displayStatus]}`}
                    >
                      {quoteStatusLabel(displayStatus)}
                    </span>
                    <p className="text-xl font-bold">
                      {formatCurrency(quote.price_total)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
