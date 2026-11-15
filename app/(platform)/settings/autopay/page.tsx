export const dynamic = "force-dynamic";
export const revalidate = 0;

// Settings page listing every customer's autopay/card-on-file status --
// previously only answerable via the admin-gated debug route
// app/api/jobs/debug-autopay-status/route.ts (Ryan, 2026-09-27: "Has
// anyone set up auto pay yet in our system?"), which stayed raw JSON
// behind a URL you had to remember. Same three-bucket logic, now a real
// page. Mirrors settings/bank-feed/page.tsx's shell/inline-style
// convention (direct sibling within Settings).
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import {
  DEFAULT_AUTOPAY_SCHEDULE,
  describeAutopaySchedule,
  isAutopayTiming,
} from "@/lib/autopayTiming";

type PaymentMethodRow = {
  jobber_client_id: string;
  stripe_payment_method_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  autopay_enabled: boolean;
  enrollment_token: string | null;
  created_at: string | null;
  autopay_timing: string | null;
  autopay_day_of_month: number | null;
  autopay_delay_days: number | null;
};

type CustomerRow = {
  jobber_client_id: string;
  first_name: string | null;
  last_name: string | null;
};

type DisplayRow = {
  jobberClientId: string;
  name: string;
  cardBrand: string | null;
  cardLast4: string | null;
  createdAt: string | null;
  // "charged on the 1st of each month" etc. (migration 105). null for
  // rows where it isn't meaningful (no card, or a customer who has no
  // enrollment row at all).
  scheduleLabel: string | null;
};

function formatDate(value: string | null): string {
  if (!value) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function cardLabel(brand: string | null, last4: string | null): string {
  if (!brand && !last4) {
    return "No card on file";
  }

  const brandLabel = brand ? brand[0].toUpperCase() + brand.slice(1) : "Card";

  return last4 ? `${brandLabel} ending in ${last4}` : brandLabel;
}

function AutopaySection({
  title,
  description,
  pillBackground,
  pillColor,
  rows,
}: {
  title: string;
  description: string;
  pillBackground: string;
  pillColor: string;
  rows: DisplayRow[];
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "16px",
        padding: "24px",
        marginBottom: "24px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "4px",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "18px", color: "#0f172a" }}>
          {title}
        </h2>

        <span
          style={{
            padding: "4px 10px",
            borderRadius: "999px",
            background: pillBackground,
            color: pillColor,
            fontSize: "12px",
            fontWeight: 700,
          }}
        >
          {rows.length}
        </span>
      </div>

      <p style={{ margin: "0 0 8px", color: "#64748b", fontSize: "13px" }}>
        {description}
      </p>

      {rows.length === 0 ? (
        <p style={{ margin: 0, color: "#94a3b8", fontSize: "14px" }}>
          No customers in this group.
        </p>
      ) : (
        rows.map((row) => (
          <div
            key={row.jobberClientId}
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              padding: "12px 0",
              borderTop: "1px solid #f1f5f9",
            }}
          >
            <Link
              href={`/customers/${encodeURIComponent(row.jobberClientId)}`}
              style={{
                color: "#174734",
                fontWeight: 600,
                fontSize: "14px",
                textDecoration: "none",
              }}
            >
              {row.name}
            </Link>

            <span style={{ color: "#64748b", fontSize: "13px", textAlign: "right" }}>
              {row.createdAt
                ? `${cardLabel(row.cardBrand, row.cardLast4)} since ${formatDate(row.createdAt)}`
                : cardLabel(row.cardBrand, row.cardLast4)}
              {row.scheduleLabel ? (
                <>
                  <br />
                  Charged {row.scheduleLabel}
                </>
              ) : null}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

export default async function AutopaySettingsPage() {
  const { data: rows } = await supabaseServer
    .from("customer_payment_methods")
    .select(
      "jobber_client_id, stripe_payment_method_id, card_brand, card_last4, autopay_enabled, enrollment_token, created_at, autopay_timing, autopay_day_of_month, autopay_delay_days"
    );

  const paymentRows = (rows as PaymentMethodRow[] | null) ?? [];

  // Everyone with an active recurring job (same definition the visit
  // generator uses), so the page can also answer "who ISN'T on autopay
  // yet" -- the people worth sending the enrollment link to.
  const { data: recurringJobRows } = await supabaseServer
    .from("jobber_jobs")
    .select("jobber_client_id")
    .eq("source", "native")
    .not("job_status", "in", "(archived,completed)")
    .not("recurrence_frequency", "is", null)
    .not("jobber_client_id", "is", null);

  const recurringClientIds = Array.from(
    new Set((recurringJobRows ?? []).map((r) => r.jobber_client_id as string))
  );

  const clientIds = Array.from(
    new Set([...paymentRows.map((r) => r.jobber_client_id), ...recurringClientIds])
  );

  const { data: customerRows } = clientIds.length
    ? await supabaseServer
        .from("customers")
        .select("jobber_client_id, first_name, last_name")
        .in("jobber_client_id", clientIds)
    : { data: [] as CustomerRow[] };

  const nameByClientId = new Map(
    ((customerRows as CustomerRow[] | null) ?? []).map((c) => [
      c.jobber_client_id,
      `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "(unnamed customer)",
    ])
  );

  const toDisplayRow = (r: PaymentMethodRow): DisplayRow => ({
    jobberClientId: r.jobber_client_id,
    name: nameByClientId.get(r.jobber_client_id) ?? "(unknown customer)",
    cardBrand: r.card_brand,
    cardLast4: r.card_last4,
    createdAt: r.created_at,
    scheduleLabel: r.stripe_payment_method_id
      ? describeAutopaySchedule(
          isAutopayTiming(r.autopay_timing)
            ? {
                timing: r.autopay_timing,
                dayOfMonth: r.autopay_day_of_month,
                delayDays: r.autopay_delay_days,
              }
            : DEFAULT_AUTOPAY_SCHEDULE
        )
      : null,
  });

  const onAutopayIds = new Set(
    paymentRows
      .filter((r) => r.stripe_payment_method_id && r.autopay_enabled)
      .map((r) => r.jobber_client_id)
  );

  const paymentRowByClientId = new Map(paymentRows.map((r) => [r.jobber_client_id, r]));

  const recurringNotOnAutopay: DisplayRow[] = recurringClientIds
    .filter((id) => !onAutopayIds.has(id))
    .map((id) => {
      const existing = paymentRowByClientId.get(id);

      // Someone here can still have a card saved with autopay switched
      // off -- show that card rather than "No card on file".
      return existing?.stripe_payment_method_id
        ? { ...toDisplayRow(existing), scheduleLabel: null }
        : {
            jobberClientId: id,
            name: nameByClientId.get(id) ?? "(unknown customer)",
            cardBrand: null,
            cardLast4: null,
            createdAt: null,
            scheduleLabel: null,
          };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const autopayOn = paymentRows
    .filter((r) => r.stripe_payment_method_id && r.autopay_enabled)
    .map(toDisplayRow)
    .sort((a, b) => a.name.localeCompare(b.name));

  const cardOnFileAutopayOff = paymentRows
    .filter((r) => r.stripe_payment_method_id && !r.autopay_enabled)
    .map(toDisplayRow)
    .sort((a, b) => a.name.localeCompare(b.name));

  const enrollmentStartedNotCompleted = paymentRows
    .filter((r) => !r.stripe_payment_method_id && r.enrollment_token)
    .map(toDisplayRow)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main
      className="px-4 py-6 sm:p-8"
      style={{ minHeight: "100vh", background: "#f8fafc" }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div style={{ marginBottom: "24px" }}>
          <Link
            href="/settings"
            style={{
              color: "#64748b",
              fontSize: "13px",
              textDecoration: "none",
            }}
          >
            ← Settings
          </Link>

          <h1
            style={{
              margin: "8px 0 8px",
              fontSize: "32px",
              color: "#0f172a",
            }}
          >
            Autopay
          </h1>

          <p style={{ margin: 0, color: "#64748b", fontSize: "16px" }}>
            Every customer who has started, finished, or turned off native
            autopay enrollment through this app. Doesn&apos;t include
            anything set up on the Jobber side.
          </p>
        </div>

        <AutopaySection
          title="Autopay On"
          description="Card on file, autopay actually enabled -- invoices for these customers get charged automatically."
          pillBackground="#dcfce7"
          pillColor="#166534"
          rows={autopayOn}
        />

        <AutopaySection
          title="Card on File, Autopay Off"
          description="Saved a card at some point but autopay is currently toggled off -- they still pay manually."
          pillBackground="#fef9c3"
          pillColor="#854d0e"
          rows={cardOnFileAutopayOff}
        />

        <AutopaySection
          title="Enrollment Started, Not Finished"
          description="Sent an autopay link but never completed the Stripe card-save step."
          pillBackground="#f3f4f6"
          pillColor="#4b5563"
          rows={enrollmentStartedNotCompleted}
        />

        <AutopaySection
          title="Recurring Customers Not on Autopay"
          description="Have an active recurring service but aren't being charged automatically. Open a customer to get their autopay link."
          pillBackground="#e0f2fe"
          pillColor="#075985"
          rows={recurringNotOnAutopay}
        />
      </div>
    </main>
  );
}
