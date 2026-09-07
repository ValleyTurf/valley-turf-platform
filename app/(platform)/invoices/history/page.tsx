export const dynamic = "force-dynamic";
export const revalidate = 0;

// Invoiced History -- Ryan's request after asking why a just-created
// native invoice didn't show up in the Customer page's "Recent Invoices"
// section (that section calls Jobber's live GraphQL API directly, and a
// native invoice never gets pushed to real Jobber, so it can never show
// up there). jobber_invoices is the one local table both invoicing paths
// already write to -- the real Jobber sync (app/api/jobber/sync-invoices)
// upserts every real Jobber invoice into it, and mirrorNativeInvoiceInJobberTables
// (lib/payments.ts) does the same for native ones under a synthetic
// "native-<uuid>" id -- so querying it here is the one place that shows
// both kinds of invoices side by side, unlike the Customer page.
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { escapeSearchValue } from "@/lib/searchUtils";
import CustomerTypeahead from "@/app/components/CustomerTypeahead";

type InvoicesHistoryPageProps = {
  searchParams: Promise<{ page?: string; q?: string }>;
};

type InvoiceRow = {
  jobber_invoice_id: string;
  jobber_client_id: string | null;
  invoice_number: string | null;
  customer_name: string | null;
  subject: string | null;
  status: string | null;
  issue_date: string | null;
  due_date: string | null;
  total: number | string | null;
  jobber_web_uri: string | null;
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
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

// Same normalize-then-title-case approach as customers/[id]/page.tsx's
// formatStatus/statusClasses -- has to handle two different vocabularies
// in the same column: real Jobber's upper-snake-case invoiceStatus
// ("AWAITING_PAYMENT", "BAD_DEBT") and native invoices' own lowercase
// "draft"/"sent"/"paid" (lib/payments.ts's mirror write).
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

  if (normalized.includes("PAID")) {
    return "bg-green-100 text-green-800";
  }

  if (
    normalized.includes("DRAFT") ||
    normalized.includes("PENDING") ||
    normalized.includes("AWAITING") ||
    normalized === "SENT"
  ) {
    return "bg-yellow-100 text-yellow-800";
  }

  if (normalized.includes("BAD_DEBT") || normalized.includes("COLLECTION")) {
    return "bg-red-100 text-red-800";
  }

  return "bg-[#f0f0ec] text-[#6b705c]";
}

function buildHistoryUrl(page: number, search: string): string {
  const params = new URLSearchParams();

  if (search) {
    params.set("q", search);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();

  return query ? `/invoices/history?${query}` : "/invoices/history";
}

export default async function InvoicesHistoryPage({
  searchParams,
}: InvoicesHistoryPageProps) {
  const params = await searchParams;
  const search = String(params.q ?? "").trim();
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const currentPage =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let invoicesQuery = supabaseServer
    .from("jobber_invoices")
    .select(
      "jobber_invoice_id, jobber_client_id, invoice_number, customer_name, subject, status, issue_date, due_date, total, jobber_web_uri",
      { count: "exact" }
    )
    .order("issue_date", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (search) {
    const safeSearch = escapeSearchValue(search);

    invoicesQuery = invoicesQuery.or(
      [
        `customer_name.ilike.%${safeSearch}%`,
        `subject.ilike.%${safeSearch}%`,
        `invoice_number.ilike.%${safeSearch}%`,
      ].join(",")
    );
  }

  const { data, count, error } = await invoicesQuery;

  const invoices = (data ?? []) as InvoiceRow[];
  const totalInvoices = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalInvoices / PAGE_SIZE));

  const previousPageUrl = buildHistoryUrl(Math.max(1, currentPage - 1), search);
  const nextPageUrl = buildHistoryUrl(
    Math.min(totalPages, currentPage + 1),
    search
  );

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Invoiced History
            </h1>

            <p className="mt-2 text-sm text-[#6b705c]">
              Every invoice this app knows about, whether it was created
              here or in Jobber — most recent first.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/invoices"
              className="rounded-xl border border-[#174734] px-4 py-2 text-center text-sm font-bold transition hover:bg-white"
            >
              ← Create Invoices
            </Link>
          </div>
        </header>

        <section className="mt-5 rounded-2xl bg-white p-4 shadow">
          <form action="/invoices/history" method="GET" className="flex gap-2">
            <CustomerTypeahead
              name="q"
              defaultValue={search}
              placeholder="Search customer, subject, or invoice #..."
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
                href="/invoices/history"
                className="rounded-xl border border-[#d9d4c6] px-4 py-2.5 text-sm font-bold transition hover:bg-[#f7f6f1]"
              >
                Clear
              </Link>
            )}
          </form>
        </section>

        {error ? (
          <section className="mt-5 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">Invoices could not be loaded</p>
            <p className="mt-1 text-sm text-red-600">{error.message}</p>
          </section>
        ) : invoices.length === 0 ? (
          <section className="mt-5 rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-[#6b705c]">
              {search
                ? "No invoices found for that search."
                : "No invoices yet."}
            </p>
          </section>
        ) : (
          <div className="mt-5 space-y-3">
            {invoices.map((invoice) => {
              const isNative = invoice.jobber_invoice_id.startsWith("native-");

              return (
                <article
                  key={invoice.jobber_invoice_id}
                  className="rounded-2xl bg-white p-4 shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {invoice.jobber_client_id ? (
                        <Link
                          href={`/customers/${encodeURIComponent(invoice.jobber_client_id)}`}
                          className="truncate text-sm font-bold hover:underline"
                        >
                          {invoice.customer_name || "—"}
                        </Link>
                      ) : (
                        <p className="truncate text-sm font-bold">
                          {invoice.customer_name || "—"}
                        </p>
                      )}

                      <p className="mt-0.5 text-xs text-[#6b705c]">
                        Invoice #{invoice.invoice_number ?? "—"}
                        {invoice.subject ? ` — ${invoice.subject}` : ""}
                      </p>

                      <p className="text-xs text-[#6b705c]">
                        Issued {formatDate(invoice.issue_date)}
                        {invoice.due_date
                          ? ` · Due ${formatDate(invoice.due_date)}`
                          : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClasses(
                            invoice.status
                          )}`}
                        >
                          {formatStatus(invoice.status)}
                        </span>

                        <p className="text-sm font-bold">
                          {formatCurrency(toNumber(invoice.total))}
                        </p>
                      </div>

                      {invoice.jobber_web_uri ? (
                        <a
                          href={invoice.jobber_web_uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-[#9c7a20] hover:underline"
                        >
                          View in Jobber →
                        </a>
                      ) : isNative ? (
                        <span className="text-xs font-semibold text-[#6b705c]">
                          Native invoice
                        </span>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {totalInvoices > 0 && (
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
