export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import NewCustomerForm from "./NewCustomerForm";
import type {
  ReferralPickerCustomer,
  ReferralQrCampaign,
} from "@/app/components/ReferralSourceField";

type CustomerRow = {
  jobber_client_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
};

type CampaignRow = {
  id: string;
  name: string;
  alias: string | null;
};

function customerDisplayName(row: CustomerRow): string {
  return (
    row.full_name ||
    [row.first_name, row.last_name].filter(Boolean).join(" ") ||
    row.company_name ||
    "Unnamed Customer"
  );
}

export default async function NewCustomerPage() {
  // Same "who could this be?" picker list jobs/new/page.tsx already
  // builds for NewJobForm -- reused here for the Referral Source field's
  // "referred by" picker (see app/components/ReferralSourceField.tsx).
  const [{ data: customersData }, { data: campaignsData }] = await Promise.all([
    supabaseServer
      .from("customers")
      .select("jobber_client_id, full_name, first_name, last_name, company_name")
      .order("full_name", { ascending: true })
      .limit(2000),
    supabaseServer
      .from("campaigns")
      .select("id, name, alias")
      .eq("channel", "qr")
      .order("name", { ascending: true }),
  ]);

  const customers: ReferralPickerCustomer[] = ((customersData ?? []) as CustomerRow[]).map(
    (row) => ({
      id: row.jobber_client_id,
      name: customerDisplayName(row),
    })
  );

  const campaigns: ReferralQrCampaign[] = ((campaignsData ?? []) as CampaignRow[]).map(
    (row) => ({
      id: row.id,
      label: row.alias ?? row.name,
    })
  );

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-2xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Add Customer
            </h1>
            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Creates the customer directly in this app — no Jobber
              account needed, and they show up right away.
            </p>
          </div>

          <Link
            href="/customers"
            className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
          >
            Back to Customers
          </Link>
        </header>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow sm:p-8">
          <NewCustomerForm customers={customers} campaigns={campaigns} />
        </section>
      </div>
    </main>
  );
}
