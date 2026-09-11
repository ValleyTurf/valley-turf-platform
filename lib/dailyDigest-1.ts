// Daily ops digest (Ryan's request) -- one email, once a day, rounding
// up the things most likely to quietly slip through the cracks:
// unlogged job costs, visits with no photos on file, quotes that were
// approved but never turned into a scheduled job, and timeclock/job-timer
// entries that look like someone forgot to stop them. See migration
// 064_add_daily_digest_settings.sql for the settings row (on/off +
// recipient list, editable from Settings > Notifications) and
// app/api/ops/send-daily-digest/route.ts for the cron entry point.
//
// Pure data-gathering lives here; lib/notifications.ts's
// sendDailyDigestEmail() owns the actual HTML rendering, same split as
// every other automated send in this app.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { toPhoenixDateString } from "@/lib/phoenixDate";
import { parseLaborEmployeeName } from "@/lib/laborMaterialName";
import { toNumber } from "@/lib/format";
import {
  sendDailyDigestEmail,
  type DailyDigestData,
  type UnpaidInvoicesSection,
} from "@/lib/notifications";
import { previewPendingVisitReminders } from "@/lib/visitReminders";

const BUSINESS_UTC_OFFSET = "-07:00";

// Same fixed floor as job-costs/page.tsx's HIDE_VISITS_BEFORE -- keep
// these two in sync. Duplicated rather than imported since that file is
// a page component (nothing in it is meant to be a shared module entry
// point); see that file's own comment for why the floor exists at all.
const HIDE_VISITS_BEFORE = "2026-08-19";

// Cap on how many example rows each section lists inline in the email --
// this is a nudge to go look at the real page, not a replacement for it.
const SAMPLE_LIMIT = 8;

function addDaysToPhoenixDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

// Invoice ratings of 4 or below from the last 24h (ROADMAP.md Fresh
// Ideas #10) -- a backstop alongside lib/notifications.ts's
// sendLowRatingAlert, which already fires immediately per-rating; this
// section is the "didn't miss anything overnight" net, not the primary
// alert path.
type LowRatingRow = {
  invoice_number: string | null;
  customer_name: string | null;
  score: number;
};

async function countLowRatings(): Promise<{ count: number; sample: string[] }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseServer
    .from("invoice_ratings")
    .select("invoice_number, customer_name, score")
    .lte("score", 4)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error || !data) return { count: 0, sample: [] };

  const rows = data as LowRatingRow[];

  return {
    count: rows.length,
    sample: rows
      .slice(0, SAMPLE_LIMIT)
      .map(
        (row) =>
          `${row.customer_name || "Unknown customer"} -- ${row.score}/5 stars (invoice ${
            row.invoice_number || "—"
          })`
      ),
  };
}

type VisitCostingRow = {
  jobber_visit_id: string;
  jobber_client_id: string | null;
  customer_name: string | null;
  job_number: string | null;
  title: string | null;
  start_at: string | null;
};

type UsageRow = {
  jobber_visit_id: string;
  material_id: string;
  quantity_used: number | string;
};

// Same "Fuel + Labor" completeness check as job-costs/page.tsx -- see
// that file for the full reasoning. Kept in sync manually rather than
// imported since the page computes it inline against page-specific
// pagination state; if that page ever gets a proper exported helper,
// this should switch to calling it instead of re-deriving the same
// logic a second place.
async function countUnloggedJobCosts(): Promise<{
  count: number;
  sample: string[];
}> {
  const nowIso = new Date().toISOString();

  const [materialsResult, visitsResult] = await Promise.all([
    supabaseServer
      .from("materials")
      .select("id, name")
      .or(`end_date.is.null,end_date.gt.${HIDE_VISITS_BEFORE}`),
    supabaseServer
      .from("visit_costing_list")
      .select("jobber_visit_id, jobber_client_id, customer_name, job_number, title, start_at")
      .not("start_at", "is", null)
      .lte("start_at", nowIso)
      .gte("start_at", `${HIDE_VISITS_BEFORE}T00:00:00${BUSINESS_UTC_OFFSET}`),
  ]);

  const materials = (materialsResult.data ?? []) as { id: string; name: string }[];
  const rawVisits = (visitsResult.data ?? []) as VisitCostingRow[];

  if (rawVisits.length === 0) return { count: 0, sample: [] };

  // visit_costing_list (a view) doesn't carry job_status, so a
  // canceled/archived job's visit had no way to ever drop off this
  // section -- same gap job-costs/page.tsx already had to work around
  // (see that file's comment above its own archivedVisitIds filter).
  // Cross-referenced against jobber_visits by id rather than touching
  // the view, since job-costs/page.tsx also reads visit_costing_list and
  // shouldn't be affected by a digest-only concern.
  const rawVisitIds = rawVisits.map((visit) => visit.jobber_visit_id);
  const { data: statusRows } =
    rawVisitIds.length > 0
      ? await supabaseServer
          .from("jobber_visits")
          .select("jobber_visit_id, job_status")
          .in("jobber_visit_id", rawVisitIds)
      : { data: [] as { jobber_visit_id: string; job_status: string | null }[] };

  const archivedVisitIds = new Set(
    ((statusRows ?? []) as { jobber_visit_id: string; job_status: string | null }[])
      .filter((row) => row.job_status === "archived")
      .map((row) => row.jobber_visit_id)
  );

  const visits = rawVisits.filter((visit) => !archivedVisitIds.has(visit.jobber_visit_id));

  if (visits.length === 0) return { count: 0, sample: [] };

  const fuelMaterialIds = new Set(
    materials.filter((m) => m.name.trim().toLowerCase() === "fuel").map((m) => m.id)
  );
  const laborMaterialIds = new Set(
    materials.filter((m) => parseLaborEmployeeName(m.name)).map((m) => m.id)
  );

  const visitIds = visits.map((v) => v.jobber_visit_id);
  const { data: usageData } = await supabaseServer
    .from("visit_material_usage")
    .select("jobber_visit_id, material_id, quantity_used")
    .in("jobber_visit_id", visitIds);

  const usageRows = (usageData ?? []) as UsageRow[];
  const hasFuelByVisit = new Set<string>();
  const hasLaborByVisit = new Set<string>();

  for (const row of usageRows) {
    if (toNumber(row.quantity_used) <= 0) continue;
    if (fuelMaterialIds.has(row.material_id)) hasFuelByVisit.add(row.jobber_visit_id);
    if (laborMaterialIds.has(row.material_id)) hasLaborByVisit.add(row.jobber_visit_id);
  }

  function isCostingDone(visitId: string): boolean {
    const fuelOk = fuelMaterialIds.size === 0 || hasFuelByVisit.has(visitId);
    const laborOk = laborMaterialIds.size === 0 || hasLaborByVisit.has(visitId);
    return fuelOk && laborOk;
  }

  const unlogged = visits.filter((v) => !isCostingDone(v.jobber_visit_id));

  return {
    count: unlogged.length,
    sample: unlogged.slice(0, SAMPLE_LIMIT).map((v) => {
      const who = v.customer_name ?? "Unknown customer";
      const what = v.title ?? v.job_number ?? "visit";
      return `${who} -- ${what}`;
    }),
  };
}

type CompletedVisitRow = {
  jobber_visit_id: string;
  jobber_client_id: string | null;
  customer_name: string | null;
  title: string | null;
};

// Visits marked completed in the last 7 days (Phoenix) with zero photos
// across every visit_notes row for that visit -- a visit can have
// several note rows, each with its own (possibly empty) photo_paths
// array, so this has to union across all of them rather than just
// checking row existence. See lib/visitNotes.ts for the table/bucket
// this reads.
//
// Deliberately a rolling 7-day window rather than just "yesterday"
// (Ryan's request) -- a job missing photos should keep showing up in
// the digest every morning until someone actually adds the photos, not
// just get one day of visibility and then silently drop off.
const MISSING_PHOTOS_LOOKBACK_DAYS = 7;

async function countVisitsMissingPhotos(): Promise<{
  count: number;
  sample: string[];
}> {
  const todayPhoenix = toPhoenixDateString(new Date().toISOString());
  if (!todayPhoenix) return { count: 0, sample: [] };
  const windowStart = addDaysToPhoenixDate(todayPhoenix, -MISSING_PHOTOS_LOOKBACK_DAYS);

  const { data: visitsData } = await supabaseServer
    .from("jobber_visits")
    .select("jobber_visit_id, jobber_client_id, customer_name, title")
    .eq("visit_status", "COMPLETED")
    .gte("completed_at", `${windowStart}T00:00:00${BUSINESS_UTC_OFFSET}`)
    .lt("completed_at", `${todayPhoenix}T00:00:00${BUSINESS_UTC_OFFSET}`)
    .not("jobber_client_id", "is", null)
    .or("job_status.is.null,job_status.neq.archived");

  const visits = (visitsData ?? []) as CompletedVisitRow[];
  if (visits.length === 0) return { count: 0, sample: [] };

  const visitIds = visits.map((v) => v.jobber_visit_id);
  const { data: notesData } = await supabaseServer
    .from("visit_notes")
    .select("jobber_visit_id, photo_paths")
    .in("jobber_visit_id", visitIds);

  const photoCountByVisit = new Map<string, number>();
  for (const row of (notesData ?? []) as { jobber_visit_id: string; photo_paths: string[] | null }[]) {
    const existing = photoCountByVisit.get(row.jobber_visit_id) ?? 0;
    photoCountByVisit.set(row.jobber_visit_id, existing + (row.photo_paths?.length ?? 0));
  }

  const missing = visits.filter((v) => (photoCountByVisit.get(v.jobber_visit_id) ?? 0) === 0);

  return {
    count: missing.length,
    sample: missing.slice(0, SAMPLE_LIMIT).map((v) => {
      const who = v.customer_name ?? "Unknown customer";
      const what = v.title ?? "visit";
      return `${who} -- ${what}`;
    }),
  };
}

type InvoiceRow = {
  jobber_invoice_id: string;
  customer_name: string | null;
  invoice_number: string | null;
  status: string | null;
  total: number | string | null;
  due_date: string | null;
};

// Same permissive status check as lib/invoiceReminders.ts's
// isUnpaidAndSendable (kept as a separate copy rather than an import --
// this file only needs the read, not the reminder-sending machinery
// around it): catches both native lowercase and Jobber-synced uppercase
// statuses. Ryan's request -- every currently-outstanding invoice, not
// just ones that happen to be exactly 3 or 10 days overdue like the
// automated reminder rules.
function isUnpaidInvoiceStatus(status: string | null): boolean {
  if (!status) return false;
  const upper = status.toUpperCase();
  return !upper.includes("PAID") && !upper.includes("VOID") && upper !== "DRAFT";
}

async function countUnpaidInvoices(): Promise<UnpaidInvoicesSection> {
  const { data } = await supabaseServer
    .from("jobber_invoices")
    .select("jobber_invoice_id, customer_name, invoice_number, status, total, due_date")
    .not("jobber_client_id", "is", null);

  const invoices = ((data ?? []) as InvoiceRow[]).filter((invoice) =>
    isUnpaidInvoiceStatus(invoice.status)
  );

  // Oldest due date first -- the ones most worth a look land at the top
  // of the sample list rather than in whatever order Supabase happened
  // to return them.
  invoices.sort((a, b) => {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  });

  const totalAmount = invoices.reduce((sum, invoice) => sum + toNumber(invoice.total), 0);

  return {
    count: invoices.length,
    totalAmount,
    sample: invoices.slice(0, SAMPLE_LIMIT).map((invoice) => {
      const who = invoice.customer_name ?? "Unknown customer";
      const number = invoice.invoice_number ?? "—";
      const amount = toNumber(invoice.total).toFixed(2);
      const due = invoice.due_date ?? "no due date";
      return `${who} -- Invoice ${number}, $${amount}, due ${due}`;
    }),
  };
}

type QuoteRow = {
  quote_number: string | null;
  recipient_name: string | null;
  price_total: number | string | null;
};

// Accepted quotes that never got a job -- attemptQuoteJobConversion runs
// automatically the moment a quote is marked accepted
// (app/(platform)/quotes/actions.ts), so anything still sitting here
// either failed conversion (job_creation_error set) or is a quote that
// was accepted before that automation existed.
async function countQuotesApprovedNotScheduled(): Promise<{
  count: number;
  sample: string[];
}> {
  const { data } = await supabaseServer
    .from("quotes")
    .select("quote_number, recipient_name, price_total")
    .eq("status", "accepted")
    .is("jobber_job_id", null);

  const quotes = (data ?? []) as QuoteRow[];

  return {
    count: quotes.length,
    sample: quotes.slice(0, SAMPLE_LIMIT).map((q) => {
      const who = q.recipient_name ?? "Unknown";
      const number = q.quote_number ?? "—";
      return `${who} -- Quote ${number}`;
    }),
  };
}

type UserRow = {
  id: string;
  name: string | null;
};

type OpenShiftRow = {
  user_id: string;
  clocked_in_at: string;
};

type OpenTimerRow = {
  jobber_visit_id: string;
  user_id: string;
  started_at: string;
};

// Only flags shifts/timers that were already running before today
// started (Phoenix) -- the digest runs early morning, so anything open
// from a prior day is almost certainly someone forgetting to stop it,
// not a job genuinely still in progress right now.
async function findTimecardIssues(): Promise<{
  openShifts: { count: number; sample: string[] };
  openTimers: { count: number; sample: string[] };
}> {
  const todayPhoenix = toPhoenixDateString(new Date().toISOString());
  const startOfToday = todayPhoenix ? `${todayPhoenix}T00:00:00${BUSINESS_UTC_OFFSET}` : null;

  const [shiftsResult, timersResult] = await Promise.all([
    supabaseServer
      .from("shift_time_logs")
      .select("user_id, clocked_in_at")
      .is("clocked_out_at", null),
    supabaseServer
      .from("visit_time_logs")
      .select("jobber_visit_id, user_id, started_at")
      .is("stopped_at", null),
  ]);

  const openShiftsAll = (shiftsResult.data ?? []) as OpenShiftRow[];
  const openTimersAll = (timersResult.data ?? []) as OpenTimerRow[];

  const openShifts = startOfToday
    ? openShiftsAll.filter((s) => s.clocked_in_at < startOfToday)
    : openShiftsAll;
  const openTimers = startOfToday
    ? openTimersAll.filter((t) => t.started_at < startOfToday)
    : openTimersAll;

  const userIds = Array.from(
    new Set([...openShifts.map((s) => s.user_id), ...openTimers.map((t) => t.user_id)])
  );

  const { data: usersData } =
    userIds.length > 0
      ? await supabaseServer.from("users").select("id, name").in("id", userIds)
      : { data: [] as UserRow[] };

  const nameById = new Map(
    ((usersData ?? []) as UserRow[]).map((u) => [u.id, u.name ?? "Unknown"])
  );

  return {
    openShifts: {
      count: openShifts.length,
      sample: openShifts.slice(0, SAMPLE_LIMIT).map((s) => {
        const name = nameById.get(s.user_id) ?? "Unknown";
        const since = new Date(s.clocked_in_at).toLocaleString("en-US", {
          timeZone: "America/Phoenix",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        return `${name} -- clocked in since ${since}`;
      }),
    },
    openTimers: {
      count: openTimers.length,
      sample: openTimers.slice(0, SAMPLE_LIMIT).map((t) => {
        const name = nameById.get(t.user_id) ?? "Unknown";
        const since = new Date(t.started_at).toLocaleString("en-US", {
          timeZone: "America/Phoenix",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        return `${name} -- job timer running since ${since}`;
      }),
    },
  };
}

export type SendDailyDigestResult =
  | { sent: false; reason: string }
  | { sent: true; recipients: number };

export async function sendDailyDigest(): Promise<SendDailyDigestResult> {
  const { data: settingsRow, error: settingsError } = await supabaseServer
    .from("daily_digest_settings")
    .select("enabled, recipient_emails")
    .eq("id", 1)
    .maybeSingle();

  if (settingsError) {
    return { sent: false, reason: `Couldn't load digest settings: ${settingsError.message}` };
  }

  if (!settingsRow || !settingsRow.enabled) {
    return { sent: false, reason: "Daily digest is turned off." };
  }

  const recipients = ((settingsRow.recipient_emails ?? []) as string[]).filter(Boolean);

  if (recipients.length === 0) {
    return { sent: false, reason: "No digest recipients configured." };
  }

  const [
    unloggedJobCosts,
    visitsMissingPhotos,
    quotesApprovedNotScheduled,
    timecardIssues,
    unpaidInvoices,
    remindersGoingOutToday,
    lowRatings,
  ] = await Promise.all([
    countUnloggedJobCosts(),
    countVisitsMissingPhotos(),
    countQuotesApprovedNotScheduled(),
    findTimecardIssues(),
    countUnpaidInvoices(),
    previewPendingVisitReminders(),
    countLowRatings(),
  ]);

  const data: DailyDigestData = {
    unloggedJobCosts,
    visitsMissingPhotos,
    quotesApprovedNotScheduled,
    openShifts: timecardIssues.openShifts,
    openTimers: timecardIssues.openTimers,
    unpaidInvoices,
    remindersGoingOutToday,
    lowRatings,
  };

  // Reminders queued for today count toward "is there anything worth
  // sending" too -- Ryan wants that visibility every morning, not only
  // on days something is also broken.
  const totalFlagged =
    data.unloggedJobCosts.count +
    data.visitsMissingPhotos.count +
    data.quotesApprovedNotScheduled.count +
    data.openShifts.count +
    data.openTimers.count +
    data.unpaidInvoices.count +
    data.remindersGoingOutToday.count +
    data.lowRatings.count;

  if (totalFlagged === 0) {
    return { sent: false, reason: "Nothing to report today -- digest skipped." };
  }

  let delivered = 0;
  for (const toEmail of recipients) {
    const ok = await sendDailyDigestEmail(toEmail, data);
    if (ok) delivered += 1;
  }

  if (delivered === 0) {
    return { sent: false, reason: "Digest email failed to send to every recipient." };
  }

  return { sent: true, recipients: delivered };
}
