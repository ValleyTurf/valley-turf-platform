import "server-only";

// I/O layer for the Visits report page/CSV export. Joins three
// already-synced Jobber tables in memory, same approach as
// lib/transactions.ts:
//   - jobber_visits (app/api/jobber/sync-visits) — one row per scheduled
//     visit: title, status, start/end time, and the client/job it
//     belongs to. This is the backbone of the list, matching Jobber's
//     own "visit list" report (each row is a visit, not a job — a
//     recurring job with 12 visits shows up as 12 rows, same as
//     Jobber's).
//   - jobber_jobs    (app/api/jobber/sync-jobs) — supplies job_type
//     (one-off vs. recurring), total price, and jobber_web_uri (a direct
//     link back to the job in Jobber).
//   - customers      — supplies email/phone, which jobber_visits/
//     jobber_jobs don't carry (they only store a denormalized
//     customer_name at sync time).
//
// Deliberately does NOT include service property name/street/city —
// that's Jobber Property data, which isn't synced anywhere in this app
// yet (would need its own schema-discovery + sync route, same as the
// turf-size/labor-duration work). Left out per explicit direction rather
// than guessed at with the customer's own billing address.
import { supabaseServer } from "@/lib/supabase-server";
import { toPhoenixDateString } from "@/lib/phoenixDate";
import {
  humanizeVisitField,
  filterVisitRows,
  sortVisitRows,
  type SortDirection,
  type VisitRow,
  type VisitSortField,
} from "@/lib/visitReportFormatting";

export type { VisitRow, VisitSortField, SortDirection };

export type VisitReportQuery = {
  startDate: string;
  endDate: string;
  jobType?: string;
  status?: string;
  search?: string;
  sortField?: VisitSortField;
  sortDir?: SortDirection;
};

export type VisitReportResult = {
  rows: VisitRow[];
  jobTypeOptions: string[];
  statusOptions: string[];
};

type VisitRecord = {
  jobber_visit_id: string;
  jobber_job_id: string | null;
  jobber_client_id: string | null;
  customer_name: string | null;
  job_number: string | null;
  title: string | null;
  visit_status: string | null;
  start_at: string | null;
  end_at: string | null;
};

type JobRecord = {
  jobber_job_id: string;
  job_type: string | null;
  jobber_web_uri: string | null;
  total: number | string | null;
};

type CustomerRecord = {
  jobber_client_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const PAGE_SIZE = 1000;
const ID_BATCH_SIZE = 500;

// Ordered explicitly for the same reason lib/transactions.ts's
// fetchAllPayments is — repeated .range() calls need a stable sort to
// return a consistent, non-overlapping sequence once a range needs more
// than one page.
async function fetchAllVisits(
  startDate: string,
  endDate: string
): Promise<VisitRecord[]> {
  const rows: VisitRecord[] = [];
  const startBound = `${startDate}T00:00:00-07:00`;
  const endBound = `${endDate}T23:59:59-07:00`;

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseServer
      .from("jobber_visits")
      .select(
        "jobber_visit_id, jobber_job_id, jobber_client_id, customer_name, job_number, title, visit_status, start_at, end_at"
      )
      .gte("start_at", startBound)
      .lte("start_at", endBound)
      .order("start_at", { ascending: true })
      .order("jobber_visit_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const batch = (data ?? []) as VisitRecord[];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchJobsByIds(ids: string[]): Promise<Map<string, JobRecord>> {
  const map = new Map<string, JobRecord>();
  if (ids.length === 0) return map;

  for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
    const batchIds = ids.slice(i, i + ID_BATCH_SIZE);

    const { data, error } = await supabaseServer
      .from("jobber_jobs")
      .select("jobber_job_id, job_type, jobber_web_uri, total")
      .in("jobber_job_id", batchIds);

    if (error) throw error;

    for (const row of (data ?? []) as JobRecord[]) {
      map.set(row.jobber_job_id, row);
    }
  }

  return map;
}

async function fetchCustomersByIds(
  ids: string[]
): Promise<Map<string, CustomerRecord>> {
  const map = new Map<string, CustomerRecord>();
  if (ids.length === 0) return map;

  for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
    const batchIds = ids.slice(i, i + ID_BATCH_SIZE);

    const { data, error } = await supabaseServer
      .from("customers")
      .select("jobber_client_id, full_name, email, phone")
      .in("jobber_client_id", batchIds);

    if (error) throw error;

    for (const row of (data ?? []) as CustomerRecord[]) {
      map.set(row.jobber_client_id, row);
    }
  }

  return map;
}

export async function getVisitReport(
  query: VisitReportQuery
): Promise<VisitReportResult> {
  const visits = await fetchAllVisits(query.startDate, query.endDate);

  const jobIds = Array.from(
    new Set(
      visits.map((v) => v.jobber_job_id).filter((id): id is string => Boolean(id))
    )
  );
  const clientIds = Array.from(
    new Set(
      visits
        .map((v) => v.jobber_client_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const [jobMap, customerMap] = await Promise.all([
    fetchJobsByIds(jobIds),
    fetchCustomersByIds(clientIds),
  ]);

  const allRows: VisitRow[] = visits.map((visit) => {
    const job = visit.jobber_job_id ? jobMap.get(visit.jobber_job_id) : undefined;
    const customer = visit.jobber_client_id
      ? customerMap.get(visit.jobber_client_id)
      : undefined;

    return {
      id: visit.jobber_visit_id,
      jobId: visit.jobber_job_id,
      jobNumber: visit.job_number,
      jobberWebUri: job?.jobber_web_uri ?? null,
      date: toPhoenixDateString(visit.start_at),
      startAt: visit.start_at,
      endAt: visit.end_at,
      title: visit.title,
      clientId: visit.jobber_client_id,
      clientName: customer?.full_name || visit.customer_name || "Unknown Customer",
      clientEmail: customer?.email ?? null,
      clientPhone: customer?.phone ?? null,
      status: humanizeVisitField(visit.visit_status),
      jobType: humanizeVisitField(job?.job_type),
      jobTotal: job ? toNumber(job.total) : null,
    };
  });

  // Filter dropdown options built from the full date-range result set
  // before jobType/status filters are applied, same reasoning as
  // lib/transactions.ts's typeOptions/methodOptions.
  const jobTypeOptions = Array.from(new Set(allRows.map((row) => row.jobType))).sort();
  const statusOptions = Array.from(new Set(allRows.map((row) => row.status))).sort();

  const filtered = filterVisitRows(allRows, {
    jobType: query.jobType,
    status: query.status,
    search: query.search,
  });

  const sorted = sortVisitRows(filtered, query.sortField ?? "date", query.sortDir ?? "desc");

  return { rows: sorted, jobTypeOptions, statusOptions };
}
