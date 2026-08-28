export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import {
  REACTIVATION_STATUS_LABELS,
  REACTIVATION_STATUS_STYLES,
  buildRecontactGroupStats,
  isActiveWorkflowStatus,
  isDueToday,
  isOverdue,
  isReactivationStatus,
  isUpcoming,
  matchesReactivationFilter,
  nextReactivationState,
  normalizeReactivationStatus,
  type ReactivationFilter,
  type ReactivationStatus,
  type RecontactInterval,
} from "@/lib/reactivation";
import { formatPercent } from "@/lib/format";

type Customer = {
  id: string;
  jobber_client_id: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  first_job_at: string | null;
  last_job_at: string | null;
  total_jobs: number | null;
  total_completed_jobs: number | null;
  reactivation_status: string | null;
  reactivation_last_contacted_at: string | null;
  reactivation_next_follow_up_at: string | null;
  reactivation_contact_attempts: number | null;
  reactivation_recontact_interval: string | null;
};

type ReactivationPriority = {
  label: string;
  background: string;
  color: string;
};

// The Reactivation Pipeline groups by disposition rather than by time
// bucket (which is how Customer Intelligence groups its raw, untouched
// candidate list) — once a customer enters this pipeline, what matters
// day-to-day is "what stage of the conversation are they at," not how
// long ago their last invoice was. contacted_email/contacted_text share
// a "Contacted" group; follow_up_3mo/follow_up_6mo share a "Follow-Up
// Scheduled" group (the interval badge on each card still shows which
// window). Collapsed by default, same as Intelligence's bucket cards.
type PipelineGroupKey =
  | "candidate"
  | "contacted"
  | "follow_up"
  | "scheduled"
  | "not_interested"
  | "dog_passed_away";

const PIPELINE_GROUPS: {
  key: PipelineGroupKey;
  title: string;
  subtitle: string;
}[] = [
  { key: "candidate", title: "Candidates", subtitle: "Never contacted yet." },
  {
    key: "contacted",
    title: "Contacted",
    subtitle: "Reached out — no follow-up date set yet.",
  },
  {
    key: "follow_up",
    title: "Follow-Up Scheduled",
    subtitle: "A reach-out date is on the calendar.",
  },
  {
    key: "scheduled",
    title: "Cleaning Scheduled",
    subtitle: "Converted — a cleaning is booked.",
  },
  {
    key: "not_interested",
    title: "Not Interested",
    subtitle: "Said no, for now.",
  },
  {
    key: "dog_passed_away",
    title: "Dog Passed Away",
    subtitle: "",
  },
];

function pipelineGroupForStatus(status: ReactivationStatus): PipelineGroupKey {
  if (status === "contacted_email" || status === "contacted_text")
    return "contacted";
  if (status === "follow_up_3mo" || status === "follow_up_6mo")
    return "follow_up";
  if (status === "scheduled") return "scheduled";
  if (status === "not_interested") return "not_interested";
  if (status === "dog_passed_away") return "dog_passed_away";
  return "candidate";
}

const SIX_MONTHS_IN_DAYS = 183;
const NINE_MONTHS_IN_DAYS = 274;
const TWELVE_MONTHS_IN_DAYS = 365;

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
  // A status change here can also flip whether this customer belongs in
  // Customer Intelligence's raw candidate buckets (see
  // isActiveWorkflowStatus / normalizeReactivationStatus) — keep that
  // page's cached view in sync too, so nobody sees stale duplicate
  // entries across the two pages.
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

function daysSince(date: string | null) {
  if (!date) return 0;

  const dateTime = new Date(date).getTime();
  return Math.floor((Date.now() - dateTime) / (1000 * 60 * 60 * 24));
}

function formatInactiveTime(date: string | null) {
  const days = daysSince(date);

  if (days < 30) return `${days} days`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo`;

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  return remainingMonths === 0
    ? `${years} yr`
    : `${years} yr ${remainingMonths} mo`;
}

function getPriority(lastJobAt: string | null): ReactivationPriority {
  const inactiveDays = daysSince(lastJobAt);

  if (inactiveDays >= TWELVE_MONTHS_IN_DAYS) {
    return { label: "Win-Back", background: "#fee2e2", color: "#991b1b" };
  }

  if (inactiveDays >= NINE_MONTHS_IN_DAYS) {
    return { label: "High Priority", background: "#ffedd5", color: "#9a3412" };
  }

  return { label: "Reactivation", background: "#fef3c7", color: "#92400e" };
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
    "dog_passed_away",
    "win_back",
  ];

  const requestedFilter = params.filter as ReactivationFilter;
  const activeFilter = allowedFilters.includes(requestedFilter)
    ? requestedFilter
    : "all";

  const { data: exclusionsData } = await supabaseServer
    .from("customer_intelligence_exclusions")
    .select("jobber_client_id")
    .eq("exclusion_type", "reactivation");

  const excludedClientIds = (exclusionsData ?? []).map(
    (row) => row.jobber_client_id
  );

  const idListForFilter =
    excludedClientIds.length > 0
      ? excludedClientIds.map((id) => `"${id}"`).join(",")
      : '"__none__"';

  const { data: customers, error } = await supabaseServer
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
        first_job_at,
        last_job_at,
        total_jobs,
        total_completed_jobs,
        reactivation_status,
        reactivation_last_contacted_at,
        reactivation_next_follow_up_at,
        reactivation_contact_attempts,
        reactivation_recontact_interval
      `
    )
    .gt("total_completed_jobs", 0)
    .not("last_job_at", "is", null)
    .neq("reactivation_status", "removed")
    .not("jobber_client_id", "in", `(${idListForFilter})`)
    .order("last_job_at", { ascending: true })
    .limit(1000);

  if (error) {
    return (
      <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-bold">Customer Reactivation</h1>

          <div className="mt-6 rounded-2xl bg-red-50 p-5 text-red-800">
            Unable to load reactivation customers.
            <div className="mt-2 text-sm">{error.message}</div>
          </div>
        </div>
      </main>
    );
  }

  const allCustomers = (customers ?? []) as Customer[];
  const now = new Date();

  const customerList = allCustomers.filter((customer) => {
    const inactiveDays = daysSince(customer.last_job_at);
    return (
      inactiveDays >= SIX_MONTHS_IN_DAYS ||
      isActiveWorkflowStatus(
        normalizeReactivationStatus(customer.reactivation_status)
      )
    );
  });

  const filteredCustomers = customerList.filter((customer) =>
    matchesReactivationFilter(
      normalizeReactivationStatus(customer.reactivation_status),
      daysSince(customer.last_job_at),
      activeFilter,
      TWELVE_MONTHS_IN_DAYS
    )
  );

  // Groups are built from filteredCustomers, so a specific filter chip
  // (e.g. "Follow Up") naturally collapses this down to just the one
  // relevant group instead of five empty accordions — only when "all"
  // is selected do we show every group, empty ones included, as a full
  // overview (matching Customer Intelligence's always-show-3-buckets
  // pattern).
  const groupedCustomers = PIPELINE_GROUPS.map((group) => ({
    ...group,
    customers: filteredCustomers.filter(
      (customer) =>
        pipelineGroupForStatus(
          normalizeReactivationStatus(customer.reactivation_status)
        ) === group.key
    ),
  })).filter((group) => activeFilter === "all" || group.customers.length > 0);

  const candidates = customerList.filter(
    (customer) =>
      normalizeReactivationStatus(customer.reactivation_status) ===
      "candidate"
  ).length;

  const contacted = customerList.filter((customer) => {
    const status = normalizeReactivationStatus(customer.reactivation_status);
    return status === "contacted_email" || status === "contacted_text";
  }).length;

  const followUps = customerList.filter((customer) => {
    const status = normalizeReactivationStatus(customer.reactivation_status);
    return status === "follow_up_3mo" || status === "follow_up_6mo";
  }).length;

  const scheduled = customerList.filter(
    (customer) =>
      normalizeReactivationStatus(customer.reactivation_status) ===
      "scheduled"
  ).length;

  const dogPassedAway = customerList.filter(
    (customer) =>
      normalizeReactivationStatus(customer.reactivation_status) ===
      "dog_passed_away"
  ).length;

  const winBackCustomers = customerList.filter(
    (customer) =>
      daysSince(customer.last_job_at) >= TWELVE_MONTHS_IN_DAYS &&
      normalizeReactivationStatus(customer.reactivation_status) ===
        "candidate"
  ).length;

  const overdueCustomers = customerList.filter((customer) =>
    isOverdue(customer.reactivation_next_follow_up_at, now)
  );

  const dueTodayCustomers = customerList.filter((customer) =>
    isDueToday(customer.reactivation_next_follow_up_at, now)
  );

  const upcomingCustomers = customerList.filter((customer) =>
    isUpcoming(customer.reactivation_next_follow_up_at, now)
  );

  const recontactStats = buildRecontactGroupStats(
    customerList.map((customer) => ({
      reactivationStatus: normalizeReactivationStatus(
        customer.reactivation_status
      ),
      recontactInterval: normalizeInterval(
        customer.reactivation_recontact_interval
      ),
    }))
  );

  const filters: { value: ReactivationFilter; label: string; count: number }[] =
    [
      { value: "all", label: "All", count: customerList.length },
      { value: "candidate", label: "Candidates", count: candidates },
      { value: "contacted", label: "Contacted", count: contacted },
      { value: "follow_up", label: "Follow Up", count: followUps },
      { value: "scheduled", label: "Scheduled", count: scheduled },
      { value: "dog_passed_away", label: "Dog Passed Away", count: dogPassedAway },
      { value: "win_back", label: "Win-Back", count: winBackCustomers },
    ];

  const metricCards = [
    { label: "Candidates", value: candidates, icon: "👋" },
    { label: "Win-Back", value: winBackCustomers, icon: "📈" },
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
              Previous customers with no completed service in the last 6
              months, plus anyone actively being worked through the outreach
              pipeline below.
            </p>
          </div>

          <Link
            href="/customers/intelligence"
            className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
          >
            Customer Intelligence
          </Link>
        </header>

        <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
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
            customers={overdueCustomers}
            background="#fef2f2"
            color="#991b1b"
          />
          <FollowUpCard
            title="Due Today"
            customers={dueTodayCustomers}
            background="#fff7ed"
            color="#9a3412"
          />
          <FollowUpCard
            title="Upcoming"
            customers={upcomingCustomers}
            background="#eff6ff"
            color="#1d4ed8"
          />
        </section>

        <section className="mt-6 rounded-3xl bg-white p-5 shadow sm:p-8">
          <h2 className="text-2xl font-bold">Recontact Conversion by Window</h2>
          <p className="mt-1 text-[#6b705c]">
            Of the customers placed in each reach-out window, how many ended
            up with a Cleaning Scheduled — a rough read on which timeframe
            actually works for recontacting a lapsed customer.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {recontactStats.map((stat) => (
              <div
                key={stat.interval}
                className="rounded-2xl border border-[#e7e2d5] p-5"
              >
                <p className="font-bold">{stat.label}</p>
                <p className="mt-2 text-3xl font-bold">
                  {formatPercent(stat.conversionRate)}
                </p>
                <p className="mt-1 text-sm text-[#6b705c]">
                  {stat.scheduled} scheduled out of {stat.total} tracked
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-3xl bg-white p-5 shadow sm:p-8">
          <h2 className="text-2xl font-bold">Reactivation Pipeline</h2>
          <p className="mt-1 text-sm text-[#6b705c]">
            {filteredCustomers.length} customers shown.
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
            {groupedCustomers.length === 0 ? (
              <p className="rounded-2xl bg-[#f7f6f1] p-5 text-[#6b705c]">
                No customers match this filter.
              </p>
            ) : (
              groupedCustomers.map((group) => (
                <details
                  key={group.key}
                  className="rounded-2xl border border-[#e7e2d5] p-5"
                >
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold">{group.title}</h3>
                      {group.subtitle && (
                        <p className="mt-1 text-sm text-[#6b705c]">
                          {group.subtitle}
                        </p>
                      )}
                    </div>

                    <span className="rounded-full bg-[#f7f6f1] px-3 py-1 text-sm font-bold">
                      {group.customers.length}
                    </span>
                  </summary>

                  <div className="mt-4 space-y-3">
                    {group.customers.length === 0 ? (
                      <p className="rounded-xl bg-[#f7f6f1] p-4 text-sm text-[#6b705c]">
                        No customers in this group.
                      </p>
                    ) : (
                      group.customers.map((customer) => (
                        <ReactivationCard key={customer.id} customer={customer} />
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

// Deliberately a top-level function, not nested inside ReactivationPage —
// it doesn't close over anything page-local (updateReactivationStatus is
// already a module-level server action), and nesting a component
// definition inside another component's render trips
// react/no-unstable-nested-components. Same reasoning as FollowUpCard/
// StatusButton below.
function ReactivationCard({ customer }: { customer: Customer }) {
  const status = normalizeReactivationStatus(customer.reactivation_status);
  const statusStyle = REACTIVATION_STATUS_STYLES[status];
  const priority = getPriority(customer.last_job_at);
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
            Last service {formatDate(customer.last_job_at)} ·{" "}
            {formatInactiveTime(customer.last_job_at)} inactive ·{" "}
            {customer.total_completed_jobs ?? 0} jobs ·{" "}
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

        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold"
            style={{ background: priority.background, color: priority.color }}
          >
            {priority.label}
          </span>

          <span
            className="inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold"
            style={statusStyle}
          >
            {REACTIVATION_STATUS_LABELS[status]}
          </span>
        </div>
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
        <StatusButton
          customerId={customer.id}
          status="dog_passed_away"
          label="Dog Passed Away"
          tone="negative"
        />
        <StatusButton customerId={customer.id} status="removed" label="Remove" tone="negative" />

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

function FollowUpCard({
  title,
  customers,
  background,
  color,
}: {
  title: string;
  customers: Customer[];
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
          {customers.length}
        </p>
      </div>

      <div className="mt-4 grid gap-2">
        {customers.length === 0 ? (
          <p className="text-sm text-[#6b705c]">No customers</p>
        ) : (
          customers.slice(0, 5).map((customer) => (
            <Link
              key={customer.id}
              href={`/customers/${customer.jobber_client_id ?? customer.id}`}
              className="flex items-center justify-between gap-3 text-sm text-[#174734] hover:underline"
            >
              <span className="truncate font-semibold">
                {customerName(customer)}
              </span>
              <span className="shrink-0 text-[#6b705c]">
                {formatDate(customer.reactivation_next_follow_up_at)}
              </span>
            </Link>
          ))
        )}

        {customers.length > 5 && (
          <p className="text-xs text-[#6b705c]">
            + {customers.length - 5} more
          </p>
        )}
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
