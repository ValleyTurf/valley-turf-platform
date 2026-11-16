// Pay-ahead autopay (ROADMAP "Top 10 (November 2026)" #4). Ryan,
// 2026-11-15: "Those that have a date they pay on will be paying for
// example December 1st for the month of December. It will always be
// paid for the month ahead, not behind."
//
// For a customer whose autopay is set to a day of the month, on that
// day this builds ONE invoice listing every recurring visit scheduled
// from that day up to the day before their next pay date, charges the
// saved card, and sends the receipt -- no person involved (Ryan chose
// automatic over approve-each-one). Two visits in the month is two
// lines on one invoice and one charge.
//
// What it deliberately does not do, per Ryan's answers the same day:
//   - Extras. A visit added after the pay date, or an add-on invoiced
//     separately, is not swept up here. Staff invoice it as usual and
//     the card is charged right away (lib/autopayTiming.ts).
//   - Skipped visits. A paid-for visit that's later skipped or
//     cancelled is not refunded or credited automatically -- it's
//     listed in the daily digest for Ryan to decide (see
//     listSkippedInvoicedVisits below).
//
// How it stays safe to re-run:
//   - A visit that's on an invoice (jobber_visits.jobber_invoice_id) is
//     never picked up again. That linkage, written the moment the
//     invoice is created, is the real guard against billing twice.
//   - One audit_log row per customer per period (entity_type
//     "autopay_prepay_run") records that the period was handled, so a
//     visit added LATER in an already-billed period isn't quietly
//     billed the next morning.
//   - If the cron didn't run on the pay date it catches up for
//     CATCH_UP_DAYS; after that the period is left for staff to invoice
//     visit by visit, rather than charging someone weeks late out of
//     the blue.
//   - Charging is a separate second phase over "month-ahead invoices
//     that exist but have never had a charge attempted", so a run that
//     dies between creating an invoice and charging it is finished by
//     the next run instead of leaving a draft nobody is charged for.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { toPhoenixDateString } from "@/lib/phoenixDate";
import { toNumber } from "@/lib/format";
import { getBaseUrl } from "@/lib/baseUrl";
import { fetchJobDetails } from "@/lib/jobberJob";
import { fetchVisitOneTimeChargesForVisits } from "@/lib/visitCharges";
import { createInvoice, getInvoiceById, type Invoice } from "@/lib/invoices";
import { mirrorNativeInvoiceInJobberTables } from "@/lib/payments";
import { pushInvoiceToQuickbooks } from "@/lib/quickbooks";
import { sendInvoiceCopy } from "@/lib/invoiceDelivery";
import { chargeInvoiceAndSendReceipt } from "@/lib/autopayCharge";
import { loadEnrolledSchedules } from "@/lib/autopaySchedule";
import { getUnreadMessageCount } from "@/lib/contactHistory";
import { sendPush } from "@/lib/webPush";
import {
  addDays,
  daysBetween,
  formatChargeDate,
  formatPrepayPeriod,
  hasPrepayDay,
  prepayPeriod,
  type PrepayPeriod,
} from "@/lib/autopayTiming";

// Stored as invoices.created_by_name -- how a month-ahead invoice is
// told apart from one a person created.
export const PREPAY_CREATED_BY = "Autopay (month ahead)";

const PREPAY_RUN_ENTITY = "autopay_prepay_run";
const CATCH_UP_DAYS = 3;
const BUSINESS_UTC_OFFSET = "-07:00";

type PlanLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  details: string | null;
};

type PlanVisit = {
  visitId: string;
  date: string;
  lines: PlanLine[];
};

export type PrepayPlan = {
  clientId: string;
  customerName: string | null;
  period: PrepayPeriod;
  visits: PlanVisit[];
  total: number;
  // Anything that makes this customer unsafe to bill automatically
  // (a visit with no price on file). A plan with problems is reported
  // and NOT charged.
  problems: string[];
};

type VisitRow = {
  jobber_visit_id: string;
  jobber_job_id: string | null;
  customer_name: string | null;
  title: string | null;
  start_at: string;
  price_override: number | string | null;
};

// Same rule as app/(platform)/invoices/create/page.tsx: "Ray - Full -
// Monthly" -> "Full - Monthly".
function visitServiceLabel(title: string | null): string | null {
  const trimmed = (title ?? "").trim();
  if (!trimmed) return null;

  const separatorIndex = trimmed.indexOf(" - ");
  if (separatorIndex === -1) return trimmed;

  return trimmed.slice(separatorIndex + 3).trim() || trimmed;
}

function runKey(clientId: string, period: PrepayPeriod): string {
  return `${clientId}|${period.start}`;
}

async function recordRun(
  plan: Pick<PrepayPlan, "clientId" | "customerName" | "period">,
  values: Record<string, string | number | null>
): Promise<void> {
  const changes: Record<string, { before: null; after: string | number | null }> = {};
  for (const [key, value] of Object.entries(values)) {
    changes[key] = { before: null, after: value };
  }

  const { error } = await supabaseServer.from("audit_log").insert({
    actor_name: "System",
    action: "create",
    entity_type: PREPAY_RUN_ENTITY,
    entity_id: runKey(plan.clientId, plan.period),
    entity_label: `${plan.customerName ?? "Customer"} -- ${formatPrepayPeriod(plan.period)}`,
    changes,
  });

  if (error) {
    console.error("Couldn't record month-ahead autopay run:", error.message);
  }
}

// Works out, without changing anything, what each pay-ahead customer
// would be billed for the period starting on (or, with catchUp, within
// CATCH_UP_DAYS before) `asOf`. Used by the cron to act and by the
// daily digest to preview tomorrow.
export async function planMonthAhead(
  asOf: string,
  options: { catchUp: boolean }
): Promise<PrepayPlan[]> {
  const schedules = await loadEnrolledSchedules();

  const due: { clientId: string; period: PrepayPeriod }[] = [];

  for (const [clientId, schedule] of schedules) {
    if (!hasPrepayDay(schedule)) continue;

    const period = prepayPeriod(asOf, schedule.dayOfMonth);
    const daysLate = daysBetween(period.start, asOf);

    if (options.catchUp ? daysLate <= CATCH_UP_DAYS : daysLate === 0) {
      due.push({ clientId, period });
    }
  }

  if (due.length === 0) return [];

  const { data: runRows, error: runError } = await supabaseServer
    .from("audit_log")
    .select("entity_id")
    .eq("entity_type", PREPAY_RUN_ENTITY)
    .in(
      "entity_id",
      due.map((entry) => runKey(entry.clientId, entry.period))
    );

  if (runError) {
    // Not knowing what's already been handled is a reason to do
    // nothing, not to bill everyone again.
    throw new Error(`Couldn't check which pay-ahead periods are already billed: ${runError.message}`);
  }

  const alreadyRun = new Set((runRows ?? []).map((row) => row.entity_id as string));
  const plans: PrepayPlan[] = [];

  for (const { clientId, period } of due) {
    if (alreadyRun.has(runKey(clientId, period))) continue;

    const plan: PrepayPlan = {
      clientId,
      customerName: null,
      period,
      visits: [],
      total: 0,
      problems: [],
    };

    const { data: visitRows, error: visitsError } = await supabaseServer
      .from("jobber_visits")
      .select("jobber_visit_id, jobber_job_id, customer_name, title, start_at, price_override")
      .eq("jobber_client_id", clientId)
      .gte("start_at", `${period.start}T00:00:00${BUSINESS_UTC_OFFSET}`)
      .lt("start_at", `${period.endExclusive}T00:00:00${BUSINESS_UTC_OFFSET}`)
      .is("jobber_invoice_id", null)
      .is("invoice_dismissed_at", null)
      .order("start_at", { ascending: true });

    if (visitsError) {
      plan.problems.push(`Couldn't load visits: ${visitsError.message}`);
      plans.push(plan);
      continue;
    }

    const candidateVisits = (visitRows ?? []) as VisitRow[];
    const jobIds = Array.from(
      new Set(candidateVisits.map((v) => v.jobber_job_id).filter((id): id is string => Boolean(id)))
    );

    // Only the recurring plan is paid ahead. A one-off job that happens
    // to be scheduled this month is an extra: invoiced by staff,
    // charged right away.
    const { data: jobRows, error: jobsError } = jobIds.length
      ? await supabaseServer
          .from("jobber_jobs")
          .select("jobber_job_id")
          .in("jobber_job_id", jobIds)
          .eq("source", "native")
          .not("job_status", "in", "(archived,completed)")
          .not("recurrence_frequency", "is", null)
      : { data: [], error: null };

    if (jobsError) {
      plan.problems.push(`Couldn't load jobs: ${jobsError.message}`);
      plans.push(plan);
      continue;
    }

    const recurringJobIds = new Set((jobRows ?? []).map((row) => row.jobber_job_id as string));
    const visits = candidateVisits.filter(
      (visit) => visit.jobber_job_id && recurringJobIds.has(visit.jobber_job_id)
    );

    plan.customerName = visits[0]?.customer_name ?? candidateVisits[0]?.customer_name ?? null;

    if (visits.length === 0) {
      plans.push(plan);
      continue;
    }

    const jobLines = new Map<string, PlanLine[]>();

    for (const jobId of new Set(visits.map((visit) => visit.jobber_job_id as string))) {
      const details = await fetchJobDetails(jobId);

      jobLines.set(
        jobId,
        (details?.lineItems ?? [])
          .filter((item) => item.unitPrice != null && item.unitPrice > 0)
          .map((item) => ({
            description: item.name?.trim() || "Service",
            quantity: 1,
            unitPrice: item.unitPrice as number,
            details: item.details,
          }))
      );
    }

    const oneTimeCharges = await fetchVisitOneTimeChargesForVisits(
      visits.map((visit) => visit.jobber_visit_id)
    );

    for (const visit of visits) {
      const date = toPhoenixDateString(visit.start_at) ?? period.start;
      const dateLabel = formatChargeDate(date);

      // Identical to what Create Invoices suggests for this visit: a
      // per-visit price override wins, otherwise the job's own line
      // items, plus any one-time add-ons already on the visit.
      const base: PlanLine[] =
        visit.price_override != null
          ? [
              {
                description: visitServiceLabel(visit.title) || "Service",
                quantity: 1,
                unitPrice: toNumber(visit.price_override),
                details: null,
              },
            ]
          : jobLines.get(visit.jobber_job_id as string) ?? [];

      const addOns: PlanLine[] = (oneTimeCharges.get(visit.jobber_visit_id) ?? []).map(
        (charge) => ({
          description: charge.name,
          quantity: 1,
          unitPrice: charge.unitPrice,
          details: null,
        })
      );

      const basePriced = base.some((line) => line.unitPrice > 0);

      if (!basePriced) {
        plan.problems.push(
          `The ${dateLabel} visit has no price on file (set the job's price or a visit price).`
        );
        continue;
      }

      plan.visits.push({
        visitId: visit.jobber_visit_id,
        date,
        // The visit date goes on every line so the customer can see
        // exactly which visits this month's payment covers.
        lines: [...base, ...addOns].map((line) => ({
          ...line,
          description: `${line.description} (${dateLabel} visit)`,
        })),
      });
    }

    plan.total = plan.visits.reduce(
      (sum, visit) =>
        sum + visit.lines.reduce((s, line) => s + line.quantity * line.unitPrice, 0),
      0
    );

    plans.push(plan);
  }

  return plans;
}

export function describePrepayPlan(plan: PrepayPlan): string {
  const who = plan.customerName ?? "Customer";

  if (plan.problems.length > 0) {
    return `${who} -- NOT charging automatically: ${plan.problems.join(" ")}`;
  }

  return `${who} -- $${plan.total.toFixed(2)} for ${plan.visits.length} visit${
    plan.visits.length === 1 ? "" : "s"
  } (${formatPrepayPeriod(plan.period)})`;
}

async function buildServiceAddress(clientId: string): Promise<{
  serviceAddress: string | null;
  email: string | null;
  phone: string | null;
}> {
  const { data } = await supabaseServer
    .from("customers")
    .select("email, phone, address_line_1, address_line_2, city, state, postal_code")
    .eq("jobber_client_id", clientId)
    .maybeSingle();

  // Same composition as createNativeInvoiceForVisit
  // (app/(platform)/invoices/actions.ts).
  const streetLine = [data?.address_line_1, data?.address_line_2]
    .filter((part): part is string => Boolean(part && String(part).trim()))
    .join(", ");
  const cityState = [data?.city, data?.state]
    .filter((part): part is string => Boolean(part && String(part).trim()))
    .join(", ");
  const cityStateZip = [cityState, data?.postal_code]
    .filter((part): part is string => Boolean(part && String(part).trim()))
    .join(" ");

  return {
    serviceAddress: [streetLine, cityStateZip].filter(Boolean).join("\n") || null,
    email: (data?.email as string | null) ?? null,
    phone: (data?.phone as string | null) ?? null,
  };
}

export type PrepayResult = {
  customersDue: number;
  invoicesCreated: number;
  charged: number;
  failed: number;
  nothingScheduled: number;
  errors: string[];
};

// Phase 1: create the month-ahead invoice for one plan and attach its
// visits. Does not charge.
async function createPrepayInvoice(plan: PrepayPlan): Promise<Invoice | { error: string }> {
  const { serviceAddress, email, phone } = await buildServiceAddress(plan.clientId);
  const subject = `Service for ${formatPrepayPeriod(plan.period)} (paid ahead)`;

  const lineItems = plan.visits.flatMap((visit) =>
    visit.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      jobberVisitId: visit.visitId,
      details: line.details ?? undefined,
    }))
  );

  const created = await createInvoice({
    jobberClientId: plan.clientId,
    customerName: plan.customerName,
    lineItems,
    dueDate: plan.period.start,
    message: subject,
    serviceAddress,
    createdByUserId: null,
    createdByName: PREPAY_CREATED_BY,
  });

  if (!created.ok) return { error: created.error };

  const invoice = created.value;

  // The guard against ever billing these visits again -- written
  // before anything else can go wrong.
  const { error: linkError } = await supabaseServer
    .from("jobber_visits")
    .update({
      jobber_invoice_id: `native-${invoice.id}`,
      updated_at: new Date().toISOString(),
    })
    .in(
      "jobber_visit_id",
      plan.visits.map((visit) => visit.visitId)
    );

  if (linkError) {
    // An invoice whose visits aren't attached would be billed again
    // tomorrow. Void it so it can't be charged, and report.
    await supabaseServer.from("invoices").update({ status: "void" }).eq("id", invoice.id);
    return { error: `Couldn't attach visits to the invoice (voided it): ${linkError.message}` };
  }

  await recordRun(plan, {
    invoice_number: invoice.invoiceNumber,
    total: invoice.total,
    visits: plan.visits.length,
  });

  await mirrorNativeInvoiceInJobberTables({
    invoiceId: invoice.id,
    jobberClientId: plan.clientId,
    customerName: plan.customerName,
    invoiceNumber: invoice.invoiceNumber,
    subject,
    status: "draft",
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    total: invoice.total,
  });

  // Best-effort, same as every other native invoice.
  try {
    const qb = await pushInvoiceToQuickbooks({
      invoiceId: invoice.id,
      jobberClientId: plan.clientId,
      customerName: plan.customerName,
      customerEmail: email,
      customerPhone: phone,
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      lineItems: lineItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    });

    await supabaseServer
      .from("invoices")
      .update(
        qb.ok
          ? { quickbooks_invoice_id: qb.quickbooksInvoiceId, quickbooks_push_error: null }
          : { quickbooks_push_error: qb.error }
      )
      .eq("id", invoice.id);
  } catch (error) {
    console.error(`QuickBooks push failed for ${invoice.invoiceNumber}:`, error);
  }

  return invoice;
}

// Phase 2: every month-ahead invoice that exists, is still a draft, and
// has never had a charge attempted -- the ones just created above plus
// any a previous run created but didn't get to.
async function chargePendingPrepayInvoices(result: PrepayResult): Promise<void> {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();

  const { data: pending, error } = await supabaseServer
    .from("invoices")
    .select("id")
    .eq("created_by_name", PREPAY_CREATED_BY)
    .eq("status", "draft")
    .gte("created_at", since);

  if (error) {
    result.errors.push(`Couldn't load month-ahead invoices to charge: ${error.message}`);
    return;
  }

  const ids = (pending ?? []).map((row) => row.id as string);

  if (ids.length === 0) return;

  const { data: attemptRows, error: attemptsError } = await supabaseServer
    .from("autopay_charge_attempts")
    .select("invoice_id")
    .in("invoice_id", ids);

  if (attemptsError) {
    // Can't tell what's been tried -- charging anyway risks a double
    // charge, so stop here and say so.
    result.errors.push(`Couldn't check earlier charge attempts: ${attemptsError.message}`);
    return;
  }

  const attempted = new Set((attemptRows ?? []).map((row) => row.invoice_id as string));
  const baseUrl = await getBaseUrl();

  for (const id of ids) {
    if (attempted.has(id)) continue;

    const invoice = await getInvoiceById(id);

    if (!invoice || invoice.status !== "draft") continue;

    const charge = await chargeInvoiceAndSendReceipt(invoice, "scheduled");

    if (charge.charged) {
      result.charged += 1;
      continue;
    }

    result.failed += 1;
    result.errors.push(
      `${invoice.customerName ?? "Customer"} -- invoice ${invoice.invoiceNumber}: ${charge.reason}`
    );

    // The card didn't go through. Turn it into an ordinary sent invoice
    // with a Pay Now link so the customer can still pay, and the normal
    // overdue reminders take it from here.
    const sentAt = new Date().toISOString();

    await supabaseServer
      .from("invoices")
      .update({ status: "sent", sent_at: sentAt })
      .eq("id", invoice.id);

    if (invoice.jobberClientId) {
      await mirrorNativeInvoiceInJobberTables({
        invoiceId: invoice.id,
        jobberClientId: invoice.jobberClientId,
        customerName: invoice.customerName,
        invoiceNumber: invoice.invoiceNumber,
        subject: invoice.message,
        status: "sent",
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        total: invoice.total,
      });
    }

    const delivery = await sendInvoiceCopy({ ...invoice, status: "sent", sentAt }, baseUrl);

    if (!delivery.ok) {
      result.errors.push(
        `Invoice ${invoice.invoiceNumber} couldn't be sent to the customer after the failed charge: ${delivery.error}`
      );
    }

    await sendPush("autopay_failed", {
      title: `Autopay failed: ${invoice.customerName ?? "Customer"}`,
      body: `Month-ahead invoice ${invoice.invoiceNumber} ($${invoice.total.toFixed(2)}): ${charge.reason}`.slice(
        0,
        180
      ),
      url: invoice.jobberClientId
        ? `/customers/${encodeURIComponent(invoice.jobberClientId)}`
        : "/invoices",
      badgeCount: await getUnreadMessageCount().catch(() => 0),
    });
  }
}

export async function chargeMonthAheadCustomers(): Promise<PrepayResult> {
  const result: PrepayResult = {
    customersDue: 0,
    invoicesCreated: 0,
    charged: 0,
    failed: 0,
    nothingScheduled: 0,
    errors: [],
  };

  const today = toPhoenixDateString(new Date().toISOString());

  if (!today) {
    result.errors.push("Couldn't determine today's date in Phoenix time.");
    return result;
  }

  let plans: PrepayPlan[] = [];

  try {
    plans = await planMonthAhead(today, { catchUp: true });
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  result.customersDue = plans.length;

  for (const plan of plans) {
    if (plan.problems.length > 0) {
      // Left un-recorded on purpose: fix the price and tomorrow's run
      // (inside the catch-up window) bills them. Pushed as well as
      // reported, since nobody is otherwise told a customer who expects
      // to be charged today wasn't.
      result.errors.push(describePrepayPlan(plan));

      await sendPush("autopay_failed", {
        title: `Couldn't bill ${plan.customerName ?? "a customer"} ahead`,
        body: plan.problems.join(" ").slice(0, 180),
        url: `/customers/${encodeURIComponent(plan.clientId)}`,
        badgeCount: await getUnreadMessageCount().catch(() => 0),
      });

      continue;
    }

    if (plan.visits.length === 0) {
      result.nothingScheduled += 1;
      await recordRun(plan, { invoice_number: null, total: 0, visits: 0 });
      continue;
    }

    const created = await createPrepayInvoice(plan);

    if ("error" in created) {
      result.errors.push(`${plan.customerName ?? "Customer"}: ${created.error}`);
      continue;
    }

    result.invoicesCreated += 1;
  }

  await chargePendingPrepayInvoices(result);

  return result;
}

// For the daily digest: who gets charged tomorrow, and how much.
export async function previewTomorrowsMonthAheadCharges(): Promise<string[]> {
  const today = toPhoenixDateString(new Date().toISOString());

  if (!today) return [];

  const plans = await planMonthAhead(addDays(today, 1), { catchUp: false });

  return plans
    .filter((plan) => plan.visits.length > 0 || plan.problems.length > 0)
    .map(describePrepayPlan);
}

// For the daily digest: visits removed in the last 7 days that were
// already on an invoice -- for a pay-ahead customer that means money
// was taken for a visit that now won't happen. Nothing is refunded or
// credited automatically (Ryan's call); this is the list he decides
// from. Reads the same audit rows the Skip button and job cancellation
// write.
export async function listSkippedInvoicedVisits(): Promise<string[]> {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();

  const { data, error } = await supabaseServer
    .from("audit_log")
    .select("entity_label, changes, created_at")
    .eq("entity_type", "visit")
    .eq("action", "delete")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) return [];

  const lines: string[] = [];

  for (const row of data) {
    const changes = row.changes as Record<string, { before?: unknown } | undefined> | null;
    const invoiceRef = changes?.jobber_invoice_id?.before;

    if (typeof invoiceRef !== "string" || !invoiceRef.startsWith("native-")) continue;

    const { data: invoiceRow } = await supabaseServer
      .from("invoices")
      .select("invoice_number, status")
      .eq("id", invoiceRef.slice("native-".length))
      .maybeSingle();

    if (!invoiceRow || invoiceRow.status === "void") continue;

    const startAt = changes?.start_at?.before;
    const day = typeof startAt === "string" ? toPhoenixDateString(startAt) : null;
    const who = changes?.customer_name?.before;

    lines.push(
      `${typeof who === "string" && who ? who : "Customer"} -- ${
        day ? `${formatChargeDate(day)} visit` : "a visit"
      } was ${row.entity_label === "Job cancelled" ? "removed when the job was cancelled" : "skipped"}, but it's on invoice ${
        invoiceRow.invoice_number as string
      } (${invoiceRow.status as string})`
    );
  }

  return lines;
}
