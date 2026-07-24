// Campaign ROI: matches leads to Jobber customers by normalized phone/email
// (same logic as the Leads page and customer attribution), then sums
// invoice revenue for each matched customer that was issued on/after the
// date they first showed up as a lead on that campaign. Revenue from before
// that touchpoint doesn't count, so an existing customer scanning a code
// doesn't inflate the campaign's apparent return.
//
// Everything is computed in one pass over the whole leads/customers/invoices
// tables rather than per-campaign queries — at this data volume that's both
// simpler and faster than N+1 lookups.

import { supabaseServer } from "@/lib/supabase-server";
import { normalizeEmail, normalizePhone } from "@/lib/matching";

export type MatchedCustomer = {
  jobberClientId: string;
  fullName: string | null;
  firstTouch: string;
  revenue: number;
};

export type CampaignRoi = {
  campaignId: string;
  totalLeads: number;
  spend: number;
  revenue: number;
  roiPercent: number | null;
  revenuePerLead: number | null;
  matchedCustomers: MatchedCustomer[];
};

type CampaignRow = {
  id: string;
  spend: number | string | null;
};

type LeadRow = {
  email: string | null;
  phone: string | null;
  campaign_id: string | null;
  created_at: string;
};

type CustomerRow = {
  jobber_client_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

type InvoiceRow = {
  jobber_client_id: string | null;
  issue_date: string | null;
  invoice_total: number | string | null;
};

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Truncates to a UTC calendar day so an invoice issued the same day as the
// lead touch still counts as "after" it, regardless of whether either value
// is a bare date or a full timestamp.
function dayNumber(value: string): number {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export async function getAllCampaignRoi(): Promise<Map<string, CampaignRoi>> {
  const [
    { data: campaignsData },
    { data: leadsData },
    { data: customersData },
    { data: invoicesData },
  ] = await Promise.all([
    supabaseServer.from("campaigns").select("id, spend"),
    supabaseServer
      .from("leads")
      .select("email, phone, campaign_id, created_at")
      .not("campaign_id", "is", null),
    supabaseServer
      .from("customers")
      .select("jobber_client_id, full_name, email, phone"),
    supabaseServer
      .from("jobber_invoices")
      .select("jobber_client_id, issue_date, invoice_total"),
  ]);

  const campaigns = (campaignsData ?? []) as CampaignRow[];
  const leads = (leadsData ?? []) as LeadRow[];
  const customers = (customersData ?? []) as CustomerRow[];
  const invoices = (invoicesData ?? []) as InvoiceRow[];

  const customerByPhone = new Map<string, CustomerRow>();
  const customerByEmail = new Map<string, CustomerRow>();
  const customerById = new Map<string, CustomerRow>();

  for (const customer of customers) {
    const phone = normalizePhone(customer.phone);
    const email = normalizeEmail(customer.email);

    if (phone) customerByPhone.set(phone, customer);
    if (email) customerByEmail.set(email, customer);
    customerById.set(customer.jobber_client_id, customer);
  }

  function matchCustomer(lead: LeadRow): CustomerRow | null {
    const phone = normalizePhone(lead.phone);
    const email = normalizeEmail(lead.email);

    if (phone && customerByPhone.has(phone)) return customerByPhone.get(phone)!;
    if (email && customerByEmail.has(email)) return customerByEmail.get(email)!;

    return null;
  }

  const invoicesByCustomer = new Map<string, InvoiceRow[]>();

  for (const invoice of invoices) {
    if (!invoice.jobber_client_id) continue;

    const list = invoicesByCustomer.get(invoice.jobber_client_id) ?? [];
    list.push(invoice);
    invoicesByCustomer.set(invoice.jobber_client_id, list);
  }

  // campaignId -> jobberClientId -> earliest lead touch for that customer
  const touchesByCampaign = new Map<string, Map<string, string>>();
  const leadCountByCampaign = new Map<string, number>();

  for (const lead of leads) {
    if (!lead.campaign_id) continue;

    leadCountByCampaign.set(
      lead.campaign_id,
      (leadCountByCampaign.get(lead.campaign_id) ?? 0) + 1
    );

    const customer = matchCustomer(lead);
    if (!customer) continue;

    let customerTouches = touchesByCampaign.get(lead.campaign_id);
    if (!customerTouches) {
      customerTouches = new Map();
      touchesByCampaign.set(lead.campaign_id, customerTouches);
    }

    const existing = customerTouches.get(customer.jobber_client_id);
    if (!existing || lead.created_at < existing) {
      customerTouches.set(customer.jobber_client_id, lead.created_at);
    }
  }

  const result = new Map<string, CampaignRoi>();

  for (const campaign of campaigns) {
    const spend = toNumber(campaign.spend);
    const totalLeads = leadCountByCampaign.get(campaign.id) ?? 0;
    const customerTouches = touchesByCampaign.get(campaign.id);

    const matchedCustomers: MatchedCustomer[] = [];
    let revenue = 0;

    if (customerTouches) {
      for (const [jobberClientId, firstTouch] of customerTouches) {
        const customerInvoices = invoicesByCustomer.get(jobberClientId) ?? [];
        const firstTouchDay = dayNumber(firstTouch);

        let customerRevenue = 0;
        for (const invoice of customerInvoices) {
          if (!invoice.issue_date) continue;
          if (dayNumber(invoice.issue_date) < firstTouchDay) continue;

          customerRevenue += toNumber(invoice.invoice_total);
        }

        revenue += customerRevenue;

        const customer = customerById.get(jobberClientId) ?? null;

        matchedCustomers.push({
          jobberClientId,
          fullName: customer?.full_name ?? null,
          firstTouch,
          revenue: customerRevenue,
        });
      }
    }

    matchedCustomers.sort((a, b) => b.revenue - a.revenue);

    result.set(campaign.id, {
      campaignId: campaign.id,
      totalLeads,
      spend,
      revenue,
      roiPercent: spend > 0 ? ((revenue - spend) / spend) * 100 : null,
      revenuePerLead: totalLeads > 0 ? revenue / totalLeads : null,
      matchedCustomers,
    });
  }

  return result;
}

export async function getCampaignRoi(
  campaignId: string
): Promise<CampaignRoi | null> {
  const all = await getAllCampaignRoi();
  return all.get(campaignId) ?? null;
}
