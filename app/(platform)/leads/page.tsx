export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabaseServer } from "@/lib/supabase-server";
import { normalizeEmail, normalizePhone } from "@/lib/matching";
import { loadAllCustomerContacts } from "@/lib/leadCustomers";
import {
  deriveLeadStage,
  leadNeedsAttention,
  type LeadQuoteInfo,
} from "@/lib/leadPipelineLogic";
import {
  elapsedMinutes,
  firstQuoteSentAt,
  formatDuration,
  summarizeQuoteSpeed,
  type SpeedLead,
} from "@/lib/quoteSpeedLogic";
import LeadsTable, { type LeadRow } from "./LeadsTable";
import { createMissingCustomers } from "./actions";

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
  jobber_client_id: string | null;
};

type QuoteForLead = LeadQuoteInfo & {
  lead_id: string | null;
  customer_id: string | null;
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
      "id, first_name, last_name, email, phone, address, city, state, zip, source, status, campaign_id, created_at, scan_count, address_validation_status, address_formatted, jobber_client_id"
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

  // Paged load of every customer (the plain select stopped at 1000 rows,
  // so newer customers never matched) plus every quote, so each lead's
  // stage can be worked out from its quotes.
  const [customers, quotesResult] = await Promise.all([
    loadAllCustomerContacts(),
    supabaseServer
      .from("quotes")
      .select("lead_id, customer_id, status, expires_at, sent_at, created_at"),
  ]);

  const customerById = new Map<string, CustomerMatch>();
  const customerByPhone = new Map<string, CustomerMatch>();
  const customerByEmail = new Map<string, CustomerMatch>();

  for (const customer of customers) {
    customerById.set(customer.jobber_client_id, customer);

    const normalizedPhone = normalizePhone(customer.phone);
    const normalizedEmail = normalizeEmail(customer.email);

    if (normalizedPhone) {
      customerByPhone.set(normalizedPhone, customer);
    }

    if (normalizedEmail) {
      customerByEmail.set(normalizedEmail, customer);
    }
  }

  const quotesByLead = new Map<string, QuoteForLead[]>();
  const quotesByCustomer = new Map<string, QuoteForLead[]>();

  for (const quote of (quotesResult.data ?? []) as QuoteForLead[]) {
    if (quote.lead_id) {
      quotesByLead.set(quote.lead_id, [
        ...(quotesByLead.get(quote.lead_id) ?? []),
        quote,
      ]);
    }

    if (quote.customer_id) {
      quotesByCustomer.set(quote.customer_id, [
        ...(quotesByCustomer.get(quote.customer_id) ?? []),
        quote,
      ]);
    }
  }

  function matchCustomer(lead: Lead): CustomerMatch | null {
    // The link made at intake wins -- it's exact, unlike phone/email.
    if (lead.jobber_client_id && customerById.has(lead.jobber_client_id)) {
      return customerById.get(lead.jobber_client_id)!;
    }

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

  function quotesFor(lead: Lead, customer: CustomerMatch | null): QuoteForLead[] {
    const seen = new Set<QuoteForLead>();

    for (const quote of quotesByLead.get(lead.id) ?? []) seen.add(quote);

    // Quotes written straight to the customer (not via this lead) count
    // too, once the lead is linked to that customer.
    if (customer) {
      for (const quote of quotesByCustomer.get(customer.jobber_client_id) ?? []) {
        seen.add(quote);
      }
    }

    return Array.from(seen);
  }

  const totalLeads = leads.length;
  const matchedCount = leads.filter((lead) => matchCustomer(lead)).length;
  const unlinkedCount = totalLeads - matchedCount;

  const now = new Date();
  const SPEED_WINDOW_DAYS = 90;
  const speedWindowStart = now.getTime() - SPEED_WINDOW_DAYS * 86_400_000;
  const speedLeads: SpeedLead[] = [];

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
    const customerLabel = customer
      ? customer.full_name || "View Customer"
      : null;
    const rawStatus = (lead.status || "new").toLowerCase();
    const leadQuotes = quotesFor(lead, customer);
    const stage = deriveLeadStage(rawStatus, leadQuotes);

    // Quote-speed timer: how long it took (or is taking) to get a first
    // quote out. Only leads still owed a quote count as "waiting".
    const sentAt = firstQuoteSentAt(leadQuotes);
    const isWaiting =
      !sentAt &&
      (stage.key === "new" ||
        stage.key === "contacted" ||
        stage.key === "quote_drafted");
    let speed: LeadRow["speed"] = null;

    if (sentAt) {
      const minutes = elapsedMinutes(lead.created_at, sentAt);
      if (minutes !== null) {
        speed = {
          label: `Quoted in ${formatDuration(minutes)}`,
          className: minutes < 240 ? "text-green-700" : "text-[#6b705c]",
        };
      }
    } else if (isWaiting) {
      const minutes = elapsedMinutes(lead.created_at, now);
      if (minutes !== null) {
        speed = {
          label: `Waiting ${formatDuration(minutes)}`,
          className:
            minutes >= 24 * 60
              ? "font-bold text-red-700"
              : minutes >= 240
                ? "font-semibold text-amber-700"
                : "text-[#6b705c]",
        };
      }
    }

    if (new Date(lead.created_at).getTime() >= speedWindowStart) {
      speedLeads.push({
        createdAt: lead.created_at,
        firstQuoteSentAt: sentAt,
        accepted: stage.key === "won",
        waiting: isWaiting,
      });
    }

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
      status: stage.label,
      rawStatus,
      stage,
      needsAttention: leadNeedsAttention(stage),
      speed,
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
        stage.label,
        customerLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
  });

  const speedSummary = summarizeQuoteSpeed(speedLeads, now);

  return (
    <main className="min-h-screen bg-[#f5f4ef] p-4 text-[#174734] sm:p-8">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-3xl bg-gradient-to-r from-[#174734] to-[#226246] p-8 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#d4af37]">
            Valley Turf Revival
          </p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Leads</h1>
          <p className="mt-3 max-w-2xl text-green-50">
            Everyone captured from QR scans, tracked links, and intake forms, with
            where each one stands: quote sent, accepted, declined, or stuck.
          </p>
        </section>

        <section className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm">
            <p className="text-xs text-[#6b705c]">Total Leads</p>
            <p className="mt-1 text-4xl font-bold text-[#174734]">
              {totalLeads}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm">
            <p className="text-xs text-[#6b705c]">Needs Your Attention</p>
            <p className="mt-1 text-4xl font-bold text-[#9c7a20]">
              {rows.filter((row) => row.needsAttention).length}
            </p>
            <p className="mt-1 text-xs text-[#6b705c]">
              New, quote not sent, or quote expired
            </p>
          </div>

          <div className="rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm">
            <p className="text-xs text-[#6b705c]">Quotes Waiting on a Reply</p>
            <p className="mt-1 text-4xl font-bold text-indigo-800">
              {rows.filter((row) => row.stage.key === "quote_sent").length}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm">
            <p className="text-xs text-[#6b705c]">Not Linked to a Customer</p>
            <p className="mt-1 text-4xl font-bold text-[#174734]">
              {unlinkedCount}
            </p>
            {unlinkedCount > 0 && (
              <form action={createMissingCustomers} className="mt-2">
                <button
                  type="submit"
                  className="rounded-lg bg-[#174734] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#226246]"
                >
                  Add all as customers
                </button>
              </form>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-[#174734]">Quote Speed</h2>
          <p className="mt-1 text-sm text-[#6b705c]">
            How fast a new lead gets its first quote, and how often each speed
            wins the job. Last {SPEED_WINDOW_DAYS} days.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-[#f7f6f1] p-4">
              <p className="text-xs text-[#6b705c]">Typical time to quote</p>
              <p className="mt-1 text-2xl font-bold text-[#174734]">
                {speedSummary.medianMinutes !== null
                  ? formatDuration(speedSummary.medianMinutes)
                  : "—"}
              </p>
              <p className="mt-1 text-xs text-[#6b705c]">
                Median of {speedSummary.quotedCount} quoted leads
              </p>
            </div>

            <div className="rounded-xl bg-[#f7f6f1] p-4">
              <p className="text-xs text-[#6b705c]">Quoted within 1 hour</p>
              <p className="mt-1 text-2xl font-bold text-[#174734]">
                {speedSummary.within1hPercent !== null
                  ? `${speedSummary.within1hPercent}%`
                  : "—"}
              </p>
            </div>

            <div className="rounded-xl bg-[#f7f6f1] p-4">
              <p className="text-xs text-[#6b705c]">Quoted within 24 hours</p>
              <p className="mt-1 text-2xl font-bold text-[#174734]">
                {speedSummary.within24hPercent !== null
                  ? `${speedSummary.within24hPercent}%`
                  : "—"}
              </p>
            </div>

            <div className="rounded-xl bg-[#f7f6f1] p-4">
              <p className="text-xs text-[#6b705c]">Waiting for a quote now</p>
              <p
                className={`mt-1 text-2xl font-bold ${
                  speedSummary.waitingOver24h > 0
                    ? "text-red-700"
                    : "text-[#174734]"
                }`}
              >
                {speedSummary.waitingCount}
              </p>
              <p className="mt-1 text-xs text-[#6b705c]">
                {speedSummary.oldestWaitingMinutes !== null
                  ? `Oldest: ${formatDuration(speedSummary.oldestWaitingMinutes)}`
                  : "Everyone has a quote"}
              </p>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#e7e2d5] text-[#6b705c]">
                  <th className="pb-2 pr-4">Time to first quote</th>
                  <th className="pb-2 pr-4 text-right">Quotes sent</th>
                  <th className="pb-2 pr-4 text-right">Accepted</th>
                  <th className="pb-2 text-right">Close rate</th>
                </tr>
              </thead>
              <tbody>
                {speedSummary.buckets.map((bucket) => (
                  <tr key={bucket.key} className="border-b border-[#f0eee6]">
                    <td className="py-2 pr-4 font-semibold">{bucket.label}</td>
                    <td className="py-2 pr-4 text-right">{bucket.quoted}</td>
                    <td className="py-2 pr-4 text-right">{bucket.accepted}</td>
                    <td className="py-2 text-right font-bold">
                      {bucket.closeRatePercent !== null
                        ? `${bucket.closeRatePercent}%`
                        : "—"}
                      {bucket.closeRatePercent !== null && bucket.smallSample && (
                        <span className="ml-1 text-xs font-normal text-[#6b705c]">
                          (few quotes)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-[#6b705c]">
            The timer runs on the clock, nights and weekends included, from
            when the lead came in to when the first quote went out. Recent
            quotes may still be waiting on an answer, so close rates firm up
            over time.
          </p>
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
