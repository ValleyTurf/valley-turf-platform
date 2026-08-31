export const dynamic = "force-dynamic";
export const revalidate = 0;

// Stage 7 (the real /invoices cutover from Jobber to native): Ryan's
// explicit rollout rule is "push everyone with no card on file in
// Jobber to native invoicing now; everyone with a card on file stays on
// Jobber invoicing for now." This page is the reviewable list he asked
// for before that rule drives anything live -- run the backfill
// (/api/jobber/backfill-invoicing-mode), then use this page to spot-check
// or override individual customers. Manual overrides (via ModeToggle)
// are protected from ever being overwritten by a re-run of the backfill.
//
// Deliberately just a list + toggle right now -- nothing here changes
// how invoices actually get created yet. That's a separate, later step
// once this list has been reviewed.
import Link from "next/link";
import { listInvoicingModeRows } from "@/lib/invoicingMode";
import ModeToggle from "./ModeToggle";

function sourceLabel(source: string | null): { text: string; color: string; bg: string } {
  switch (source) {
    case "auto_has_card":
      return { text: "Auto — has card in Jobber", color: "#93650a", bg: "#fdeecb" };
    case "auto_no_card":
      return { text: "Auto — no card in Jobber", color: "#2f7d3f", bg: "#e6f2e6" };
    case "manual":
      return { text: "Manual override", color: "#2255a3", bg: "#e5eefb" };
    default:
      return { text: "Not yet checked", color: "#7c8a80", bg: "#f2f4f1" };
  }
}

export default async function InvoicingRoutingPage() {
  const rows = await listInvoicingModeRows();

  const checked = rows.filter((r) => r.invoicing_mode_source !== null);
  const nativeCount = checked.filter((r) => r.native_invoicing_enabled).length;
  const jobberCount = checked.filter((r) => !r.native_invoicing_enabled).length;
  const uncheckedCount = rows.length - checked.length;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px 60px" }}>
      <div style={{ marginBottom: 4 }}>
        <Link href="/invoices" style={{ fontSize: 13, color: "#2f8f5b", textDecoration: "none" }}>
          &larr; Invoices
        </Link>
      </div>
      <h1 style={{ fontSize: 22, margin: "4px 0 4px", color: "#174734" }}>
        Invoicing routing (Stage 7)
      </h1>
      <p style={{ fontSize: 13.5, color: "#56655c", margin: "0 0 20px", lineHeight: 1.5, maxWidth: 640 }}>
        Which customers create invoices natively in this app vs. still through Jobber. Nothing on
        this page changes behavior yet &mdash; it's just the reviewable list before that switch
        gets wired in. Run the backfill at{" "}
        <code style={{ background: "#f2f4f1", padding: "1px 5px", borderRadius: 4 }}>
          /api/jobber/backfill-invoicing-mode
        </code>{" "}
        to auto-check anyone not yet evaluated.
      </p>

      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <SummaryPill label="Native invoicing" value={nativeCount} color="#174734" />
        <SummaryPill label="Stay on Jobber" value={jobberCount} color="#93650a" />
        <SummaryPill label="Not yet checked" value={uncheckedCount} color="#7c8a80" />
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e6e0", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: "#f6f7f4", textAlign: "left" }}>
              <th style={{ padding: "10px 14px" }}>Customer</th>
              <th style={{ padding: "10px 14px" }}>Source</th>
              <th style={{ padding: "10px 14px", textAlign: "right" }}>Mode</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const source = sourceLabel(row.invoicing_mode_source);
              return (
                <tr key={row.jobber_client_id} style={{ borderTop: "1px solid #eef0ec" }}>
                  <td style={{ padding: "10px 14px" }}>
                    <Link
                      href={`/customers/${encodeURIComponent(row.jobber_client_id)}`}
                      style={{ color: "#174734", fontWeight: 600, textDecoration: "none" }}
                    >
                      {row.full_name ?? row.jobber_client_id}
                    </Link>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 20,
                        background: source.bg,
                        color: source.color,
                      }}
                    >
                      {source.text}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    <ModeToggle
                      jobberClientId={row.jobber_client_id}
                      customerName={row.full_name}
                      nativeEnabled={row.native_invoicing_enabled}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p style={{ fontSize: 13.5, color: "#56655c", marginTop: 16 }}>No customers found.</p>
      )}
    </div>
  );
}

function SummaryPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e6e0",
        borderRadius: 10,
        padding: "10px 16px",
        minWidth: 140,
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: "#56655c" }}>{label}</div>
    </div>
  );
}
