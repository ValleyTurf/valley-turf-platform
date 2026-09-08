export const dynamic = "force-dynamic";
export const revalidate = 0;

// Jobs list -- Ryan's call on the long-open "Jobs list page" decision
// (previously: build one, bolt search onto the Schedule calendar
// instead, or leave it). jobber_jobs is the one local table both native
// (Tier 2) and real Jobber-synced jobs already write to -- same
// "one table, two sources" shape as jobber_invoices, which
// invoices/history/page.tsx already reads the same way. Before this
// page, the only place any job appeared in this app's own UI was the
// Customer page's "Recent Jobs" section, which reads live Jobber
// GraphQL and so never shows native-only jobs at all -- this is the
// first place a native job is visible outside its owning customer's
// page.
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { escapeSearchValue } from "@/lib/searchUtils";
import CustomerTypeahead from "@/app/components/CustomerTypeahead";

type JobsPageProps = {
  searchParams: Promise<{ page?: string; q?: string; show?: string }>;
};

type JobRow = {
  jobber_job_id: string;
  jobber_client_id: string | null;
  customer_name: string | null;
  title: string | null;
  job_number: string | null;
  job_status: string | null;
  job_type: string | null;
  jobber_web_uri: string | null;
  end_at: string | null;
  total: number | string | null;
  source: string | null;
};

const PAGE_SIZE = 20;

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

// Same normalize-then-title-case approach as invoices/history/page.tsx's
// formatStatus -- has to handle Jobber's own upper-snake-case jobStatus
// ("ACTION_REQUIRED", "LATE") and native jobs' lowercase
// "upcoming"/"archived" (lib/nativeJobs.ts) in the same column.
function formatStatus(value: string | null): string {
  if (!value) return "Unknown";
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function statusClasses(status: string | null): string {
  const normalized = (status ?? "").toUpperCase();

  if (normalized.includes("ARCHIVED") || normalized.includes("CANCEL")) {
    return "bg-[#f0f0ec] text-[#6b705c]";
  }

  if (normalized.includes("LATE") || normalized.includes("ACTION_REQUIRED")) {
    return "bg-red-100 text-red-800";
  }

  if (normalized.includes("UPCOMING") || normalized.includes("ACTIVE")) {
    return "bg-green-100 text-green-800";
  }

  return "bg-yellow-100 text-yellow-800";
}

// Same substring match sync-jobs' own dashboard summary uses
// (app/(platform)/dashboard/page.tsx) rather than an exact-string
// comparison -- Jobber's jobType values aren't a fixed enum this app
// controls, native jobs use a plain "RECURRING"/"ONE_OFF" (lib/nativeJobs.ts).
function isRecurring(jobType: string | null): boolean {
  return (jobType ?? "").toLowerCase().includes("recur");
}

function buildJobsUrl(page: number, search: string, showArchived: boolean): string {
  const params = new URLSearchParams();

  if (search) {
    params.set("q", search);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  if (showArchived) {
    params.set("show", "all");
  }

  const query = params.toString();

  return query ? `/jobs?${query}` : "/jobs";
}

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const params = await searchParams;
  const search = String(params.q ?? "").trim();
  const showArchived = params.show === "all";
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const currentPage =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let jobsQuery = supabaseServer
    .from("jobber_jobs")
    .select(
      "jobber_job_id, jobber_client_id, customer_name, title, job_number, job_status, job_type, jobber_web_uri, end_at, total, source",
      { count: "exact" }
    )
    .order("end_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (!showArchived) {
    // Same convention as schedule/my-day/crew-status: a null job_status
    // is a job Jobber hasn't reported a status for yet, treated as
    // active rather than filtered out.
    jobsQuery = jobsQuery.or("job_status.is.null,job_status.neq.archived");
  }

  if (search) {
    const safeSearch = escapeSearchValue(search);

    jobsQuery = jobsQuery.or(
      [
        `customer_name.ilike.%${safeSearch}%`,
        `title.ilike.%${safeSearch}%`,
        `job_number.ilike.%${safeSearch}%`,
      ].join(",")
    );
  }

  const { data, count, error } = await jobsQuery;

  const jobs = (data ?? []) as JobRow[];
  const totalJobs = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalJobs / PAGE_SIZE));

  const previousPageUrl = buildJobsUrl(Math.max(1, currentPage - 1), search, showArchived);
  const nextPageUrl = buildJobsUrl(Math.min(totalPages, currentPage + 1), search, showArchived);
  const toggleArchivedUrl = buildJobsUrl(1, search, !showArchived);

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Jobs</h1>

            <p className="mt-2 text-sm text-[#6b705c]">
              Every job this app knows about, whether it was created here
              or in Jobber — most recently ending first.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/jobs/new"
              className="rounded-xl bg-[#174734] px-4 py-2 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              + Create Job
            </Link>

            <Link
              href={toggleArchivedUrl}
              className="rounded-xl border border-[#174734] px-4 py-2 text-center text-sm font-bold transition hover:bg-white"
            >
              {showArchived ? "Hide archived jobs" : "Show archived jobs"}
            </Link>
          </div>
        </header>

        <section className="mt-5 rounded-2xl bg-white p-4 shadow">
          <form action="/jobs" method="GET" className="flex gap-2">
            {showArchived && <input type="hidden" name="show" value="all" />}

            <CustomerTypeahead
              name="q"
              defaultValue={search}
              placeholder="Search customer, title, or job #..."
              navigateOnSelect={false}
              className="min-w-0 flex-1"
              inputClassName="w-full rounded-xl border border-[#d9d4c6] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />

            <button
              type="submit"
              className="rounded-xl bg-[#174734] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Search
            </button>

            {search && (
              <Link
                href={buildJobsUrl(1, "", showArchived)}
                className="rounded-xl border border-[#d9d4c6] px-4 py-2.5 text-sm font-bold transition hover:bg-[#f7f6f1]"
              >
                Clear
              </Link>
            )}
          </form>
        </section>

        {error ? (
          <section className="mt-5 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">Jobs could not be loaded</p>
            <p className="mt-1 text-sm text-red-600">{error.message}</p>
          </section>
        ) : jobs.length === 0 ? (
          <section className="mt-5 rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-[#6b705c]">
              {search ? "No jobs found for that search." : "No jobs yet."}
            </p>
          </section>
        ) : (
          <div className="mt-5 space-y-3">
            {jobs.map((job) => {
              const isNative = job.source === "native" || job.jobber_job_id.startsWith("native-");

              return (
                <article
                  key={job.jobber_job_id}
                  className="rounded-2xl bg-white p-4 shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {job.jobber_client_id ? (
                        <Link
                          href={`/customers/${encodeURIComponent(job.jobber_client_id)}`}
                          className="truncate text-sm font-bold hover:underline"
                        >
                          {job.customer_name || "—"}
                        </Link>
                      ) : (
                        <p className="truncate text-sm font-bold">
                          {job.customer_name || "—"}
                        </p>
                      )}

                      <p className="mt-0.5 text-xs text-[#6b705c]">
                        Job #{job.job_number ?? "—"}
                        {job.title ? ` — ${job.title}` : ""}
                      </p>

                      <p className="text-xs text-[#6b705c]">
                        {isRecurring(job.job_type) ? "Recurring" : "One-off"}
                        {" · "}
                        {formatDate(job.end_at)}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClasses(
                            job.job_status
                          )}`}
                        >
                          {formatStatus(job.job_status)}
                        </span>

                        <p className="text-sm font-bold">
                          {formatCurrency(toNumber(job.total))}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <Link
                          href={`/jobs/${encodeURIComponent(job.jobber_job_id)}/edit`}
                          className="text-xs font-semibold text-[#9c7a20] hover:underline"
                        >
                          Manage →
                        </Link>

                        {job.jobber_web_uri ? (
                          <a
                            href={job.jobber_web_uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-[#6b705c] hover:underline"
                          >
                            Open in Jobber ↗
                          </a>
                        ) : isNative ? (
                          <span className="text-xs font-semibold text-[#6b705c]">
                            Native job
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {totalJobs > 0 && (
          <nav className="mt-6 flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow">
            {currentPage > 1 ? (
              <Link
                href={previousPageUrl}
                className="rounded-xl border border-[#d9d4c6] px-4 py-2 text-sm font-bold transition hover:bg-[#f7f6f1]"
              >
                ← Prev
              </Link>
            ) : (
              <span className="cursor-not-allowed rounded-xl border border-[#e6e2d8] px-4 py-2 text-sm font-bold text-[#aaa99f]">
                ← Prev
              </span>
            )}

            <p className="text-sm font-semibold">
              Page {Math.min(currentPage, totalPages)} of {totalPages}
            </p>

            {currentPage < totalPages ? (
              <Link
                href={nextPageUrl}
                className="rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
              >
                Next →
              </Link>
            ) : (
              <span className="cursor-not-allowed rounded-xl bg-[#d5d5cf] px-4 py-2 text-sm font-bold text-white">
                Next →
              </span>
            )}
          </nav>
        )}
      </div>
    </main>
  );
}
