// Jobber Independence Roadmap — full one-time migration audit (roadmap
// #8). Run read-only first (GET /api/jobber/audit-migration) to review
// what's missing/needs attention BEFORE anything is written, then again
// with ?apply=true to actually gap-fill and backfill. See
// /supabase/migrations/067_migrate_jobber_to_native.sql's header comment
// for how this fits into the full cutover sequence — in short: ship this
// file + its route, run 068 (adds jobber_line_items_snapshot — this file
// writes to it in apply mode), run this in apply mode, THEN run 067 (the
// recurrence backfill + source flip). Running apply mode before 068 exists
// is safe (line-item snapshot writes fail individually and are reported
// in lineItemsSnapshotErrors, nothing else is affected).
//
// Reuses syncSingleCustomer/syncSingleJob/syncSingleVisit
// (lib/jobberWebhookProcessor.ts) to gap-fill anything found in Jobber
// but missing locally, rather than duplicating their upsert shapes here.
import "server-only";
import { jobberGraphQL } from "@/lib/jobber";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchPageWithThrottleRetry } from "@/lib/jobberSyncTracking";
import {
  syncSingleCustomer,
  syncSingleJob,
  syncSingleVisit,
} from "@/lib/jobberWebhookProcessor";
import type { RecurrenceFrequency } from "@/lib/nativeJobs";

export type JobberMigrationAuditOptions = {
  apply?: boolean;
};

type PageInfo = {
  endCursor: string | null;
  hasNextPage: boolean;
};

// Capped so the JSON response stays readable in a browser/Postman rather
// than dumping thousands of ids — missingLocallyTotal (uncapped) is what
// actually matters for "is this zero yet?".
const MISSING_LOCALLY_REPORT_CAP = 200;

export type AuditSection = {
  jobberCount: number;
  localCount: number;
  missingLocally: string[];
  missingLocallyTotal: number;
  gapFilled: number;
  gapFillErrors: string[];
};

function newSection(): AuditSection {
  return {
    jobberCount: 0,
    localCount: 0,
    missingLocally: [],
    missingLocallyTotal: 0,
    gapFilled: 0,
    gapFillErrors: [],
  };
}

function recordMissing(section: AuditSection, id: string) {
  section.missingLocallyTotal += 1;
  if (section.missingLocally.length < MISSING_LOCALLY_REPORT_CAP) {
    section.missingLocally.push(id);
  }
}

export type CadenceGuess = {
  jobberJobId: string;
  localTitle: string | null;
  visitCount: number;
  medianGapDays: number | null;
  guess: RecurrenceFrequency | null;
};

export type JobberMigrationAuditResult = {
  apply: boolean;
  startedAt: string;
  finishedAt: string;
  customers: AuditSection & {
    createdAtBackfilled: number;
    createdAtBackfillErrors: string[];
  };
  jobs: AuditSection & {
    instructionsBackfilled: number;
    instructionsBackfillErrors: string[];
    lineItemsSnapshotted: number;
    lineItemsSnapshotErrors: string[];
    jobsWithMultipleLineItems: { jobberJobId: string; lineItemCount: number }[];
    // Preview only — the real backfill runs as SQL in migration 067 Part
    // A, computed independently from the same underlying visit spacing.
    // This exists so Ryan can review the two lists below BEFORE running
    // that SQL, not to be the source of truth for it.
    recurringCadenceCannotBeInferred: CadenceGuess[];
    recurringCadenceOutsideEnum: CadenceGuess[];
  };
  visits: AuditSection;
  warnings: string[];
};

// ---------------------------------------------------------------------
// Local-side data, loaded up front (paginated past Supabase's 1000-row
// cap) so every Jobber-side page below can be compared/backfilled
// in-memory instead of round-tripping to Supabase per record.
// ---------------------------------------------------------------------

const LOCAL_PAGE_SIZE = 1000;

async function fetchAllLocalRows<T>(
  table: string,
  columns: string
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseServer
      .from(table)
      .select(columns)
      .range(from, from + LOCAL_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Unable to load local ${table}: ${error.message}`);
    }

    const batch = (data as T[] | null) ?? [];
    rows.push(...batch);

    if (batch.length < LOCAL_PAGE_SIZE) {
      break;
    }

    from += LOCAL_PAGE_SIZE;
  }

  return rows;
}

type LocalCustomerRow = {
  jobber_client_id: string;
  source: string | null;
};

type LocalJobRow = {
  jobber_job_id: string;
  source: string | null;
  instructions: string | null;
};

type LocalVisitRow = {
  jobber_visit_id: string;
  jobber_job_id: string | null;
  source: string | null;
  start_at: string | null;
};

// ---------------------------------------------------------------------
// Cadence preview — loose, report-only bucketing of median visit gap
// into this app's recurrence enum (weekly/bimonthly/monthly/quarterly/
// semiannual, migration 054). Deliberately generous tolerance: this is a
// heads-up for Ryan to review before migration 067's SQL runs its own
// (independent) computation, not the thing that actually sets
// recurrence_frequency.
// ---------------------------------------------------------------------

// biweekly/triannual added 2026-09 (Jobber Independence cutover
// follow-up, once migration 067's actual run flagged 3 biweekly jobs and
// 1 "every 4 months" job that didn't fit the original five buckets).
// Kept in the same ascending-day order as before -- a value near two
// buckets' shared boundary (e.g. ~100 days, between quarterly and
// triannual) resolves to whichever bucket's center it's actually closer
// to under this ordering, same as it always has.
const CADENCE_BUCKETS: { key: RecurrenceFrequency; days: number }[] = [
  { key: "weekly", days: 7 },
  { key: "biweekly", days: 14 },
  { key: "monthly", days: 30 },
  { key: "bimonthly", days: 60 },
  { key: "quarterly", days: 90 },
  { key: "triannual", days: 120 },
  { key: "semiannual", days: 180 },
];

const CADENCE_TOLERANCE = 0.25;

function guessCadence(medianGapDays: number): RecurrenceFrequency | null {
  for (const bucket of CADENCE_BUCKETS) {
    if (Math.abs(medianGapDays - bucket.days) <= bucket.days * CADENCE_TOLERANCE) {
      return bucket.key;
    }
  }
  return null;
}

function median(numbers: number[]): number | null {
  if (numbers.length === 0) {
    return null;
  }

  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------

type AuditClient = {
  id: string;
  createdAt: string | null;
};

type ClientsAuditPage = {
  clients: { nodes: AuditClient[]; pageInfo: PageInfo };
};

const CLIENTS_AUDIT_QUERY = `
  query GetClientsForAudit($limit: Int!, $cursor: String) {
    clients(first: $limit, after: $cursor) {
      nodes {
        id
        createdAt
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

async function auditCustomers(
  apply: boolean,
  localCustomers: Map<string, LocalCustomerRow>,
  warnings: string[]
): Promise<JobberMigrationAuditResult["customers"]> {
  const section = newSection();
  section.localCount = localCustomers.size;

  let createdAtBackfilled = 0;
  const createdAtBackfillErrors: string[] = [];

  let cursor: string | null = null;
  let hasNextPage = true;
  let pageNumber = 0;

  while (hasNextPage) {
    pageNumber += 1;

    if (pageNumber > 200) {
      warnings.push("Customer audit stopped after 200 pages for safety.");
      break;
    }

    const { response } = await fetchPageWithThrottleRetry<ClientsAuditPage>(
      () =>
        jobberGraphQL<ClientsAuditPage>(CLIENTS_AUDIT_QUERY, {
          limit: 50,
          cursor,
        }),
      { pageNumber, label: "customer audit page" }
    );

    if (response.errors?.length) {
      throw new Error(
        response.errors.map((e) => e.message).join(", ") ||
          `Jobber failed on customer audit page ${pageNumber}.`
      );
    }

    const clients = response.data?.clients?.nodes ?? [];
    const pageInfo = response.data?.clients?.pageInfo;

    section.jobberCount += clients.length;

    for (const client of clients) {
      const local = localCustomers.get(client.id);

      if (!local) {
        recordMissing(section, client.id);

        if (apply) {
          try {
            await syncSingleCustomer(client.id);
            section.gapFilled += 1;
          } catch (error) {
            section.gapFillErrors.push(
              `${client.id}: ${error instanceof Error ? error.message : "unknown error"}`
            );
          }
        }

        continue;
      }

      // The last chance to recover real history — customers.created_at
      // (migration 065) has been stuck at "whenever that migration ran"
      // for the whole pre-existing customer base ever since, since
      // nothing has ever backfilled it from Jobber's real client.createdAt
      // before now. Only touches still-Jobber-sourced rows: a native
      // customer's created_at is already correct (set at insert time),
      // and source='jobber' naturally excludes it.
      if (apply && local.source === "jobber" && client.createdAt) {
        const { error } = await supabaseServer
          .from("customers")
          .update({ created_at: client.createdAt })
          .eq("jobber_client_id", client.id);

        if (error) {
          createdAtBackfillErrors.push(`${client.id}: ${error.message}`);
        } else {
          createdAtBackfilled += 1;
        }
      }
    }

    hasNextPage = pageInfo?.hasNextPage ?? false;
    cursor = pageInfo?.endCursor ?? null;

    if (hasNextPage && !cursor) {
      warnings.push(
        `Jobber reported another customer page after page ${pageNumber}, but no cursor was returned.`
      );
      break;
    }

    if (hasNextPage) {
      await sleep(750);
    }
  }

  return { ...section, createdAtBackfilled, createdAtBackfillErrors };
}

// ---------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------

type AuditLineItem = {
  name: string | null;
  unitPrice: number | string | null;
  quantity: number | string | null;
};

type AuditJob = {
  id: string;
  title: string | null;
  jobType: string | null;
  instructions: string | null;
  lineItems: { nodes: AuditLineItem[] } | null;
};

type JobsAuditPage = {
  jobs: { nodes: AuditJob[]; pageInfo: PageInfo };
};

const JOBS_AUDIT_QUERY = `
  query GetJobsForAudit($limit: Int!, $cursor: String) {
    jobs(first: $limit, after: $cursor) {
      nodes {
        id
        title
        jobType
        instructions
        lineItems(first: 50) {
          nodes {
            name
            unitPrice
            quantity
          }
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

async function auditJobs(
  apply: boolean,
  localJobs: Map<string, LocalJobRow>,
  visitsByJobId: Map<string, LocalVisitRow[]>,
  warnings: string[]
): Promise<JobberMigrationAuditResult["jobs"]> {
  const section = newSection();
  section.localCount = localJobs.size;

  let instructionsBackfilled = 0;
  const instructionsBackfillErrors: string[] = [];
  let lineItemsSnapshotted = 0;
  const lineItemsSnapshotErrors: string[] = [];
  const jobsWithMultipleLineItems: { jobberJobId: string; lineItemCount: number }[] = [];
  const recurringCadenceCannotBeInferred: CadenceGuess[] = [];
  const recurringCadenceOutsideEnum: CadenceGuess[] = [];

  let cursor: string | null = null;
  let hasNextPage = true;
  let pageNumber = 0;

  while (hasNextPage) {
    pageNumber += 1;

    if (pageNumber > 300) {
      warnings.push("Job audit stopped after 300 pages for safety.");
      break;
    }

    const { response } = await fetchPageWithThrottleRetry<JobsAuditPage>(
      () =>
        jobberGraphQL<JobsAuditPage>(JOBS_AUDIT_QUERY, {
          limit: 50,
          cursor,
        }),
      { pageNumber, label: "job audit page" }
    );

    if (response.errors?.length) {
      throw new Error(
        response.errors.map((e) => e.message).join(", ") ||
          `Jobber failed on job audit page ${pageNumber}.`
      );
    }

    const jobs = response.data?.jobs?.nodes ?? [];
    const pageInfo = response.data?.jobs?.pageInfo;

    section.jobberCount += jobs.length;

    for (const job of jobs) {
      const lineItems = job.lineItems?.nodes ?? [];

      if (lineItems.length > 1) {
        jobsWithMultipleLineItems.push({
          jobberJobId: job.id,
          lineItemCount: lineItems.length,
        });
      }

      const local = localJobs.get(job.id);

      if (!local) {
        recordMissing(section, job.id);

        if (apply) {
          try {
            await syncSingleJob(job.id);
            section.gapFilled += 1;
          } catch (error) {
            section.gapFillErrors.push(
              `${job.id}: ${error instanceof Error ? error.message : "unknown error"}`
            );
          }
        }

        continue;
      }

      if (local.source === "jobber") {
        if (apply) {
          if (!local.instructions && job.instructions?.trim()) {
            const { error } = await supabaseServer
              .from("jobber_jobs")
              .update({ instructions: job.instructions.trim() })
              .eq("jobber_job_id", job.id);

            if (error) {
              instructionsBackfillErrors.push(`${job.id}: ${error.message}`);
            } else {
              instructionsBackfilled += 1;
            }
          }

          // Best-effort: jobber_line_items_snapshot (migration 068) may
          // not exist yet if apply mode is run before that migration —
          // fails this one job, not the whole audit. See this file's
          // header comment for the intended run order.
          const snapshot = lineItems.map((item) => ({
            name: item.name,
            unitPrice: item.unitPrice != null ? Number(item.unitPrice) : null,
            quantity: item.quantity != null ? Number(item.quantity) : null,
          }));

          const { error: snapshotError } = await supabaseServer
            .from("jobber_jobs")
            .update({ jobber_line_items_snapshot: snapshot })
            .eq("jobber_job_id", job.id);

          if (snapshotError) {
            lineItemsSnapshotErrors.push(`${job.id}: ${snapshotError.message}`);
          } else {
            lineItemsSnapshotted += 1;
          }
        }

        if (job.jobType?.toLowerCase().includes("recur")) {
          const visits = (visitsByJobId.get(job.id) ?? [])
            .filter((v) => v.start_at)
            .sort(
              (a, b) =>
                new Date(a.start_at as string).getTime() -
                new Date(b.start_at as string).getTime()
            );

          if (visits.length < 2) {
            recurringCadenceCannotBeInferred.push({
              jobberJobId: job.id,
              localTitle: job.title,
              visitCount: visits.length,
              medianGapDays: null,
              guess: null,
            });
          } else {
            const gaps: number[] = [];
            for (let i = 1; i < visits.length; i++) {
              gaps.push(
                daysBetween(
                  visits[i - 1].start_at as string,
                  visits[i].start_at as string
                )
              );
            }

            const medianGap = median(gaps);
            const guess = medianGap !== null ? guessCadence(medianGap) : null;

            if (guess === null) {
              recurringCadenceOutsideEnum.push({
                jobberJobId: job.id,
                localTitle: job.title,
                visitCount: visits.length,
                medianGapDays: medianGap,
                guess: null,
              });
            }
          }
        }
      }
    }

    hasNextPage = pageInfo?.hasNextPage ?? false;
    cursor = pageInfo?.endCursor ?? null;

    if (hasNextPage && !cursor) {
      warnings.push(
        `Jobber reported another job page after page ${pageNumber}, but no cursor was returned.`
      );
      break;
    }

    if (hasNextPage) {
      await sleep(750);
    }
  }

  return {
    ...section,
    instructionsBackfilled,
    instructionsBackfillErrors,
    lineItemsSnapshotted,
    lineItemsSnapshotErrors,
    jobsWithMultipleLineItems,
    recurringCadenceCannotBeInferred,
    recurringCadenceOutsideEnum,
  };
}

// ---------------------------------------------------------------------
// Visits — id-only existence check (VISIT_AUDIT_QUERY is deliberately
// cheap; full detail is only ever fetched per-id by syncSingleVisit
// during gap-fill).
// ---------------------------------------------------------------------

type AuditVisit = {
  id: string;
};

type VisitsAuditPage = {
  visits: { nodes: AuditVisit[]; pageInfo: PageInfo };
};

const VISITS_AUDIT_QUERY = `
  query GetVisitsForAudit($limit: Int!, $cursor: String) {
    visits(first: $limit, after: $cursor) {
      nodes {
        id
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

async function auditVisits(
  apply: boolean,
  localVisits: Map<string, LocalVisitRow>,
  warnings: string[]
): Promise<AuditSection> {
  const section = newSection();
  section.localCount = localVisits.size;

  let cursor: string | null = null;
  let hasNextPage = true;
  let pageNumber = 0;

  while (hasNextPage) {
    pageNumber += 1;

    if (pageNumber > 500) {
      warnings.push("Visit audit stopped after 500 pages for safety.");
      break;
    }

    const { response } = await fetchPageWithThrottleRetry<VisitsAuditPage>(
      () =>
        jobberGraphQL<VisitsAuditPage>(VISITS_AUDIT_QUERY, {
          limit: 100,
          cursor,
        }),
      { pageNumber, label: "visit audit page" }
    );

    if (response.errors?.length) {
      throw new Error(
        response.errors.map((e) => e.message).join(", ") ||
          `Jobber failed on visit audit page ${pageNumber}.`
      );
    }

    const visits = response.data?.visits?.nodes ?? [];
    const pageInfo = response.data?.visits?.pageInfo;

    section.jobberCount += visits.length;

    for (const visit of visits) {
      if (!localVisits.has(visit.id)) {
        recordMissing(section, visit.id);

        if (apply) {
          try {
            await syncSingleVisit(visit.id);
            section.gapFilled += 1;
          } catch (error) {
            section.gapFillErrors.push(
              `${visit.id}: ${error instanceof Error ? error.message : "unknown error"}`
            );
          }
        }
      }
    }

    hasNextPage = pageInfo?.hasNextPage ?? false;
    cursor = pageInfo?.endCursor ?? null;

    if (hasNextPage && !cursor) {
      warnings.push(
        `Jobber reported another visit page after page ${pageNumber}, but no cursor was returned.`
      );
      break;
    }

    if (hasNextPage) {
      await sleep(500);
    }
  }

  return section;
}

// ---------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------

export async function runJobberMigrationAudit(
  options: JobberMigrationAuditOptions = {}
): Promise<JobberMigrationAuditResult> {
  const apply = options.apply ?? false;
  const startedAt = new Date().toISOString();
  const warnings: string[] = [];

  const [localCustomerRows, localJobRows, localVisitRows] = await Promise.all([
    fetchAllLocalRows<LocalCustomerRow>("customers", "jobber_client_id, source"),
    fetchAllLocalRows<LocalJobRow>("jobber_jobs", "jobber_job_id, source, instructions"),
    fetchAllLocalRows<LocalVisitRow>(
      "jobber_visits",
      "jobber_visit_id, jobber_job_id, source, start_at"
    ),
  ]);

  const localCustomers = new Map(
    localCustomerRows.map((row) => [row.jobber_client_id, row])
  );
  const localJobs = new Map(localJobRows.map((row) => [row.jobber_job_id, row]));
  const localVisits = new Map(
    localVisitRows.map((row) => [row.jobber_visit_id, row])
  );

  const visitsByJobId = new Map<string, LocalVisitRow[]>();
  for (const visit of localVisitRows) {
    if (!visit.jobber_job_id) continue;
    const existing = visitsByJobId.get(visit.jobber_job_id);
    if (existing) {
      existing.push(visit);
    } else {
      visitsByJobId.set(visit.jobber_job_id, [visit]);
    }
  }

  // Sequential, not parallel — Jobber's own rate limiting (see
  // lib/jobber.ts / lib/jobberSyncTracking.ts's throttle handling) is
  // shared across all three, so running them concurrently would just
  // mean all three fighting over the same throttle budget instead of
  // each getting their own retry backoff.
  const customers = await auditCustomers(apply, localCustomers, warnings);
  const jobs = await auditJobs(apply, localJobs, visitsByJobId, warnings);
  const visits = await auditVisits(apply, localVisits, warnings);

  return {
    apply,
    startedAt,
    finishedAt: new Date().toISOString(),
    customers,
    jobs,
    visits,
    warnings,
  };
}
