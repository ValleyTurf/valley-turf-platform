export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import {
  REACTIVATION_STATUS_LABELS,
  REACTIVATION_STATUS_STYLES,
  daysBetweenDateStrings,
  isActiveWorkflowStatus,
  isDueToday,
  isOverdue,
  isReactivationCandidate,
  isReactivationStatus,
  isUpcoming,
  matchesReactivationFilter,
  nextReactivationState,
  normalizeReactivationStatus,
  REACTIVATION_TIME_BUCKETS,
  timeBucketForDays,
  type ReactivationFilter,
  type ReactivationStatus,
  type RecontactInterval,
} from "@/lib/reactivation";
import { formatCurrency, formatNumber, formatPercent, toNumber } from "@/lib/format";
import { ComposeEmailForm } from "@/app/components/ComposeEmailForm";

type Customer = {
  id: string;
  jobber_client_id: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  reactivation_status: string | null;
  reactivation_last_contacted_at: string | null;
  reactivation_next_follow_up_at: string | null;
  reactivation_contact_attempts: number | null;
  reactivation_recontact_interval: string | null;
};

type Invoice = {
  jobber_client_id: string | null;
  issue_date: string | null;
  invoice_total: number | string;
};

type RecurringServiceRow = {
  jobber_client_id: string | null;
  is_recurring_service: boolean | null;
};

// A customer plus everything computed from their invoice history —
// built once per page load, then filtered/bucketed/grouped repeatedly
// below. Kept separate from the raw Customer row so the invoice-derived
// fields (which require joining against a second table) are computed
// in exactly one place.
type PipelineEntry = {
  customer: Customer;
  invoiceCount: number;
  lifetimeRevenue: number;
  latestInvoiceDate: string | null;
  daysSinceLastInvoice: number | null;
  status: ReactivationStatus;
};

function normalizeInterval(raw: string | null): RecontactInterval | null {
  return raw === "3mo" || raw === "6mo" ? raw : null;
}

async function updateReactivationStatus(formData: FormData) {
  "use server";

  const customerId = String(formData.get("customer_id") ?? "").trim();
  const rawStatus = String(formData.get("status") ?? "").trim();

  if (!customerId || !isReactivationStatus(rawStatus)) {
    return;
  }

  const { data: customer, error: customerError } = await supabaseServer
    .from("customers")
    .select(
      `
        reactivation_contact_attempts,
        reactivation_last_contacted_at,
        reactivation_recontact_interval
      `
    )
    .eq("id", customerId)
    .single();

  if (customerError || !customer) {
    console.error("Unable to load reactivation customer:", customerError);
    return;
  }

  const update = nextReactivationState(
    {
      lastContactedAt: customer.reactivation_last_contacted_at,
      contactAttempts: customer.reactivation_contact_attempts ?? 0,
      recontactInterval: normalizeInterval(
        customer.reactivation_recontact_interval
      ),
    },
    rawStatus,
    new Date()
  );

  const { error: updateError } = await supabaseServer
    .from("customers")
    .update({
      reactivation_status: update.status,
      reactivation_last_contacted_at: update.lastContactedAt,
      reactivation_next_follow_up_at: update.nextFollowUpAt,
      reactivation_contact_attempts: update.contactAttempts,
      reactivation_recontact_interval: update.recontactInterval,
    })
    .eq("id", customerId);

  if (updateError) {
    console.error("Unable to update reactivation customer:", updateError);
    return;
  }

  revalidatePath("/reactivation");
  revalidatePath("/customers/intelligence");
}

function customerName(customer: Customer) {
  const fullName = [customer.first_name, customer.last_name]
    .filter(Boolean)
    .join(" ");

  return fullName || customer.company_name || "Unnamed Customer";
}

function formatDate(date: string | null) {
  if (!date) return "—";

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

async function fetchAllCustomers(): Promise<Customer[]> {
  const rows: Customer[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("customers")
      .select(
        `
          id,
          jobber_client_id,
          first_name,
          last_name,
          company_name,
          email,
          phone,
          reactivation_status,
          reactivation_last_contacted_at,
          reactivation_next_follow_up_at,
          reactivation_contact_attempts,
          reactivation_recontact_interval
        `
      )
      .not("jobber_client_id", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as Customer[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}

async function fetchAllInvoices(): Promise<Invoice[]> {
  const rows: Invoice[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("invoice_financials")
      .select("jobber_client_id, issue_date, invoice_total")
      .not("jobber_client_id", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as Invoice[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}

async function fetchRecurringClientIds(): Promise<Set<string>> {
  const rows: RecurringServiceRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseServer
      .from("job_service_category")
      .select("jobber_client_id, is_recurring_service")
      .eq("is_recurring_service", true)
      .not("jobber_client_id", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as RecurringServiceRow[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return new Set(
    rows
      .filter((row) => row.is_recurring_service && row.jobber_client_id)
      .map((row) => row.jobber_client_id as string)
  );
}

async function fetchExcludedClientIds(): Promise<Set<string>> {
  const { data, error } = await supabaseServer
    .from("customer_intelligence_exclusions")
    .select("jobber_client_id")
    .eq("exclusion_type", "reactivation");

  if (error) throw error;

  return new Set((data ?? []).map((row) => row.jobber_client_id as string));
}

export default async function ReactivationPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;

  const allowedFilters: ReactivationFilter[] = [
    "all",
    "candidate",
    "contacted",
    "follow_up",
    "scheduled",
  ];

  const requestedFilter = params.filter as ReactivationFilter;
  const activeFilter = allowedFilters.includes(requestedFilter)
    ? requestedFilter
    : "all";

  const [allCustomers, invoices, recurringClientIds, excludedClientIds] =
    await Promise.all([
      fetchAllCustomers(),
      fetchAllInvoices(),
      fetchRecurringClientIds(),
      fetchExcludedClientIds(),
    ]);

  const invoicesByClient = new Map<string, Invoice[]>();

  for (const invoice of invoices) {
    if (!invoice.jobber_client_id || !invoice.issue_date) continue;

    const existing = invoicesByClient.get(invoice.jobber_client_id) ?? [];
    existing.push(invoice);
    invoicesByClient.set(invoice.jobber_client_id, existing);
  }

  const today = new Date().toISOString().slice(0, 10);

  // Every customer plus their invoice-derived stats, then narrowed down
  // to "belongs in the pipeline at all": either a fresh candidate
  // (isReactivationCandidate — same rule Customer Intelligence uses) or
  // already being actively worked (isActiveWorkflowStatus), as long as
  // they're not recurring-service or permanently excluded either way.
  const pipeline: PipelineEntry[] = allCustomers
    .filter((customer) => customer.jobber_client_id)
    .map((customer) => {
      const clientInvoices = (
        invoicesByClient.get(customer.jobber_client_id as string) ?? []
      ).sort((a, b) =>
        String(a.issue_date).localeCompare(String(b.issue_date))
      );

      const lifetimeRevenue = clientInvoices.reduce(
        (sum, invoice) => sum + toNumber(invoice.invoice_total),
        0
      );

      const latestInvoiceDate =
        clientInvoices.length > 0
          ? clientInvoices[clientInvoices.length - 1].issue_date
          : null;

      const daysSinceLastInvoice = latestInvoiceDate
        ? daysBetweenDateStrings(latestInvoiceDate, today)
        : null;

      return {
        customer,
        invoiceCount: clientInvoices.length,
        lifetimeRevenue,
        latestInvoiceDate,
        daysSinceLastInvoice,
        status: normalizeReactivationStatus(customer.reactivation_status),
      };
    })
    .filter((entry) => {
      const clientId = entry.customer.jobber_client_id as string;

      if (recurringClientIds.has(clientId)) return false;
      if (excludedClientIds.has(clientId)) return false;
      if (entry.status === "removed") return false;

      return (
        isReactivationCandidate({
          invoiceCount: entry.invoiceCount,
          daysSinceLastInvoice: entry.daysSinceLastInvoice,
          isRecurring: false,
          isExcluded: false,
        }) || isActiveWorkflowStatus(entry.status)
      );
    });

  const filteredPipeline = pipeline.filter((entry) =>
    matchesReactivationFilter(entry.status, activeFilter)
  );

  // The three shared buckets, plus a catch-all for anyone actively
  // being worked whose days-since-last-invoice has drifted past 547 (or
  // has no invoice at all) — see isActiveWorkflowStatus above for why
  // they're in the pipeline at all despite falling outside the normal
  // 90–547 day candidate window.
  const buckets = [
    ...REACTIVATION_TIME_BUCKETS.map((bucket) => ({
      key: bucket.key as string,
      title: bucket.title,
      subtitle: bucket.subtitle,
      entries: filteredPipeline.filter(
        (entry) =>
          timeBucketForDays(entry.daysSinceLastInvoice ?? -1) === bucket.key
      ),
    })),
    {
      key: "18-plus",
      title: "18+ Months",
      subtitle: "Still being worked despite the long gap.",
      entries: filteredPipeline.filter(
        (entry) => timeBucketForDays(entry.daysSinceLastInvoice ?? -1) === null
      ),
    },
  ].filter((bucket) => activeFilter !== "all" || bucket.entries.length > 0);

  const candidates = pipeline.filter(
    (entry) => entry.status === "candidate"
  ).length;

  const contacted = pipeline.filter(
    (entry) =>
      entry.status === "contacted_email" || entry.status === "contacted_text"
  ).length;

  const followUps = pipeline.filter(
    (entry) =>
      entry.status === "follow_up_3mo" || entry.status === "follow_up_6mo"
  ).length;

  const scheduled = pipeline.filter(
    (entry) => entry.status === "scheduled"
  ).length;

  const now = new Date();

  const overdueEntries = pipeline.filter((entry) =>
    isOverdue(entry.customer.reactivation_next_follow_up_at, now)
  );

  const dueTodayEntries = pipeline.filter((entry) =>
    isDueToday(entry.customer.reactivation_next_follow_up_at, now)
  );

  const upcomingEntries = pipeline.filter((entry) =>
    isUpcoming(entry.customer.reactivation_next_follow_up_at, now)
  );

  // What the user actually asked for: of everyone who landed in the
  // 3–6 month bucket (any status), what share are now Cleaning
  // Scheduled — same for 6–12 and 12–18. Deliberately NOT the 18+
  // catch-all, since that bucket isn't a comparable cohort (it's a
  // grab-bag of drifted/no-invoice records, not a clean time window).
  const reconnectionRates = REACTIVATION_TIME_BUCKETS.map((bucket) => {
    const inBucket = pipeline.filter(
      (entry) =>
        timeBucketForDays(entry.daysSinceLastInvoice ?? -1) === bucket.key
    );

    const scheduledInBucket = inBucket.filter(
      (entry) => entry.status === "scheduled"
    );

    return {
      key: bucket.key,
      title: bucket.title,
      total: inBucket.length,
      scheduled: scheduledInBucket.length,
      rate:
        inBucket.length > 0
          ? scheduledInBucket.length / inBucket.length
          : 0,
    };
  });

  const filters: { value: ReactivationFilter; label: string; count: number }[] =
    [
      { value: "all", label: "All", count: pipeline.length },
      { value: "candidate", label: "Candidates", count: candidates },
      { value: "contacted", label: "Contacted", count: contacted },
      { value: "follow_up", label: "Follow Up", count: followUps },
      { value: "scheduled", label: "Scheduled", count: scheduled },
    ];

  const metricCards = [
    { label: "Candidates", value: candidates, icon: "👋" },
    { label: "Contacted", value: contacted, icon: "✉️" },
    { label: "Follow Ups", value: followUps, icon: "🗓️" },
    { label: "Cleaning Scheduled", value: scheduled, icon: "✅" },
  ];

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>

            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Customer Reactivation
            </h1>

            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Customers who haven&apos;t invoiced in 3–18 months, grouped the
              same way as Customer Intelligence, plus anyone actively being
              worked through the outreach pipeline below.
            </p>
          </div>

          <Link
            href="/customers/intelligence"
            className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
          >
            Customer Intelligence
          </Link>
        </header>

        <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((card) => (
            <article key={card.label} className="rounded-3xl bg-white p-5 shadow">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9c7a20]">
                    {card.label}
                  </p>
                  <p className="mt-2 text-3xl font-bold">{card.value}</p>
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f7f6f1] text-xl">
                  {card.icon}
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="mt-6 grid gap-5 sm:grid-cols-3">
          <FollowUpCard
            title="Overdue Follow-Ups"
            entries={overdueEntries}
            background="#fef2f2"
            color="#991b1b"
          />
          <FollowUpCard
            title="Due Today"
            entries={dueTodayEntries}
            background="#fff7ed"
            color="#9a3412"
          />
          <FollowUpCard
            title="Upcoming"
            entries={upcomingEntries}
            background="#eff6ff"
            color="#1d4ed8"
          />
        </section>

        <section className="mt-6 rounded-3xl bg-white p-5 shadow sm:p-8">
          <h2 className="text-2xl font-bold">Reconnection Rate by Bucket</h2>
          <p className="mt-1 text-[#6b705c]">
            Of everyone who landed in each time bucket, what share are now a
            Cleaning Scheduled.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {reconnectionRates.map((bucket) => (
              <div
                key={bucket.key}
                className="rounded-2xl border border-[#e7e2d5] p-5"
              >
                <p className="font-bold">{bucket.title}</p>
                <p className="mt-2 text-3xl font-bold">
                  {formatPercent(bucket.rate)}
                </p>
                <p className="mt-1 text-sm text-[#6b705c]">
                  {bucket.scheduled} scheduled out of {bucket.total}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-3xl bg-white p-5 shadow sm:p-8">
          <h2 className="text-2xl font-bold">Reactivation Pipeline</h2>
          <p className="mt-1 text-sm text-[#6b705c]">
            {filteredPipeline.length} customers shown.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {filters.map((filter) => {
              const isActive = activeFilter === filter.value;

              return (
                <Link
                  key={filter.value}
                  href={
                    filter.value === "all"
                      ? "/reactivation"
                      : `/reactivation?filter=${filter.value}`
                  }
                  scroll={false}
                  className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition ${
                    isActive
                      ? "bg-[#d4af37] text-[#174734]"
                      : "border border-[#d8d3c6] bg-white text-[#6b705c] hover:border-[#d4af37]"
                  }`}
                >
                  {filter.label}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      isActive ? "bg-white/40" : "bg-[#f7f6f1]"
                    }`}
                  >
                    {filter.count}
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="mt-6 space-y-3">
            {buckets.length === 0 ? (
              <p className="rounded-2xl bg-[#f7f6f1] p-5 text-[#6b705c]">
                No customers match this filter.
              </p>
            ) : (
              buckets.map((bucket) => (
                <details
                  key={bucket.key}
                  className="rounded-2xl border border-[#e7e2d5] p-5"
                >
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold">{bucket.title}</h3>
                      <p className="mt-1 text-sm text-[#6b705c]">
                        {bucket.subtitle}
                      </p>
                    </div>

                    <span className="rounded-full bg-[#f7f6f1] px-3 py-1 text-sm font-bold">
                      {bucket.entries.length}
                    </span>
                  </summary>

                  <div className="mt-4 space-y-3">
                    {bucket.entries.length === 0 ? (
                      <p className="rounded-xl bg-[#f7f6f1] p-4 text-sm text-[#6b705c]">
                        No customers in this group.
                      </p>
                    ) : (
                      bucket.entries.map((entry) => (
                        <ReactivationCard
                          key={entry.customer.id}
                          entry={entry}
                        />
                      ))
                    )}
                  </div>
                </details>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function FollowUpCard({
  title,
  entries,
  background,
  color,
}: {
  title: string;
  entries: PipelineEntry[];
  background: string;
  color: string;
}) {
  return (
    <div
      className="rounded-2xl border border-[#e7e2d5] p-5"
      style={{ background }}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-bold" style={{ color }}>
          {title}
        </p>
        <p className="text-2xl font-bold" style={{ color }}>
          {entries.length}
        </p>
      </div>

      <div className="mt-4 grid gap-2">
        {entries.length === 0 ? (
          <p className="text-sm text-[#6b705c]">No customers</p>
        ) : (
          entries.slice(0, 5).map((entry) => (
            <Link
              key={entry.customer.id}
              href={`/customers/${
                entry.customer.jobber_client_id ?? entry.customer.id
              }`}
              className="flex items-center justify-between gap-3 text-sm text-[#174734] hover:underline"
            >
              <span className="truncate font-semibold">
                {customerName(entry.customer)}
              </span>
              <span className="shrink-0 text-[#6b705c]">
                {formatDate(entry.customer.reactivation_next_follow_up_at)}
              </span>
            </Link>
          ))
        )}

        {entries.length > 5 && (
          <p className="text-xs text-[#6b705c]">
            + {entries.length - 5} more
          </p>
        )}
      </div>
    </div>
  );
}

// Top-level, not nested inside ReactivationPage — doesn't close over
// anything page-local (updateReactivationStatus is a module-level
// server action), and nesting would trip
// react/no-unstable-nested-components.
function ReactivationCard({ entry }: { entry: PipelineEntry }) {
  const { customer } = entry;
  const statusStyle = REACTIVATION_STATUS_STYLES[entry.status];
  const interval = normalizeInterval(customer.reactivation_recontact_interval);

  return (
    <div className="rounded-xl bg-[#f7f6f1] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href={`/customers/${customer.jobber_client_id ?? customer.id}`}
            className="font-bold hover:text-[#9c7a20]"
          >
            {customerName(customer)}
          </Link>

          <p className="mt-1 text-xs text-[#6b705c]">
            {customer.phone || "No phone"} · {customer.email || "No email"}
          </p>

          <p className="mt-1 text-sm text-[#6b705c]">
            {formatNumber(entry.invoiceCount)} invoices ·{" "}
            {formatCurrency(entry.lifetimeRevenue)} lifetime · last invoice{" "}
            {formatDate(entry.latestInvoiceDate)} ·{" "}
            {customer.reactivation_contact_attempts ?? 0} attempts
          </p>

          {customer.reactivation_next_follow_up_at && (
            <p className="mt-1 text-sm text-[#6b705c]">
              Follow up {formatDate(customer.reactivation_next_follow_up_at)}
              {interval && (
                <span className="ml-1 text-xs text-[#9c7a20]">
                  ({interval})
                </span>
              )}
            </p>
          )}
        </div>

        <span
          className="inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold"
          style={statusStyle}
        >
          {REACTIVATION_STATUS_LABELS[entry.status]}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <StatusButton customerId={customer.id} status="contacted_email" label="Emailed" />
        <StatusButton customerId={customer.id} status="contacted_text" label="Texted" />
        <StatusButton customerId={customer.id} status="follow_up_3mo" label="Reach Out 3mo" />
        <StatusButton customerId={customer.id} status="follow_up_6mo" label="Reach Out 6mo" />
        <StatusButton
          customerId={customer.id}
          status="scheduled"
          label="Cleaning Scheduled"
          tone="positive"
        />
        <StatusButton
          customerId={customer.id}
          status="not_interested"
          label="Not Interested"
          tone="negative"
        />
        <StatusButton customerId={customer.id} status="removed" label="Remove" tone="negative" />

        {customer.jobber_client_id && (
          <ComposeEmailForm jobberClientId={customer.jobber_client_id} />
        )}

        <Link
          href={`/customers/${customer.jobber_client_id ?? customer.id}`}
          className="inline-flex whitespace-nowrap rounded-lg bg-[#174734] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#226246]"
        >
          View Customer
        </Link>
      </div>
    </div>
  );
}

function StatusButton({
  customerId,
  status,
  label,
  tone = "neutral",
}: {
  customerId: string;
  status: ReactivationStatus;
  label: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClasses =
    tone === "positive"
      ? "border-[#166534] text-[#166534] hover:bg-[#166534] hover:text-white"
      : tone === "negative"
        ? "border-[#991b1b] text-[#991b1b] hover:bg-[#991b1b] hover:text-white"
        : "border-[#d8d3c6] text-[#174734] hover:border-[#174734] hover:bg-[#174734] hover:text-white";

  return (
    <form action={updateReactivationStatus}>
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="status" value={status} />

      <button
        type="submit"
        className={`whitespace-nowrap rounded-lg border bg-white px-2.5 py-1.5 text-xs font-bold transition ${toneClasses}`}
      >
        {label}
      </button>
    </form>
  );
}
