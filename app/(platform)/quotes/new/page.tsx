export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import NewQuoteForm from "./NewQuoteForm";
import type { PickerCustomer, PickerLead } from "../QuoteRecipientPicker";

type CustomerRow = {
  jobber_client_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  address_line_1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
};

type LeadRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

function customerDisplayName(row: CustomerRow): string {
  return (
    row.full_name ||
    [row.first_name, row.last_name].filter(Boolean).join(" ") ||
    row.company_name ||
    "Unnamed Customer"
  );
}

function customerAddress(row: CustomerRow): string | null {
  const parts = [
    row.address_line_1,
    [row.city, row.state].filter(Boolean).join(", "),
    row.postal_code,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : null;
}

function leadDisplayName(row: LeadRow): string {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
  return name || row.email || row.phone || "Unnamed Lead";
}

function defaultExpiresAt(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

export default async function NewQuotePage() {
  const [customersResult, leadsResult] = await Promise.all([
    supabaseServer
      .from("customers")
      .select(
        "jobber_client_id, full_name, first_name, last_name, company_name, email, phone, address_line_1, city, state, postal_code"
      )
      .order("full_name", { ascending: true })
      .limit(2000),

    supabaseServer
      .from("leads")
      .select("id, first_name, last_name, email, phone")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const customers: PickerCustomer[] = ((customersResult.data ??
    []) as CustomerRow[]).map((row) => ({
    id: row.jobber_client_id,
    name: customerDisplayName(row),
    email: row.email,
    phone: row.phone,
    address: customerAddress(row),
  }));

  const leads: PickerLead[] = ((leadsResult.data ?? []) as LeadRow[]).map(
    (row) => ({
      id: row.id,
      name: leadDisplayName(row),
      email: row.email,
      phone: row.phone,
    })
  );

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">New Quote</h1>
            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Pick an existing customer or lead, or fill in new contact
              details, then set the price and description. You&apos;ll get a
              shareable link to send once it&apos;s created.
            </p>
          </div>

          <Link
            href="/quotes"
            className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
          >
            Back to Quotes
          </Link>
        </header>

        {(customersResult.error || leadsResult.error) && (
          <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800 shadow-sm">
            <p className="font-bold">
              Couldn&apos;t load {customersResult.error ? "customers" : ""}
              {customersResult.error && leadsResult.error ? " or " : ""}
              {leadsResult.error ? "leads" : ""} for the picker
            </p>
            <p className="mt-1 text-sm">
              You can still create a quote using the New / Other fields
              below.
            </p>
          </section>
        )}

        <section className="mt-6 rounded-2xl bg-white p-5 shadow sm:p-8">
          <NewQuoteForm
            customers={customers}
            leads={leads}
            defaultExpiresAt={defaultExpiresAt()}
          />
        </section>
      </div>
    </main>
  );
}
