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

type PaymentMethodRow = {
  jobber_client_id: string;
  stripe_payment_method_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  autopay_enabled: boolean;
  enrollment_token: string | null;
  created_at: string | null;
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

            <span style={{ color: "#64748b", fontSize: "13px" }}>
              {cardLabel(row.cardBrand, row.cardLast4)} since{" "}
              {formatDate(row.createdAt)}
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
      "jobber_client_id, stripe_payment_method_id, card_brand, card_last4, autopay_enabled, enrollment_token, created_at"
    );

  const paymentRows = (rows as PaymentMethodRow[] | null) ?? [];
  const clientIds = paymentRows.map((r) => r.jobber_client_id);

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
  });

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
      </div>
    </main>
  );
}
