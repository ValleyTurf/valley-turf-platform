import "server-only";

import { supabaseServer } from "@/lib/supabase-server";
import { escapeSearchValue } from "@/lib/searchUtils";
import { getFinancialMetrics } from "@/lib/financial/metrics";
import { getJobCostingSummary } from "@/lib/jobCostingSummary";
import { getReactivationPipelineSummary } from "@/lib/reactivationSummary";
import { getActiveCrewSnapshot } from "@/lib/crewStatusSummary";
import { getOutstandingInvoicesSummary } from "@/lib/outstandingInvoicesSummary";

// The curated, read-only tool set for the AI Copilot (Tier 1). Every
// function here just wraps a query or helper that already exists and
// already backs a real page in this app -- the point of the Copilot is
// to answer questions using the same numbers staff would see if they
// clicked through to /revenue, /job-costing-analytics, /reactivation,
// /crew-status, etc, not to compute anything new. Deliberately read-only:
// nothing in this file writes to the database, so there's no
// confirm-before-execute story to design for v1.
//
// Each tool's `definition` is passed straight to Anthropic's
// `messages.create({ tools })` call in app/api/copilot/chat/route.ts;
// `run` is what actually executes when the model requests that tool.
// Keeping definition + implementation side by side in one map (rather
// than two parallel arrays that have to be kept in sync by hand) is the
// same instinct as lib/permissionRules.ts's SECTION_PREFIXES -- one
// source of truth per tool.

export type CopilotToolDefinition = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type CopilotTool = {
  definition: CopilotToolDefinition;
  run: (input: Record<string, unknown>) => Promise<unknown>;
};

// ---------------------------------------------------------------------
// Shared timeframe resolution -- mirrors the preset options on
// /job-costing-analytics (same labels: this-month, last-month, last-90-
// days, ytd, all-time) so "what's our margin this month" from the
// Copilot and clicking "This Month" on the analytics page mean the same
// date range. Deliberately a small local copy rather than importing
// getDateRange from that page -- that function also carries custom-
// range/URL-param concerns the Copilot doesn't have, and page.tsx isn't
// something lib files should import from anyway.
// ---------------------------------------------------------------------

export type CopilotTimeframe =
  | "this-month"
  | "last-month"
  | "last-7-days"
  | "last-90-days"
  | "ytd"
  | "all-time";

function getPhoenixToday(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = Number(parts.find((p) => p.type === "year")?.value ?? 0);
  const month = Number(parts.find((p) => p.type === "month")?.value ?? 1);
  const day = Number(parts.find((p) => p.type === "day")?.value ?? 1);

  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function resolveTimeframe(timeframe: CopilotTimeframe): {
  startDate: string | null;
  endDate: string;
} {
  const today = getPhoenixToday();
  let start: Date | null = new Date(today);
  const end = new Date(today);

  if (timeframe === "last-7-days") {
    start.setUTCDate(start.getUTCDate() - 6);
  } else if (timeframe === "last-month") {
    start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    end.setTime(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  } else if (timeframe === "this-month") {
    start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  } else if (timeframe === "last-90-days") {
    start.setUTCDate(start.getUTCDate() - 89);
  } else if (timeframe === "ytd") {
    start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  } else if (timeframe === "all-time") {
    start = null;
  }

  return {
    startDate: start ? formatDateInput(start) : null,
    endDate: formatDateInput(end),
  };
}

function isCopilotTimeframe(value: unknown): value is CopilotTimeframe {
  return (
    typeof value === "string" &&
    [
      "this-month",
      "last-month",
      "last-7-days",
      "last-90-days",
      "ytd",
      "all-time",
    ].includes(value)
  );
}

// ---------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------

const revenueSummaryTool: CopilotTool = {
  definition: {
    name: "get_revenue_summary",
    description:
      "Get overall revenue and collections numbers: total revenue, revenue this month, revenue this year, total collected, outstanding receivables, average invoice/payment size, and counts of paid vs outstanding invoices. Use this for any question about how much money the business has made or is owed, without a specific service-category breakdown.",
    input_schema: { type: "object", properties: {} },
  },
  run: async () => getFinancialMetrics(),
};

const jobCostingSummaryTool: CopilotTool = {
  definition: {
    name: "get_job_costing_summary",
    description:
      "Get profitability broken down by service category (revenue, direct cost, overhead, estimated profit, margin %) for a given timeframe. Use this for any question about margin, profitability, or which service category makes/loses the most money.",
    input_schema: {
      type: "object",
      properties: {
        timeframe: {
          type: "string",
          enum: [
            "this-month",
            "last-month",
            "last-7-days",
            "last-90-days",
            "ytd",
            "all-time",
          ],
          description:
            "Which date range to compute margins for. Default to 'this-month' if the user doesn't specify a period.",
        },
      },
      required: ["timeframe"],
    },
  },
  run: async (input) => {
    const timeframe = isCopilotTimeframe(input.timeframe)
      ? input.timeframe
      : "this-month";
    const { startDate, endDate } = resolveTimeframe(timeframe);
    const summary = await getJobCostingSummary(startDate, endDate);

    return {
      timeframe,
      startDate,
      endDate,
      totals: summary.totals,
      overallMarginPct: summary.overallMargin,
      byCategory: summary.categories.map((c) => ({
        category: c.service_category,
        invoiceCount: c.invoice_count,
        revenue: c.total_revenue,
        directCost: c.total_direct_cost,
        overhead: c.total_overhead_allocated,
        profit: c.total_estimated_profit,
        marginPct: c.profit_margin_pct,
      })),
    };
  },
};

const reactivationSummaryTool: CopilotTool = {
  definition: {
    name: "get_reactivation_summary",
    description:
      "Get the Customer Reactivation pipeline's headline numbers: how many candidates, how many contacted, how many follow-ups due, how many have Cleaning Scheduled, and the data-confirmed win-back rate (contacted customers who actually got billed again since, not just self-reported as scheduled). Use this for any question about win-back customers, churned customers coming back, or the reactivation pipeline.",
    input_schema: { type: "object", properties: {} },
  },
  run: async () => getReactivationPipelineSummary(),
};

const outstandingInvoicesSummaryTool: CopilotTool = {
  definition: {
    name: "get_outstanding_invoices_summary",
    description:
      "Get the total dollar amount and count of currently unpaid/outstanding invoices. Use this for questions about overdue or unpaid invoices, accounts receivable, or who owes money.",
    input_schema: { type: "object", properties: {} },
  },
  run: async () => getOutstandingInvoicesSummary(),
};

const crewStatusSummaryTool: CopilotTool = {
  definition: {
    name: "get_crew_status_summary",
    description:
      "Get who is currently clocked in and working right now, which job/visit they're on, and since when. Use this for any question about who's working, who's on the clock, or what's happening in the field right now.",
    input_schema: { type: "object", properties: {} },
  },
  run: async () => getActiveCrewSnapshot(),
};

type CustomerSearchRow = {
  jobber_client_id: string | null;
  full_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
};

const searchCustomersTool: CopilotTool = {
  definition: {
    name: "search_customers",
    description:
      "Search for customers by name, email, or phone. Returns a short list of matches with their jobberClientId, which is needed to call get_customer_summary for financial/reactivation detail on a specific customer. Use this whenever a question names or refers to a specific customer.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Name, email, or phone number (or partial) to search for.",
        },
      },
      required: ["query"],
    },
  },
  run: async (input) => {
    const query = typeof input.query === "string" ? input.query.trim() : "";
    if (query.length < 2) {
      return { results: [], note: "Query too short -- ask the user for more detail." };
    }

    const safeQuery = escapeSearchValue(query);

    const { data, error } = await supabaseServer
      .from("customers")
      .select("jobber_client_id, full_name, company_name, email, phone, city, state")
      .not("jobber_client_id", "is", null)
      .or(
        [
          `full_name.ilike.%${safeQuery}%`,
          `first_name.ilike.%${safeQuery}%`,
          `last_name.ilike.%${safeQuery}%`,
          `company_name.ilike.%${safeQuery}%`,
          `email.ilike.%${safeQuery}%`,
          `phone.ilike.%${safeQuery}%`,
        ].join(",")
      )
      .order("full_name", { ascending: true })
      .limit(8);

    if (error) throw new Error(`Customer search failed: ${error.message}`);

    const results = ((data ?? []) as CustomerSearchRow[])
      .filter((row): row is CustomerSearchRow & { jobber_client_id: string } =>
        Boolean(row.jobber_client_id)
      )
      .map((row) => ({
        jobberClientId: row.jobber_client_id,
        name: row.full_name || row.company_name || "Unnamed Customer",
        email: row.email,
        phone: row.phone,
        location: [row.city, row.state].filter(Boolean).join(", ") || null,
      }));

    return { results };
  },
};

const customerSummaryTool: CopilotTool = {
  definition: {
    name: "get_customer_summary",
    description:
      "Get financial and reactivation detail for one specific customer: lifetime invoice count and revenue, most recent invoice date, and their current reactivation status/last-contacted date if applicable. Call search_customers first to get the jobberClientId if you don't already have one.",
    input_schema: {
      type: "object",
      properties: {
        jobberClientId: {
          type: "string",
          description: "The customer's jobberClientId, from search_customers.",
        },
      },
      required: ["jobberClientId"],
    },
  },
  run: async (input) => {
    const jobberClientId =
      typeof input.jobberClientId === "string" ? input.jobberClientId : "";
    if (!jobberClientId) {
      throw new Error("jobberClientId is required.");
    }

    const [{ data: customerData, error: customerError }, { data: invoiceData, error: invoiceError }] =
      await Promise.all([
        supabaseServer
          .from("customers")
          .select(
            "full_name, company_name, reactivation_status, reactivation_last_contacted_at"
          )
          .eq("jobber_client_id", jobberClientId)
          .maybeSingle(),
        supabaseServer
          .from("invoice_financials")
          .select("issue_date, invoice_total")
          .eq("jobber_client_id", jobberClientId),
      ]);

    if (customerError) {
      throw new Error(`Could not load customer: ${customerError.message}`);
    }
    if (invoiceError) {
      throw new Error(`Could not load customer invoices: ${invoiceError.message}`);
    }

    const invoices = (invoiceData ?? []) as {
      issue_date: string | null;
      invoice_total: number | string | null;
    }[];

    const lifetimeRevenue = invoices.reduce(
      (sum, inv) => sum + Number(inv.invoice_total ?? 0),
      0
    );
    const lastInvoiceDate = invoices
      .map((inv) => inv.issue_date)
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1) ?? null;

    return {
      name: customerData?.full_name || customerData?.company_name || "Unknown Customer",
      invoiceCount: invoices.length,
      lifetimeRevenue,
      lastInvoiceDate,
      reactivationStatus: customerData?.reactivation_status ?? null,
      reactivationLastContactedAt: customerData?.reactivation_last_contacted_at ?? null,
    };
  },
};

export const COPILOT_TOOLS: CopilotTool[] = [
  revenueSummaryTool,
  jobCostingSummaryTool,
  reactivationSummaryTool,
  outstandingInvoicesSummaryTool,
  crewStatusSummaryTool,
  searchCustomersTool,
  customerSummaryTool,
];

export const COPILOT_TOOL_DEFINITIONS: CopilotToolDefinition[] = COPILOT_TOOLS.map(
  (tool) => tool.definition
);

const COPILOT_TOOLS_BY_NAME = new Map(
  COPILOT_TOOLS.map((tool) => [tool.definition.name, tool])
);

export async function runCopilotTool(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  const tool = COPILOT_TOOLS_BY_NAME.get(name);

  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  return tool.run(input);
}
