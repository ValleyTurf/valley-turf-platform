export const dynamic = "force-dynamic";
export const revalidate = 0;

// Customer Reviews report -- the staff-facing view of the post-visit
// star ratings customers leave from the /rate/[token] link at the
// bottom of invoice emails (see lib/invoiceRatings.ts and migration
// 074_add_invoice_ratings.sql). Until this page, invoice_ratings had no
// UI at all -- a 1-4 star rating fired an instant alert
// (sendLowRatingAlert) and showed up in the daily digest's "Low invoice
// ratings (last 24h)" backstop, but nothing showed the full history,
// and 5-star ratings weren't visible anywhere in the app at all (they
// route the customer on to leave a real Google review, but the rating
// itself still gets saved here too -- see submitInvoiceRating).
//
// Timeframe control copied from job-costing-analytics/page.tsx
// (isTimeframe/getDateRange/getPhoenixToday) for the exact same
// Phoenix-anchored day-boundary behavior and UI, applied here to
// invoice_ratings.created_at instead of an invoice's issue_date.
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { formatDateOnly as formatDateLabel, formatNumber } from "@/lib/format";

type JobCostingAnalyticsProps = {
  searchParams: Promise<{
    timeframe?: string;
    start?: string;
    end?: string;
  }>;
};

type Timeframe =
  | "last-7-days"
  | "last-month"
  | "this-month"
  | "last-90-days"
  | "ytd"
  | "all-time"
  | "custom";

type RatingRow = {
  id: string;
  invoice_id: string;
  jobber_client_id: string | null;
  customer_name: string | null;
  invoice_number: string | null;
  score: number;
  routed_to_google: boolean;
  created_at: string;
};

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getPhoenixToday(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = Number(parts.find((part) => part.type === "year")?.value ?? 0);
  const month = Number(
    parts.find((part) => part.type === "month")?.value ?? 1
  );
  const day = Number(parts.find((part) => part.type === "day")?.value ?? 1);

  return new Date(Date.UTC(year, month - 1, day));
}

// Same Phoenix-anchored conversion as getPhoenixToday, applied to an
// arbitrary created_at timestamp instead of "now" -- keeps a rating
// logged at, say, 11pm Phoenix time / 6am UTC on the correct calendar
// day rather than rolling into the next one.
function toPhoenixDateString(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function isTimeframe(value: string | undefined): value is Timeframe {
  return [
    "last-7-days",
    "last-month",
    "this-month",
    "last-90-days",
    "ytd",
    "all-time",
    "custom",
  ].includes(value ?? "");
}

function getDateRange(
  timeframe: Timeframe,
  customStart?: string,
  customEnd?: string
): { startDate: string | null; endDate: string; label: string } {
  const today = getPhoenixToday();
  let start: Date | null = new Date(today);
  let end = new Date(today);

  if (timeframe === "last-7-days") {
    start!.setUTCDate(start!.getUTCDate() - 6);
  } else if (timeframe === "last-month") {
    start = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)
    );
    end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  } else if (timeframe === "this-month") {
    start = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)
    );
  } else if (timeframe === "last-90-days") {
    start!.setUTCDate(start!.getUTCDate() - 89);
  } else if (timeframe === "ytd") {
    start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  } else if (timeframe === "all-time") {
    start = null;
  } else if (timeframe === "custom") {
    const parsedStart = customStart
      ? new Date(`${customStart}T00:00:00Z`)
      : null;
    const parsedEnd = customEnd ? new Date(`${customEnd}T00:00:00Z`) : null;

    if (parsedStart && !Number.isNaN(parsedStart.getTime())) {
      start = parsedStart;
    }

    if (parsedEnd && !Number.isNaN(parsedEnd.getTime())) {
      end = parsedEnd;
    }

    if (start && start > end) {
      [start, end] = [end, start];
    }
  }

  const startDate = start ? formatDateInput(start) : null;
  const endDate = formatDateInput(end);

  const label = startDate
    ? `${formatDateLabel(startDate)} – ${formatDateLabel(endDate)}`
    : `All time through ${formatDateLabel(endDate)}`;

  return { startDate, endDate, label };
}

function StarDisplay({ score }: { score: number }) {
  return (
    <span className="tracking-wide" aria-label={`${score} out of 5 stars`}>
      {"★".repeat(score)}
      <span className="text-[#d8d3c6]">{"★".repeat(5 - score)}</span>
    </span>
  );
}

export default async function CustomerReviewsPage({
  searchParams,
}: JobCostingAnalyticsProps) {
  const params = await searchParams;
  const timeframe: Timeframe = isTimeframe(params.timeframe)
    ? params.timeframe
    : "all-time";

  const { startDate, endDate, label } = getDateRange(
    timeframe,
    params.start,
    params.end
  );

  const timeframeOptions: Array<{ value: Timeframe; label: string }> = [
    { value: "last-7-days", label: "Last 7 Days" },
    { value: "last-month", label: "Last Month" },
    { value: "this-month", label: "This Month" },
    { value: "last-90-days", label: "Last 90 Days" },
    { value: "ytd", label: "YTD" },
    { value: "all-time", label: "All Time" },
    { value: "custom", label: "Custom" },
  ];

  let allRows: RatingRow[] = [];
  let fetchError: string | null = null;

  try {
    const { data, error } = await supabaseServer
      .from("invoice_ratings")
      .select(
        "id, invoice_id, jobber_client_id, customer_name, invoice_number, score, routed_to_google, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) throw error;
    allRows = (data ?? []) as RatingRow[];
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Unknown error";
  }

  const rows = allRows.filter((row) => {
    const day = toPhoenixDateString(row.created_at);
    if (startDate && day < startDate) return false;
    if (day > endDate) return false;
    return true;
  });

  const totalCount = rows.length;
  const averageScore =
    totalCount > 0
      ? rows.reduce((sum, row) => sum + row.score, 0) / totalCount
      : null;
  const lowCount = rows.filter((row) => row.score <= 4).length;
  const fiveStarCount = rows.filter((row) => row.score === 5).length;
  const scoreCounts = [5, 4, 3, 2, 1].map((score) => ({
    score,
    count: rows.filter((row) => row.score === score).length,
  }));
  const maxScoreCount = Math.max(1, ...scoreCounts.map((s) => s.count));

  function buildUrl(overrides: Partial<{ timeframe: Timeframe }>): string {
    const p = new URLSearchParams();
    const nextTimeframe = overrides.timeframe ?? timeframe;
    p.set("timeframe", nextTimeframe);

    if (nextTimeframe === "custom") {
      if (params.start) p.set("start", params.start);
      if (params.end) p.set("end", params.end);
    }

    return `/reports/reviews?${p.toString()}`;
  }

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Customer Reviews
            </h1>

            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Every 1-5 star rating left from the link at the bottom of an
              invoice email. A 5-star rating routes the customer on to
              leave a real Google review, but is still recorded here too.
              4 and below stays internal and pages you immediately — this
              is the full history of both.
            </p>
          </div>

          <Link
            href="/reports"
            className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
          >
            Back to Reports
          </Link>
        </header>

        <section
          id="timeframe"
          className="mt-8 scroll-mt-6 rounded-3xl bg-white p-6 shadow"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
                Timeframe
              </p>
              <h2 className="mt-1 text-2xl font-bold">{label}</h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {timeframeOptions.map((option) => (
                <Link
                  key={option.value}
                  href={buildUrl({ timeframe: option.value })}
                  scroll={false}
                  className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                    timeframe === option.value
                      ? "bg-[#d4af37] text-[#174734]"
                      : "border border-[#d8d3c6] bg-white text-[#6b705c] hover:border-[#d4af37]"
                  }`}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>

          {timeframe === "custom" && (
            <form
              method="GET"
              action="/reports/reviews#timeframe"
              className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl bg-[#f7f6f1] p-4"
            >
              <input type="hidden" name="timeframe" value="custom" />

              <label className="text-sm font-semibold text-[#6b705c]">
                Start date
                <input
                  type="date"
                  name="start"
                  defaultValue={startDate ?? ""}
                  className="mt-1 block rounded-xl border border-[#d8d3c6] bg-white px-3 py-2 text-[#174734]"
                />
              </label>

              <label className="text-sm font-semibold text-[#6b705c]">
                End date
                <input
                  type="date"
                  name="end"
                  defaultValue={endDate}
                  className="mt-1 block rounded-xl border border-[#d8d3c6] bg-white px-3 py-2 text-[#174734]"
                />
              </label>

              <button
                type="submit"
                className="rounded-xl bg-[#174734] px-5 py-2.5 text-sm font-bold text-white"
              >
                Apply Dates
              </button>
            </form>
          )}
        </section>

        {fetchError ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">Reviews could not be loaded</p>
            <p className="mt-1 text-sm text-red-600">{fetchError}</p>
          </section>
        ) : totalCount === 0 ? (
          <section className="mt-6 rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-[#6b705c]">
              No ratings found for {label}.
            </p>
          </section>
        ) : (
          <>
            <section className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-3xl bg-white p-6 shadow">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
                  Total Ratings
                </p>
                <p className="mt-3 text-3xl font-bold">
                  {formatNumber(totalCount)}
                </p>
              </article>

              <article className="rounded-3xl bg-white p-6 shadow">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
                  Average Score
                </p>
                <p className="mt-3 text-3xl font-bold">
                  {averageScore !== null ? averageScore.toFixed(1) : "—"}
                  <span className="text-lg text-[#6b705c]"> / 5</span>
                </p>
              </article>

              <article className="rounded-3xl bg-white p-6 shadow">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
                  5-Star Ratings
                </p>
                <p className="mt-3 text-3xl font-bold text-green-700">
                  {formatNumber(fiveStarCount)}
                </p>
                <p className="mt-2 text-sm text-[#6b705c]">
                  {totalCount > 0
                    ? `${((fiveStarCount / totalCount) * 100).toFixed(0)}% of ratings`
                    : "—"}
                </p>
              </article>

              <article className="rounded-3xl bg-white p-6 shadow">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
                  4 &amp; Below
                </p>
                <p
                  className={`mt-3 text-3xl font-bold ${
                    lowCount > 0 ? "text-red-600" : "text-[#174734]"
                  }`}
                >
                  {formatNumber(lowCount)}
                </p>
                <p className="mt-2 text-sm text-[#6b705c]">
                  Each one already paged you when it came in
                </p>
              </article>
            </section>

            <section className="mt-8 rounded-3xl bg-white p-5 shadow sm:p-8">
              <h2 className="text-2xl font-bold">Score Breakdown</h2>

              <div className="mt-6 space-y-3">
                {scoreCounts.map(({ score, count }) => (
                  <div key={score} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-sm font-semibold text-[#9c7a20]">
                      <StarDisplay score={score} />
                    </span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#eeeae0]">
                      <div
                        className={`h-full rounded-full ${
                          score >= 5 ? "bg-[#174734]" : "bg-red-500"
                        }`}
                        style={{ width: `${(count / maxScoreCount) * 100}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-sm font-semibold">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-8 rounded-3xl bg-white p-5 shadow sm:p-8">
              <h2 className="text-2xl font-bold">All Ratings</h2>
              <p className="mt-1 text-[#6b705c]">
                Newest first, for {label}.
              </p>

              <div className="mt-5 overflow-x-auto rounded-xl border border-[#e7e2d5]">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-[#f7f6f1] text-xs font-semibold uppercase tracking-wide text-[#6b705c]">
                    <tr>
                      <th className="px-4 py-2">Customer</th>
                      <th className="px-4 py-2">Invoice</th>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Score</th>
                      <th className="px-4 py-2">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eeeae0]">
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-2 font-medium">
                          {row.jobber_client_id ? (
                            <Link
                              href={`/customers/${encodeURIComponent(row.jobber_client_id)}`}
                              className="text-[#174734] underline hover:text-[#9c7a20]"
                            >
                              {row.customer_name ?? "Unknown Customer"}
                            </Link>
                          ) : (
                            row.customer_name ?? "Unknown Customer"
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <a
                            href={`/api/invoices/${row.invoice_id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#9c7a20] underline"
                          >
                            {row.invoice_number ?? row.invoice_id}
                          </a>
                        </td>
                        <td className="px-4 py-2 text-[#6b705c]">
                          {formatDateLabel(row.created_at)}
                        </td>
                        <td className="px-4 py-2 text-[#9c7a20]">
                          <StarDisplay score={row.score} />
                        </td>
                        <td className="px-4 py-2 text-[#6b705c]">
                          {row.routed_to_google ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">
                              Sent to Google
                            </span>
                          ) : (
                            <span className="rounded-full bg-[#f0eee6] px-2 py-0.5 text-xs font-bold text-[#6b705c]">
                              Stayed internal
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
