export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

type AuditAction = "create" | "update" | "delete";

type AuditChange = { before: unknown; after: unknown };

type AuditRow = {
  id: string;
  actor_name: string | null;
  actor_email: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  changes: Record<string, unknown> | null;
  created_at: string;
};

type AuditPageProps = {
  searchParams: Promise<{
    entity?: string;
    page?: string;
  }>;
};

// Keep in sync with the entityType strings passed to recordAuditLog()
// across the various actions.ts files — this is just the display layer.
const ENTITY_LABELS: Record<string, string> = {
  user: "Team Member",
  campaign: "Campaign",
  overhead_cost: "Overhead Cost",
  material: "Material",
  equipment: "Equipment",
  employee_rate: "Labor Rate",
  customer: "Customer Profile",
  role_permissions: "Role Permissions",
};

const ENTITY_TYPES = Object.keys(ENTITY_LABELS);
const PAGE_SIZE = 50;

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    timeZone: "America/Phoenix",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function actionBadgeClasses(action: AuditAction): string {
  switch (action) {
    case "create":
      return "bg-green-100 text-green-700";
    case "delete":
      return "bg-red-100 text-red-700";
    default:
      return "bg-[#f0ead9] text-[#9c7a20]";
  }
}

function pillClasses(active: boolean): string {
  return `rounded-xl px-4 py-2 text-sm font-bold transition ${
    active
      ? "bg-[#174734] text-white"
      : "border border-[#d8d3c6] bg-white text-[#174734] hover:bg-[#f7f6f1]"
  }`;
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const params = await searchParams;

  const entityFilter =
    params.entity && ENTITY_TYPES.includes(params.entity)
      ? params.entity
      : null;

  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabaseServer
    .from("audit_log")
    .select(
      "id, actor_name, actor_email, action, entity_type, entity_id, entity_label, changes, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (entityFilter) {
    query = query.eq("entity_type", entityFilter);
  }

  const { data, error, count } = await query;

  const rows = (data ?? []) as AuditRow[];
  const totalPages = count ? Math.max(1, Math.ceil(count / PAGE_SIZE)) : 1;

  function hrefFor(nextEntity: string | null, nextPage: number): string {
    const next = new URLSearchParams();

    if (nextEntity) {
      next.set("entity", nextEntity);
    }

    if (nextPage > 1) {
      next.set("page", String(nextPage));
    }

    const qs = next.toString();

    return `/audit${qs ? `?${qs}` : ""}`;
  }

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
            Valley Turf Revival OS
          </p>

          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Audit Log</h1>

          <p className="mt-2 max-w-2xl text-[#6b705c]">
            Who changed pricing, pay rates, campaign spend, and customer
            records, and what the value was before and after.
          </p>
        </header>

        <section className="mt-6 flex flex-wrap gap-2">
          <Link href={hrefFor(null, 1)} className={pillClasses(!entityFilter)}>
            All
          </Link>

          {ENTITY_TYPES.map((type) => (
            <Link
              key={type}
              href={hrefFor(type, 1)}
              className={pillClasses(entityFilter === type)}
            >
              {ENTITY_LABELS[type]}
            </Link>
          ))}
        </section>

        {error ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">
              Audit log could not be loaded
            </p>
            <p className="mt-1 text-sm text-red-600">{error.message}</p>
          </section>
        ) : rows.length === 0 ? (
          <section className="mt-6 rounded-2xl bg-white p-8 text-center shadow">
            <p className="text-[#6b705c]">
              No audit entries {entityFilter ? "for this type " : ""}yet.
            </p>
          </section>
        ) : (
          <section className="mt-6 space-y-3">
            {rows.map((row) => (
              <AuditRowItem key={row.id} row={row} />
            ))}
          </section>
        )}

        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between text-sm">
            <Link
              href={hrefFor(entityFilter, Math.max(1, page - 1))}
              className={`${pillClasses(false)} ${
                page <= 1 ? "pointer-events-none opacity-40" : ""
              }`}
            >
              ← Previous
            </Link>

            <span className="text-[#6b705c]">
              Page {page} of {totalPages}
            </span>

            <Link
              href={hrefFor(entityFilter, Math.min(totalPages, page + 1))}
              className={`${pillClasses(false)} ${
                page >= totalPages ? "pointer-events-none opacity-40" : ""
              }`}
            >
              Next →
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

function AuditRowItem({ row }: { row: AuditRow }) {
  const rawChanges = row.changes ?? {};
  const note = typeof rawChanges._note === "string" ? rawChanges._note : null;

  const changeEntries = Object.entries(rawChanges).filter(
    ([key]) => key !== "_note"
  ) as [string, AuditChange][];

  return (
    <details className="rounded-xl border border-[#e7e2d5] bg-white px-4 py-3">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold uppercase ${actionBadgeClasses(
            row.action
          )}`}
        >
          {row.action}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">
            {ENTITY_LABELS[row.entity_type] ?? row.entity_type}
            {row.entity_label ? `: ${row.entity_label}` : ""}
          </p>
          <p className="text-xs text-[#6b705c]">
            {row.actor_name ?? "Unknown"} · {formatDateTime(row.created_at)}
          </p>
        </div>
      </summary>

      <div className="mt-3 space-y-2 border-t border-[#e7e2d5] pt-3 text-sm">
        {note && <p className="text-[#6b705c]">{note}</p>}

        {changeEntries.length === 0 && !note && (
          <p className="text-[#9c9887]">No field-level changes recorded.</p>
        )}

        {changeEntries.map(([field, change]) => (
          <div key={field} className="flex flex-wrap items-baseline gap-2">
            <span className="font-semibold text-[#174734]">{field}:</span>
            <span className="text-[#9c4221] line-through">
              {formatValue(change.before)}
            </span>
            <span className="text-[#9c9887]">→</span>
            <span className="font-semibold text-[#174734]">
              {formatValue(change.after)}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}
