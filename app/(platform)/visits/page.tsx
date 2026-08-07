export const dynamic = "force-dynamic";
export const revalidate = 0;
// Same reasoning as the Transactions page's maxDuration — a busy month
// or YTD range needs more headroom than Vercel's default function
// timeout.
export const maxDuration = 60;

import Link from "next/link";
import { formatCurrencyPrecise, formatDateOnly, formatNumber } from "@/lib/format";
import {
  getVisitDateRange,
  isVisitTimeframe,
  formatPhoenixTime,
  summarizeVisitsByJobType,
  type VisitSortField,
  type VisitTimeframe,
} from "@/lib/visitReportFormatting";
import { getVisitReport, type VisitRow } from "@/lib/visitReport";

type VisitsPageProps = {
  searchParams: Promise<{
    timeframe?: string;
    start?: string;
    end?: string;
    jobType?: string;
    status?: string;
    q?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
};

// Matches the Transactions page's default (50/page, Jobber's own
// default) — a full year of visits rendered as one unpaginated HTML
// table risks the same page-load failure that was root-caused there.
const ROWS_PER_PAGE = 50;

const TIMEFRAME_OPTIONS: Array<{ value: VisitTimeframe; label: string }> = [
  { value: "today", label: "Today" },
  { value: "next-7-days", label: "Next 7 Days" },
  { value: "next-30-days", label: "Next 30 Days" },
  { value: "this-month", label: "This Month" },
  { value: "last-7-days", label: "Last 7 Days" },
  { value: "last-30-days", label: "Last 30 Days" },
  { value: "last-month", label: "Last Month" },
  { value: "ytd", label: "YTD" },
  { value: "custom", label: "Custom" },
];

function isSortField(value: string | undefined): value is VisitSortField {
  return ["date", "client", "jobNumber", "jobType", "status"].includes(value ?? "");
}

function getPhoenixToday(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = Number(parts.find((p) => p.type === "year")?.value ?? 0);
  const month = Number(parts.find((p) => p.type === "month")?.value ?? 1);
  const day = Number(parts.find((p) => p.type === "day")?.value ?? 1);

  return new Date(Date.UTC(year, month - 1, day));
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
          Valley Turf Revival OS
        </p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Visits</h1>

        <section className="mt-6 rounded-3xl border border-red-200 bg-white p-6 shadow">
          <p className="font-bold text-red-700">Couldn&apos;t load visits</p>
          <p className="mt-2 text-sm text-[#6b705c]">{message}</p>
          <p className="mt-4 text-sm text-[#6b705c]">
            Try a narrower date range, or{" "}
            <Link href="/visits" className="font-semibold text-[#9c7a20] hover:underline">
              reset to the default view
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}

export default async function VisitsPage({ searchParams }: VisitsPageProps) {
  const params = await searchParams;

  const timeframe: VisitTimeframe = isVisitTimeframe(params.timeframe)
    ? params.timeframe
    : "this-month";

  const { startDate, endDate } = getVisitDateRange(
    timeframe,
    getPhoenixToday(),
    params.start,
    params.end
  );

  const jobType = params.jobType || "all";
  const status = params.status || "all";
  const search = params.q || "";
  const sortField: VisitSortField = isSortField(params.sort) ? params.sort : "date";
  const sortDir: "asc" | "desc" = params.dir === "asc" ? "asc" : "desc";

  let rows: VisitRow[];
  let jobTypeOptions: string[];
  let statusOptions: string[];

  try {
    const result = await getVisitReport({
      startDate,
      endDate,
      jobType,
      status,
      search,
      sortField,
      sortDir,
    });
    rows = result.rows;
    jobTypeOptions = result.jobTypeOptions;
    statusOptions = result.statusOptions;
  } catch (error) {
    console.error("Visits page failed to load:", error);
    const message =
      error instanceof Error ? error.message : "An unknown error occurred.";
    return <ErrorState message={message} />;
  }

  const jobTypeSummary = summarizeVisitsByJobType(rows);
  const grandTotal = jobTypeSummary.reduce((sum, group) => sum + group.total, 0);

  const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const requestedPage = Number(params.page ?? "1");
  const currentPage =
    Number.isFinite(requestedPage) && requestedPage >= 1
      ? Math.min(Math.trunc(requestedPage), totalPages)
      : 1;
  const pageStart = (currentPage - 1) * ROWS_PER_PAGE;
  const pageRows = rows.slice(pageStart, pageStart + ROWS_PER_PAGE);

  const exportParams = new URLSearchParams({
    start: startDate,
    end: endDate,
    jobType,
    status,
    q: search,
    sort: sortField,
    dir: sortDir,
  });

  function baseParams(): URLSearchParams {
    const p = new URLSearchParams({ timeframe, jobType, status });
    if (search) p.set("q", search);
    if (timeframe === "custom") {
      p.set("start", startDate);
      p.set("end", endDate);
    }
    p.set("sort", sortField);
    p.set("dir", sortDir);
    return p;
  }

  function sortHref(field: VisitSortField): string {
    const nextDir: "asc" | "desc" =
      field === sortField && sortDir === "desc" ? "asc" : "desc";

    const p = baseParams();
    p.set("sort", field);
    p.set("dir", nextDir);

    return `/visits?${p.toString()}`;
  }

  function pageHref(pageNumber: number): string {
    const p = baseParams();
    p.set("page", String(pageNumber));
    return `/visits?${p.toString()}`;
  }

  function sortIndicator(field: VisitSortField): string {
    if (field !== sortField) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Visits</h1>
            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Every scheduled visit synced from Jobber, in one sortable,
              searchable list — cross-check against the schedule or crew
              records anytime.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href={`/api/visits/export?${exportParams.toString()}`}
              className="rounded-xl bg-[#d4af37] px-5 py-3 text-center text-sm font-bold text-[#174734] transition hover:bg-[#e6c766]"
            >
              Export CSV
            </a>
            <Link
              href="/schedule"
              className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
            >
              Back to Schedule
            </Link>
          </div>
        </header>

        <section className="mt-6 rounded-3xl bg-white p-5 shadow sm:p-8">
          <form method="GET" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="sort" value={sortField} />
            <input type="hidden" name="dir" value={sortDir} />

            <div>
              <label className="text-xs font-bold text-[#9c7a20]">
                Entries Within
              </label>
              <select
                name="timeframe"
                defaultValue={timeframe}
                className="mt-1 rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              >
                {TIMEFRAME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {timeframe === "custom" && (
              <>
                <div>
                  <label className="text-xs font-bold text-[#9c7a20]">Start</label>
                  <input
                    type="date"
                    name="start"
                    defaultValue={startDate}
                    className="mt-1 block rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#9c7a20]">End</label>
                  <input
                    type="date"
                    name="end"
                    defaultValue={endDate}
                    className="mt-1 block rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm"
                  />
                </div>
              </>
            )}

            <div>
              <label className="text-xs font-bold text-[#9c7a20]">Job Type</label>
              <select
                name="jobType"
                defaultValue={jobType}
                className="mt-1 rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              >
                <option value="all">All</option>
                {jobTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-[#9c7a20]">Status</label>
              <select
                name="status"
                defaultValue={status}
                className="mt-1 rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              >
                <option value="all">All</option>
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[200px] flex-1">
              <label className="text-xs font-bold text-[#9c7a20]">
                Search Client
              </label>
              <input
                type="text"
                name="q"
                defaultValue={search}
                placeholder="Client name…"
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>

            <button
              type="submit"
              className="rounded-xl bg-[#174734] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Filter
            </button>
          </form>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl bg-white p-5 shadow">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9c7a20]">
              Visits
            </p>
            <p className="mt-2 text-2xl font-bold">{formatNumber(rows.length)}</p>
          </article>
          {jobTypeSummary.map((group) => (
            <article key={group.jobType} className="rounded-2xl bg-white p-5 shadow">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9c7a20]">
                {group.jobType} Jobs
              </p>
              <p className="mt-2 text-2xl font-bold">
                {formatCurrencyPrecise(group.total)}
              </p>
              <p className="mt-1 text-xs text-[#6b705c]">
                {formatNumber(group.jobCount)} job{group.jobCount === 1 ? "" : "s"}
              </p>
            </article>
          ))}
          <article className="rounded-2xl bg-white p-5 shadow">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#9c7a20]">
              Total
            </p>
            <p className="mt-2 text-2xl font-bold">{formatCurrencyPrecise(grandTotal)}</p>
          </article>
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl bg-white shadow">
          {rows.length === 0 ? (
            <p className="p-8 text-center text-[#6b705c]">
              No visits match this filter.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left text-sm">
                  <thead className="border-b border-[#eee9dc] bg-[#f7f6f1] text-xs font-bold uppercase tracking-[0.08em] text-[#6b705c]">
                    <tr>
                      <th className="px-5 py-3">
                        <Link href={sortHref("jobNumber")} className="hover:text-[#174734]">
                          Job #{sortIndicator("jobNumber")}
                        </Link>
                      </th>
                      <th className="px-5 py-3">
                        <Link href={sortHref("date")} className="hover:text-[#174734]">
                          Date{sortIndicator("date")}
                        </Link>
                      </th>
                      <th className="px-5 py-3">Times</th>
                      <th className="px-5 py-3">Visit Title</th>
                      <th className="px-5 py-3">
                        <Link href={sortHref("client")} className="hover:text-[#174734]">
                          Client{sortIndicator("client")}
                        </Link>
                      </th>
                      <th className="px-5 py-3">Email</th>
                      <th className="px-5 py-3">Phone</th>
                      <th className="px-5 py-3">
                        <Link href={sortHref("status")} className="hover:text-[#174734]">
                          Status{sortIndicator("status")}
                        </Link>
                      </th>
                      <th className="px-5 py-3">
                        <Link href={sortHref("jobType")} className="hover:text-[#174734]">
                          Job Type{sortIndicator("jobType")}
                        </Link>
                      </th>
                      <th className="px-5 py-3 text-center">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row, index) => {
                      const startTime = formatPhoenixTime(row.startAt);
                      const endTime = formatPhoenixTime(row.endAt);

                      return (
                        <tr
                          key={row.id}
                          className={`border-b border-[#f0eee6] last:border-0 ${
                            index % 2 === 1 ? "bg-[#fbfaf6]" : ""
                          }`}
                        >
                          <td className="px-5 py-3 font-semibold text-[#174734]">
                            {row.jobNumber || "—"}
                          </td>
                          <td className="px-5 py-3 text-[#6b705c]">
                            {formatDateOnly(row.date)}
                          </td>
                          <td className="px-5 py-3 text-[#6b705c]">
                            {startTime && endTime
                              ? `${startTime} - ${endTime}`
                              : startTime || "—"}
                          </td>
                          <td className="px-5 py-3">{row.title || "—"}</td>
                          <td className="px-5 py-3 font-semibold">
                            {row.clientId ? (
                              <Link
                                href={`/customers/${encodeURIComponent(row.clientId)}`}
                                className="text-[#174734] hover:underline"
                              >
                                {row.clientName}
                              </Link>
                            ) : (
                              row.clientName
                            )}
                          </td>
                          <td className="px-5 py-3 text-[#6b705c]">
                            {row.clientEmail || "—"}
                          </td>
                          <td className="px-5 py-3 text-[#6b705c]">
                            {row.clientPhone || "—"}
                          </td>
                          <td className="px-5 py-3">
                            <span className="rounded-full bg-[#f0eee6] px-2.5 py-1 text-xs font-bold text-[#6b705c]">
                              {row.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-[#6b705c]">{row.jobType}</td>
                          <td className="px-5 py-3 text-center">
                            {row.jobberWebUri ? (
                              <a
                                href={row.jobberWebUri}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open in Jobber"
                                className="text-[#9c7a20] hover:underline"
                              >
                                ↗
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eee9dc] px-5 py-4">
                  <p className="text-sm text-[#6b705c]">
                    Showing {formatNumber(pageStart + 1)}–
                    {formatNumber(Math.min(pageStart + ROWS_PER_PAGE, rows.length))} of{" "}
                    {formatNumber(rows.length)}
                  </p>

                  <div className="flex items-center gap-2">
                    {currentPage > 1 ? (
                      <Link
                        href={pageHref(currentPage - 1)}
                        className="rounded-lg border border-[#d8d3c6] px-3 py-1.5 text-sm font-bold hover:border-[#d4af37]"
                      >
                        ← Prev
                      </Link>
                    ) : (
                      <span className="rounded-lg border border-[#eee9dc] px-3 py-1.5 text-sm font-bold text-[#c7c2b3]">
                        ← Prev
                      </span>
                    )}

                    <span className="px-2 text-sm font-semibold text-[#6b705c]">
                      Page {formatNumber(currentPage)} of {formatNumber(totalPages)}
                    </span>

                    {currentPage < totalPages ? (
                      <Link
                        href={pageHref(currentPage + 1)}
                        className="rounded-lg border border-[#d8d3c6] px-3 py-1.5 text-sm font-bold hover:border-[#d4af37]"
                      >
                        Next →
                      </Link>
                    ) : (
                      <span className="rounded-lg border border-[#eee9dc] px-3 py-1.5 text-sm font-bold text-[#c7c2b3]">
                        Next →
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
