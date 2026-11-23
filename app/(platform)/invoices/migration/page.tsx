export const dynamic = "force-dynamic";
export const revalidate = 0;

// Moves customers from paying through Jobber to paying natively. Each
// customer saves a card through a secure link; once they do, they switch to
// native invoicing and autopay automatically.
import Link from "next/link";
import { listMigrationRows } from "@/lib/nativeMigration";
import {
  ACTIVE_WINDOW_DAYS,
  daysSince,
  fetchLastInvoiceDateByClient,
  fetchRecurringClientIds,
} from "@/lib/activeCustomers";
import { inviteWindowOpen, MAX_INVITES_PER_BATCH } from "@/lib/nativeMigrationLogic";
import MigrationTable from "./MigrationTable";

type View = "jobber_card" | "all_active" | "ready" | "invited" | "switched";

const VIEWS: { value: View; label: string }[] = [
  { value: "jobber_card", label: "Card in Jobber" },
  { value: "all_active", label: "All active, still on Jobber" },
  { value: "invited", label: "Invited" },
  { value: "ready", label: "Card saved, ready" },
  { value: "switched", label: "Switched" },
];

function isView(value: string | undefined): value is View {
  return VIEWS.some((view) => view.value === value);
}

export default async function NativeMigrationPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view: View = isView(params.view) ? params.view : "jobber_card";

  const [rows, recurringIds, lastInvoiceByClient] = await Promise.all([
    listMigrationRows(),
    fetchRecurringClientIds(),
    fetchLastInvoiceDateByClient(),
  ]);

  const activeRows = rows.filter((row) => {
    if (recurringIds.has(row.jobberClientId)) return true;
    const last = lastInvoiceByClient.get(row.jobberClientId);
    return last !== undefined && daysSince(last) <= ACTIVE_WINDOW_DAYS;
  });

  const counts = {
    notInvited: activeRows.filter((r) => r.stage === "not_invited").length,
    invited: activeRows.filter((r) => r.stage === "invited").length,
    ready: activeRows.filter((r) => r.stage === "card_saved").length,
    switched: activeRows.filter((r) => r.stage === "switched").length,
  };

  const visible = activeRows.filter((row) => {
    switch (view) {
      case "jobber_card":
        return row.stage !== "switched" && row.cardInJobber;
      case "all_active":
        return row.stage !== "switched";
      case "invited":
        return row.stage === "invited";
      case "ready":
        return row.stage === "card_saved";
      case "switched":
        return row.stage === "switched";
    }
  });

  const windowOpen = inviteWindowOpen(new Date());

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/invoices" className="text-sm font-semibold text-[#7a5f12]">
          &larr; Invoices
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Move customers to native payments</h1>
        <p className="mt-1 max-w-2xl text-sm text-[#6b705c]">
          Text customers a secure link to save a card. The moment they do, they switch to native
          invoicing and autopay, so their next invoice is created and charged here instead of in
          Jobber. Showing customers who are on a recurring service or were invoiced in the last{" "}
          {Math.round(ACTIVE_WINDOW_DAYS / 30)} months.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Not invited" value={counts.notInvited} />
          <Stat label="Invited" value={counts.invited} />
          <Stat label="Card saved, ready" value={counts.ready} tone="good" />
          <Stat label="Switched to native" value={counts.switched} tone="good" />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {VIEWS.map((option) => (
            <Link
              key={option.value}
              href={`/invoices/migration?view=${option.value}`}
              className={`rounded-full border border-[#174734] px-3.5 py-1.5 text-sm font-bold ${
                view === option.value ? "bg-[#174734] text-white" : "bg-white text-[#174734]"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Before you switch someone, in Jobber:</p>
          <p className="mt-1">
            Once a customer is native, turn off their automatic payments and close or pause any
            recurring job billing for them in Jobber. Otherwise Jobber can still create and charge
            its own invoice, and they would be billed twice. Customers who pay a month ahead (on the
            1st, 10th or 15th) also need their autopay day set on their customer page after they
            switch.
          </p>
        </div>

        {!windowOpen && (
          <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm font-semibold text-slate-700">
            Invites can only be sent between 9am and 6pm Phoenix time, so the send button is off
            right now.
          </p>
        )}

        <MigrationTable
          rows={visible}
          view={view}
          windowOpen={windowOpen}
          maxPerBatch={MAX_INVITES_PER_BATCH}
        />
      </div>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow">
      <p className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone === "good" ? "text-green-700" : ""}`}>{value}</p>
    </div>
  );
}
