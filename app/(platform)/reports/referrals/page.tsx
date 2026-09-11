export const dynamic = "force-dynamic";
export const revalidate = 0;

// Internal-only referral/lead-source report (Ryan's call, 2026-09-11 --
// no customer-facing leaderboard). Reads the customers.referral_source /
// referred_by_customer_id columns added by migration
// 070_add_customer_referral_source.sql -- see lib/referralSource.ts for
// the fixed option list and app/components/ReferralSourceField.tsx for
// where these values actually get set (New Customer form + each
// customer's Property Profile). Gated via the marketing_analytics
// section (lib/permissionRules.ts) since it's the same shape of report
// as /analytics -- attribution counts, no dollar figures.
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { REFERRAL_SOURCE_OPTIONS } from "@/lib/referralSource";

type CustomerRow = {
  jobber_client_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  referral_source: string | null;
  referred_by_customer_id: string | null;
};

function displayName(row: {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
}): string {
  return (
    row.full_name ||
    [row.first_name, row.last_name].filter(Boolean).join(" ") ||
    row.company_name ||
    "Unnamed Customer"
  );
}

type Referrer = {
  id: string;
  name: string;
  referredCount: number;
  referredCustomers: { id: string; name: string }[];
};

export default async function ReferralSourcesReportPage() {
  const { data, error } = await supabaseServer
    .from("customers")
    .select(
      "jobber_client_id, full_name, first_name, last_name, company_name, referral_source, referred_by_customer_id"
    )
    .limit(5000);

  const customers = (data ?? []) as CustomerRow[];
  const byId = new Map(customers.map((c) => [c.jobber_client_id, c]));

  const sourceCounts = new Map<string, number>();
  let unsetCount = 0;

  for (const customer of customers) {
    if (!customer.referral_source) {
      unsetCount += 1;
      continue;
    }
    sourceCounts.set(
      customer.referral_source,
      (sourceCounts.get(customer.referral_source) ?? 0) + 1
    );
  }

  const referrerMap = new Map<string, Referrer>();

  for (const customer of customers) {
    if (customer.referral_source !== "referral" || !customer.referred_by_customer_id) {
      continue;
    }

    const referrer = byId.get(customer.referred_by_customer_id);
    const referrerName = referrer
      ? displayName(referrer)
      : "Former/unknown customer";

    const entry = referrerMap.get(customer.referred_by_customer_id) ?? {
      id: customer.referred_by_customer_id,
      name: referrerName,
      referredCount: 0,
      referredCustomers: [],
    };

    entry.referredCount += 1;
    entry.referredCustomers.push({
      id: customer.jobber_client_id,
      name: displayName(customer),
    });

    referrerMap.set(customer.referred_by_customer_id, entry);
  }

  const topReferrers = Array.from(referrerMap.values()).sort(
    (a, b) => b.referredCount - a.referredCount
  );

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Referral Sources
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[#6b705c]">
              Where customers say they heard about us, set on the New
              Customer form or each customer&apos;s Property Profile.
              Internal only.
            </p>
          </div>

          <Link
            href="/reports"
            className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
          >
            Back to Reports
          </Link>
        </header>

        {error && (
          <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800 shadow-sm">
            <p className="font-bold">Couldn&apos;t load customers</p>
            <p className="mt-1 text-sm">{error.message}</p>
          </section>
        )}

        <section className="mt-6 rounded-2xl bg-white p-5 shadow sm:p-8">
          <h2 className="text-lg font-bold">By Source</h2>

          <div className="mt-4 divide-y divide-[#eee9dc]">
            {REFERRAL_SOURCE_OPTIONS.map((option) => (
              <div
                key={option.value}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span>{option.label}</span>
                <span className="font-bold">
                  {sourceCounts.get(option.value) ?? 0}
                </span>
              </div>
            ))}

            <div className="flex items-center justify-between py-2 text-sm text-[#6b705c]">
              <span>Not set</span>
              <span className="font-bold">{unsetCount}</span>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow sm:p-8">
          <h2 className="text-lg font-bold">Top Referrers</h2>
          <p className="mt-1 text-xs text-[#6b705c]">
            Customers whose referrals converted into other customers.
          </p>

          {topReferrers.length === 0 ? (
            <p className="mt-4 text-sm text-[#6b705c]">
              No referrals logged yet — set &ldquo;Referred by&rdquo; on a
              customer whose source is Referral to see them here.
            </p>
          ) : (
            <div className="mt-4 divide-y divide-[#eee9dc]">
              {topReferrers.map((referrer) => (
                <div key={referrer.id} className="py-3">
                  <div className="flex items-center justify-between text-sm">
                    <Link
                      href={`/customers/${encodeURIComponent(referrer.id)}`}
                      className="font-bold hover:underline"
                    >
                      {referrer.name}
                    </Link>
                    <span className="font-bold text-[#9c7a20]">
                      {referrer.referredCount}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-[#6b705c]">
                    {referrer.referredCustomers.map((c, i) => (
                      <span key={c.id}>
                        {i > 0 && ", "}
                        <Link
                          href={`/customers/${encodeURIComponent(c.id)}`}
                          className="hover:underline"
                        >
                          {c.name}
                        </Link>
                      </span>
                    ))}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

