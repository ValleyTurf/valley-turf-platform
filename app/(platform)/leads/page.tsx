export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabaseServer } from "@/lib/supabase-server";
import { normalizeEmail, normalizePhone } from "@/lib/matching";
import LeadsTable, { type LeadRow } from "./LeadsTable";

type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  source: string | null;
  status: string | null;
  campaign_id: string | null;
  created_at: string;
  scan_count: number | null;
  address_validation_status: string | null;
  address_formatted: string | null;
};

type Campaign = {
  id: string;
  name: string;
  alias: string | null;
  slug: string;
};

type CustomerMatch = {
  jobber_client_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

function formatArizonaTime(value: string | null) {
  if (!value) return "Unknown";

  return new Date(value).toLocaleString("en-US", {
    timeZone: "America/Phoenix",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function statusBadge(status: string | null) {
  const normalized = (status || "New").toLowerCase();

  if (normalized === "new") {
    return "bg-[#d4af37]/20 text-[#9c7a20]";
  }

  if (normalized === "converted" || normalized === "won") {
    return "bg-[#174734]/10 text-[#174734]";
  }

  if (normalized === "lost" || normalized === "dead") {
    return "bg-red-100 text-red-700";
  }

  return "bg-[#f0eee6] text-[#6b705c]";
}

// Maps lib/addressValidation.ts's AddressValidationStatus values to a
// short label + color so a dispatcher can spot an address that needs a
// follow-up call before a crew ever gets scheduled to it. Leads captured
// before GOOGLE_ADDRESS_VALIDATION_API_KEY was configured (or where
// validation failed/was skipped) have a null status and show no badge.
function addressValidationBadge(
  status: string | null
): { label: string; className: string } | null {
  if (status === "fix") {
    return { label: "Needs Fix", className: "bg-red-100 text-red-700" };
  }

  if (status === "confirm" || status === "confirm_add_subpremises") {
    return {
      label: "Please Confirm",
      className: "bg-[#d4af37]/20 text-[#9c7a20]",
    };
  }

  if (status === "accept") {
    return { label: "Verified", className: "bg-[#174734]/10 text-[#174734]" };
  }

  return null;
}

export default async function LeadsPage() {
  const { data: leadsData, error } = await supabaseServer
    .from("leads")
    .select(
      "id, first_name, last_name, email, phone, address, city, state, zip, source, status, campaign_id, created_at, scan_count, address_validation_status, address_formatted"
    )
    .order("created_at", { ascending: false });

  const leads = (leadsData ?? []) as Lead[];

  const campaignIds = Array.from(
    new Set(leads.map((lead) => lead.campaign_id).filter(Boolean))
  ) as string[];

  const campaignMap = new Map<string, Campaign>();

  if (campaignIds.length > 0) {
    const { data: campaigns } = await supabaseServer
      .from("campaigns")
      .select("id, name, alias, slug")
      .in("id", campaignIds);

    for (const campaign of (campaigns ?? []) as Campaign[]) {
      campaignMap.set(campaign.id, campaign);
    }
  }

  const { data: customersData } = await supabaseServer
    .from("customers")
    .select("jobber_client_id, full_name, email, phone");

  const customerByPhone = new Map<string, CustomerMatch>();
  const customerByEmail = new Map<string, CustomerMatch>();

  for (const customer of (customersData ?? []) as CustomerMatch[]) {
    const normalizedPhone = normalizePhone(customer.phone);
    const normalizedEmail = normalizeEmail(customer.email);

    if (normalizedPhone) {
      customerByPhone.set(normalizedPhone, customer);
    }

    if (normalizedEmail) {
      customerByEmail.set(normalizedEmail, customer);
    }
  }

  function matchCustomer(lead: Lead): CustomerMatch | null {
    const normalizedPhone = normalizePhone(lead.phone);
    const normalizedEmail = normalizeEmail(lead.email);

    if (normalizedPhone && customerByPhone.has(normalizedPhone)) {
      return customerByPhone.get(normalizedPhone)!;
    }

    if (normalizedEmail && customerByEmail.has(normalizedEmail)) {
      return customerByEmail.get(normalizedEmail)!;
    }

    return null;
  }

  const totalLeads = leads.length;
  const matchedCount = leads.filter((lead) => matchCustomer(lead)).length;

  const rows: LeadRow[] = leads.map((lead) => {
    const campaign = lead.campaign_id ? campaignMap.get(lead.campaign_id) : null;
    const customer = matchCustomer(lead);
    const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
    const displayAddress =
      lead.address_formatted ||
      [lead.address, lead.city, lead.state, lead.zip]
        .filter(Boolean)
        .join(", ") ||
      null;
    const campaignLabel = campaign ? campaign.alias || campaign.name : null;
    const status = lead.status || "New";
    const customerLabel = customer
      ? customer.full_name || "View Customer"
      : null;

    return {
      id: lead.id,
      capturedAt: formatArizonaTime(lead.created_at),
      name: name || "—",
      phone: lead.phone,
      email: lead.email,
      displayAddress,
      addressBadge: addressValidationBadge(lead.address_validation_status),
      source: lead.source,
      campaign:
        campaign && campaignLabel
          ? { slug: campaign.slug, label: campaignLabel }
          : null,
      status,
      statusClassName: statusBadge(lead.status),
      scanCount: lead.scan_count,
      customerMatch:
        customer && customerLabel
          ? { jobberClientId: customer.jobber_client_id, label: customerLabel }
          : null,
      searchText: [
        name,
        lead.phone,
        lead.email,
        displayAddress,
        lead.source,
        campaignLabel,
        status,
        customerLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
  });

  return (
    <main className="min-h-screen bg-[#f5f4ef] p-4 text-[#174734] sm:p-8">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-3xl bg-gradient-to-r from-[#174734] to-[#226246] p-8 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#d4af37]">
            Valley Turf Revival
          </p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Leads</h1>
          <p className="mt-3 max-w-2xl text-green-50">
            Everyone captured from QR scans, tracked links, and future intake
            forms, matched against your customer list.
          </p>
        </section>

        <section className="mt-8 grid gap-6 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm">
            <p className="text-xs text-[#6b705c]">Total Leads</p>
            <p className="mt-1 text-4xl font-bold text-[#174734]">
              {totalLeads}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm">
            <p className="text-xs text-[#6b705c]">Matched to a Customer</p>
            <p className="mt-1 text-4xl font-bold text-[#174734]">
              {matchedCount}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm">
            <p className="text-xs text-[#6b705c]">Not Yet Converted</p>
            <p className="mt-1 text-4xl font-bold text-[#174734]">
              {totalLeads - matchedCount}
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-[#174734]">All Leads</h2>

          {error ? (
            <p className="mt-5 text-sm text-red-600">
              Leads could not be loaded: {error.message}
            </p>
          ) : leads.length === 0 ? (
            <p className="mt-5 text-sm text-[#6b705c]">
              No leads captured yet. Turn on lead capture for a campaign on
              the QR Code Library page to start collecting them.
            </p>
          ) : (
            <LeadsTable rows={rows} />
          )}
        </section>
      </div>
    </main>
  );
}
