export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { notFound } from "next/navigation";
import PhotoGrid from "@/app/components/PhotoGrid";
import { getContactHistoryForCustomer } from "@/lib/contactHistory";
import {
  type CustomerVisit,
  formatDurationMinutes,
  getEquipmentList,
  getMaterialsList,
  loadVisitFinancials,
} from "@/lib/customerVisitData";
import { formatCurrencyPrecise, formatDateOnly, toNumber } from "@/lib/format";
import { toPhoenixDateString } from "@/lib/phoenixDate";
import { allocateInvoices } from "@/lib/visitInvoiceMatch";
import {
  PROFIT_TRACKING_START_LABEL,
  isProfitTracked,
} from "@/lib/profitTracking";
import {
  getClientInvoiceRows,
  getClientVisitLinks,
  getNativeInvoiceExtras,
  getPaymentsForInvoices,
  getVisitAutomationEvents,
  getVisitRow,
  getVisitTimeLogs,
  linkVisitsToInvoices,
} from "@/lib/visitDetail";
import {
  buildCostSplit,
  paymentState,
  visitFlags,
  type VisitPaymentState,
} from "@/lib/visitDetailLogic";
import { getVisitNotesForClient } from "@/lib/visitNotes";

const MARGIN_TARGET_PCT = 60;

const SEGMENT_COLORS: Record<string, string> = {
  labor: "#174734",
  materials: "#3f7d5b",
  equipment: "#7fb08f",
  overhead: "#b9b08a",
  cardFee: "#d9c27a",
  profit: "#9c7a20",
};

type PageProps = {
  params: Promise<{ id: string; visitId: string }>;
};

function formatWhen(value: string | null | undefined): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDay(value: string | null | undefined): string {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function statusLabel(value: string | null): string {
  if (!value) return "Unknown";
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function stateChip(state: VisitPaymentState): { label: string; className: string } {
  switch (state) {
    case "paid":
      return { label: "Paid", className: "bg-green-100 text-green-800" };
    case "partial":
      return { label: "Partly paid", className: "bg-amber-100 text-amber-800" };
    case "unpaid":
      return { label: "Unpaid", className: "bg-amber-100 text-amber-800" };
    default:
      return { label: "No invoice linked", className: "bg-gray-100 text-gray-700" };
  }
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn";
}) {
  const color =
    tone === "good" ? "text-green-700" : tone === "warn" ? "text-amber-700" : "text-[#174734]";
  return (
    <div className="rounded-2xl bg-white p-4 shadow">
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#9c7a20]">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-extrabold ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[#6b705c]">{sub}</p>}
    </div>
  );
}

export default async function VisitDetailPage({ params }: PageProps) {
  const { id, visitId } = await params;
  const clientId = decodeURIComponent(id);
  const decodedVisitId = decodeURIComponent(visitId);

  const visitRow = await getVisitRow(decodedVisitId);
  if (!visitRow || visitRow.jobber_client_id !== clientId) notFound();

  const [
    visitLinks,
    invoiceRows,
    materialsList,
    equipmentList,
    noteGroups,
    contactHistory,
    timeLogs,
    automationEvents,
  ] = await Promise.all([
    getClientVisitLinks(clientId),
    getClientInvoiceRows(clientId),
    getMaterialsList(),
    getEquipmentList(),
    getVisitNotesForClient(clientId),
    getContactHistoryForCustomer(clientId),
    getVisitTimeLogs(decodedVisitId),
    getVisitAutomationEvents(decodedVisitId),
  ]);

  const todayYmd = toPhoenixDateString(new Date().toISOString()) ?? "";
  const matches = linkVisitsToInvoices(visitLinks, invoiceRows, todayYmd);
  const match = matches.get(decodedVisitId) ?? {
    invoiceIds: [] as string[],
    visitCounts: [] as number[],
    method: "none" as const,
  };
  const linkedInvoices = match.invoiceIds
    .map((invoiceId) => invoiceRows.find((row) => row.jobber_invoice_id === invoiceId))
    .filter((row): row is NonNullable<typeof row> => !!row);
  const linkedInvoiceIds = linkedInvoices.map((row) => row.jobber_invoice_id);

  const asCustomerVisit: CustomerVisit = {
    jobber_visit_id: visitRow.jobber_visit_id,
    title: visitRow.title,
    visit_status: visitRow.visit_status,
    start_at: visitRow.start_at,
    completed_at: visitRow.completed_at,
  };

  const [financials, paymentsByInvoice, extrasList] = await Promise.all([
    loadVisitFinancials({
      visits: [asCustomerVisit],
      customerId: clientId,
      materialsList,
      equipmentList,
    }),
    getPaymentsForInvoices(linkedInvoiceIds),
    Promise.all(linkedInvoiceIds.map((invoiceId) => getNativeInvoiceExtras(invoiceId))),
  ]);
  const extrasById = new Map(linkedInvoiceIds.map((invoiceId, i) => [invoiceId, extrasList[i]]));
  const rating = extrasList.find((extras) => extras.rating !== null)?.rating ?? null;

  const breakdown = financials.breakdownMap.get(decodedVisitId);
  const completed = (visitRow.visit_status ?? "").toUpperCase() === "COMPLETED" || !!visitRow.completed_at;
  const tracked = isProfitTracked(visitRow.start_at);

  const payments = linkedInvoiceIds
    .flatMap((invoiceId) => paymentsByInvoice.get(invoiceId) ?? [])
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const collectedById = new Map<string, number>();
  for (const invoiceId of linkedInvoiceIds) {
    collectedById.set(
      invoiceId,
      (paymentsByInvoice.get(invoiceId) ?? [])
        .filter((p) => p.collected)
        .reduce((sum, p) => sum + p.amount, 0)
    );
  }
  const totalById = new Map(linkedInvoices.map((row) => [row.jobber_invoice_id, toNumber(row.total)]));
  const allocation = allocateInvoices(match, totalById, collectedById);
  const hasInvoice = allocation.hasInvoice;
  const billed = hasInvoice ? allocation.billed : null;
  const collected = allocation.collected;
  const tips = payments.filter((p) => p.collected).reduce((sum, p) => sum + p.tip, 0);
  const state = paymentState(
    hasInvoice ? allocation.invoiceTotal : null,
    allocation.invoiceCollected,
    hasInvoice
  );
  const invoiceNumbers = linkedInvoices
    .map((row) => row.invoice_number)
    .filter((value): value is string => !!value)
    .join(", ");
  const maxShare = Math.max(1, ...match.visitCounts);

  const costs = {
    labor: breakdown?.laborTotal ?? 0,
    materials: breakdown?.materialTotal ?? 0,
    equipment: breakdown?.equipmentTotal ?? 0,
    overhead: breakdown?.overheadTotal ?? 0,
    cardFee: breakdown?.processingFeeTotal ?? 0,
  };
  const split = buildCostSplit(billed, costs, tracked);
  const hasCosts = split.cost > 0;

  const notes = noteGroups
    .filter((group) => group.jobberVisitId === decodedVisitId)
    .flatMap((group) => group.notes);
  const photos = notes.flatMap((note) =>
    note.photoUrls.map((url) => ({ url }))
  );

  const flags = visitFlags({
    completed,
    photoCount: photos.length,
    margin: split.margin,
    marginTarget: MARGIN_TARGET_PCT,
    state,
    hasInvoice,
  });

  // Previous / next visit for this customer (links list is newest first).
  const index = visitLinks.findIndex((v) => v.jobber_visit_id === decodedVisitId);
  const newer = index > 0 ? visitLinks[index - 1] : null;
  const older = index >= 0 && index < visitLinks.length - 1 ? visitLinks[index + 1] : null;

  const duration = financials.displayDurationMap.get(decodedVisitId);
  const crew = financials.assignedNamesMap.get(decodedVisitId) ?? [];

  // Messages near the visit: from 5 days before to 3 days after.
  const startMs = visitRow.start_at ? new Date(visitRow.start_at).getTime() : null;
  const nearbyMessages =
    startMs === null
      ? []
      : contactHistory.filter((entry) => {
          const ms = new Date(entry.createdAt).getTime();
          return ms >= startMs - 5 * 86_400_000 && ms <= startMs + 3 * 86_400_000;
        });

  type TimelineEvent = { at: string; label: string; detail?: string; dateOnly?: boolean };
  const timeline: TimelineEvent[] = [];
  if (visitRow.start_at) timeline.push({ at: visitRow.start_at, label: "Scheduled start" });
  for (const log of timeLogs) {
    timeline.push({ at: log.startedAt, label: `${log.userName} started the timer` });
    if (log.stoppedAt) timeline.push({ at: log.stoppedAt, label: `${log.userName} stopped the timer` });
  }
  if (visitRow.completed_at) timeline.push({ at: visitRow.completed_at, label: "Marked complete" });
  for (const invoice of linkedInvoices) {
    if (!invoice.issue_date) continue;
    timeline.push({
      at: invoice.issue_date,
      dateOnly: true,
      label: `Invoice ${invoice.invoice_number ?? ""} issued`.replace("  ", " "),
      detail: formatCurrencyPrecise(toNumber(invoice.total)),
    });
  }
  for (const payment of payments) {
    if (payment.date) {
      timeline.push({
        at: payment.date,
        dateOnly: true,
        label: payment.collected ? "Payment received" : "Payment attempt did not go through",
        detail: formatCurrencyPrecise(payment.amount),
      });
    }
  }
  for (const event of automationEvents) timeline.push({ at: event.at, label: event.label });
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  const customerName = visitRow.customer_name ?? "Customer";
  const dateLabel = formatDay(visitRow.start_at);
  const chip = stateChip(state);

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/customers/${encodeURIComponent(clientId)}?tab=visits`}
            className="text-sm font-semibold text-[#7a5f12]"
          >
            Customers / {customerName} / Visits
          </Link>
          <div className="flex gap-2">
            {older ? (
              <Link
                href={`/customers/${encodeURIComponent(clientId)}/visits/${encodeURIComponent(older.jobber_visit_id)}`}
                className="rounded-xl border border-[#174734] px-4 py-2 text-sm font-bold"
              >
                Older visit
              </Link>
            ) : null}
            {newer ? (
              <Link
                href={`/customers/${encodeURIComponent(clientId)}/visits/${encodeURIComponent(newer.jobber_visit_id)}`}
                className="rounded-xl border border-[#174734] px-4 py-2 text-sm font-bold"
              >
                Newer visit
              </Link>
            ) : null}
          </div>
        </div>

        <section className="rounded-2xl bg-white p-5 shadow sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#9c7a20]">
            Visit
          </p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
            {visitRow.title ?? "Visit"} on {dateLabel}
          </h1>
          <p className="mt-1 text-sm text-[#6b705c]">
            {customerName}
            {visitRow.job_number ? ` | Job #${visitRow.job_number}` : ""} | {formatWhen(visitRow.start_at)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
              {statusLabel(visitRow.visit_status)}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${chip.className}`}>
              {chip.label}
            </span>
            {flags
              .filter((flag) => flag !== "Unpaid")
              .map((flag) => (
                <span
                  key={flag}
                  className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800"
                >
                  {flag}
                </span>
              ))}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Billed"
            value={billed !== null ? formatCurrencyPrecise(billed) : "-"}
            sub={
              hasInvoice
                ? allocation.shared
                  ? `Share of invoice ${invoiceNumbers} (${formatCurrencyPrecise(allocation.invoiceTotal)} over ${maxShare} visits)`.replace("invoice  ", "invoice ")
                  : `Invoice ${invoiceNumbers}`.trim()
                : "No invoice for this month"
            }
          />
          <Kpi
            label="Collected"
            value={hasInvoice ? formatCurrencyPrecise(collected) : "-"}
            sub={
              state === "paid"
                ? "Paid in full"
                : hasInvoice
                  ? `${formatCurrencyPrecise(Math.max(0, allocation.invoiceTotal - allocation.invoiceCollected))} still due on the invoice`
                  : undefined
            }
            tone={state === "paid" ? "good" : state === "no-invoice" ? undefined : "warn"}
          />
          <Kpi
            label="Total cost"
            value={tracked || hasCosts ? formatCurrencyPrecise(split.cost) : "Not tracked"}
            sub={tracked ? "Labor, materials, equipment, overhead, card fee" : `Cost tracking began ${PROFIT_TRACKING_START_LABEL}`}
          />
          <Kpi
            label="Profit"
            value={split.profit !== null ? formatCurrencyPrecise(split.profit) : "Not tracked"}
            sub={
              split.margin !== null
                ? `${split.margin}% margin`
                : tracked
                  ? "Needs a linked invoice"
                  : `Before ${PROFIT_TRACKING_START_LABEL}`
            }
            tone={split.margin === null ? undefined : split.margin >= MARGIN_TARGET_PCT ? "good" : "warn"}
          />
        </div>

        <section className="rounded-2xl bg-white p-5 shadow">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">
              {billed !== null && tracked
                ? `Where the ${formatCurrencyPrecise(billed)} went`
                : "Costs for this visit"}
            </h2>
            <Link
              href={`/customers/${encodeURIComponent(clientId)}?tab=visits`}
              className="text-sm font-semibold text-[#7a5f12]"
            >
              Edit materials and equipment on the Visits tab
            </Link>
          </div>

          {!tracked && !hasCosts ? (
            <p className="mt-3 text-sm text-[#6b705c]">
              Cost and profit tracking started in {PROFIT_TRACKING_START_LABEL}, so this
              visit shows billing only.
            </p>
          ) : (
            <>
              <div className="mt-4 flex h-5 w-full overflow-hidden rounded-full bg-[#ece8da]">
                {split.segments
                  .filter((segment) => segment.percent > 0)
                  .map((segment) => (
                    <div
                      key={segment.key}
                      title={`${segment.label} ${formatCurrencyPrecise(segment.amount)}`}
                      style={{
                        width: `${Math.min(100, segment.percent)}%`,
                        backgroundColor: SEGMENT_COLORS[segment.key],
                      }}
                    />
                  ))}
              </div>
              <ul className="mt-4 divide-y divide-[#f0eee6] text-sm">
                {split.segments.map((segment) => (
                  <li key={segment.key} className="flex items-center justify-between py-2">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-sm"
                        style={{ backgroundColor: SEGMENT_COLORS[segment.key] }}
                      />
                      {segment.label}
                    </span>
                    <span className={segment.key === "profit" ? "font-extrabold" : "font-semibold"}>
                      {formatCurrencyPrecise(segment.amount)}
                      {billed !== null && tracked ? (
                        <span className="ml-2 text-xs font-normal text-[#6b705c]">
                          {Math.round(segment.percent)}%
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
              {breakdown &&
                [...breakdown.laborLines, ...breakdown.materialLines, ...breakdown.equipmentLines]
                  .length > 0 && (
                  <div className="mt-4 rounded-xl bg-[#f7f6f1] p-3 text-xs text-[#4d5242]">
                    <p className="font-bold uppercase tracking-[0.08em] text-[#9c7a20]">
                      Line detail
                    </p>
                    <ul className="mt-2 space-y-1">
                      {[...breakdown.laborLines, ...breakdown.materialLines, ...breakdown.equipmentLines].map(
                        (line, i) => (
                          <li key={`${line.label}-${i}`} className="flex justify-between gap-3">
                            <span>
                              {line.label}
                              {line.quantity > 1 || line.unitLabel
                                ? ` (${line.quantity} ${line.unitLabel})`.replace("  ", " ")
                                : ""}
                            </span>
                            <span>{formatCurrencyPrecise(line.cost)}</span>
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}
            </>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl bg-white p-5 shadow">
            <h2 className="text-lg font-bold">Invoice</h2>
            {linkedInvoices.length > 0 ? (
              <div className="mt-3 space-y-4 text-sm">
                {linkedInvoices.map((invoice) => {
                  const extras = extrasById.get(invoice.jobber_invoice_id);
                  const total = toNumber(invoice.total);
                  const paid = collectedById.get(invoice.jobber_invoice_id) ?? 0;
                  const invoiceChip = stateChip(paymentState(total, paid, true));
                  return (
                    <div key={invoice.jobber_invoice_id} className="space-y-2">
                      <p className="font-semibold">
                        Invoice {invoice.invoice_number ?? ""}{" "}
                        <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${invoiceChip.className}`}>
                          {invoiceChip.label}
                        </span>
                      </p>
                      {invoice.subject && <p className="text-[#6b705c]">{invoice.subject}</p>}
                      <p>
                        Issued {formatDateOnly(invoice.issue_date)} | Due {formatDateOnly(invoice.due_date)}
                      </p>
                      <p className="text-lg font-extrabold">{formatCurrencyPrecise(total)}</p>
                      {extras && extras.lines.length > 0 && (
                        <ul className="divide-y divide-[#f0eee6] text-xs">
                          {extras.lines.map((line, i) => (
                            <li key={i} className="flex justify-between gap-3 py-1.5">
                              <span>{line.description}</span>
                              <span>{formatCurrencyPrecise(line.lineTotal)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
                {allocation.shared && (
                  <p className="text-xs text-[#6b705c]">
                    This invoice covers {maxShare} visits that month, so each visit counts an
                    equal share of it.
                  </p>
                )}
                {match.method === "month" && (
                  <p className="text-xs text-[#6b705c]">
                    Matched by month, since this invoice is dated in the same month as the visit.
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[#6b705c]">
                No invoice is dated in this visit&apos;s month, and none is linked directly.
              </p>
            )}
          </section>

          <section className="rounded-2xl bg-white p-5 shadow">
            <h2 className="text-lg font-bold">Payment</h2>
            {payments.length > 0 ? (
              <ul className="mt-3 divide-y divide-[#f0eee6] text-sm">
                {payments.map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      {formatDateOnly(payment.date)}
                      <span className="ml-2 text-xs text-[#6b705c]">
                        {payment.method ? statusLabel(payment.method) : "Payment"}
                        {!payment.collected ? " (did not go through)" : ""}
                      </span>
                    </span>
                    <span className="font-semibold">{formatCurrencyPrecise(payment.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[#6b705c]">
                {hasInvoice ? "No payment recorded for this invoice yet." : "Nothing to pay until an invoice is linked."}
              </p>
            )}
            {tips > 0 && (
              <p className="mt-2 text-xs text-[#6b705c]">
                Tips included: {formatCurrencyPrecise(tips)}
              </p>
            )}
            {rating !== null && (
              <p className="mt-3 text-sm">
                Customer rating: <span className="font-bold">{rating} of 5 stars</span>
              </p>
            )}
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl bg-white p-5 shadow">
            <h2 className="text-lg font-bold">Crew and time</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[#6b705c]">Assigned</dt>
                <dd className="font-semibold">{crew.length > 0 ? crew.join(", ") : "Nobody assigned"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#6b705c]">On site</dt>
                <dd className="font-semibold">
                  {duration
                    ? `${formatDurationMinutes(duration.minutes)}${duration.source === "jobber" ? " (from Jobber)" : ""}`
                    : "Not recorded"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#6b705c]">Scheduled</dt>
                <dd className="font-semibold">
                  {formatTime(visitRow.start_at)}
                  {visitRow.end_at ? ` to ${formatTime(visitRow.end_at)}` : ""}
                </dd>
              </div>
            </dl>
            {timeLogs.length > 0 && (
              <ul className="mt-3 divide-y divide-[#f0eee6] text-xs">
                {timeLogs.map((log, i) => (
                  <li key={i} className="flex justify-between gap-3 py-1.5">
                    <span>{log.userName}</span>
                    <span>
                      {formatTime(log.startedAt)} to {log.stoppedAt ? formatTime(log.stoppedAt) : "still running"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl bg-white p-5 shadow">
            <h2 className="text-lg font-bold">Timeline</h2>
            {timeline.length === 0 ? (
              <p className="mt-3 text-sm text-[#6b705c]">Nothing recorded yet.</p>
            ) : (
              <ol className="mt-3 space-y-3 border-l-2 border-[#e4dfd0] pl-4 text-sm">
                {timeline.map((event, i) => (
                  <li key={i}>
                    <p className="font-semibold">
                      {event.label}
                      {event.detail ? ` | ${event.detail}` : ""}
                    </p>
                    <p className="text-xs text-[#6b705c]">
                      {event.dateOnly
                        ? formatDateOnly(event.at)
                        : `${formatDay(event.at)} ${formatTime(event.at)}`}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <section className="rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Photos and notes</h2>
          {photos.length > 0 ? (
            <div className="mt-3">
              <PhotoGrid photos={photos} />
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#6b705c]">No photos for this visit.</p>
          )}
          {notes.filter((note) => note.note).length > 0 && (
            <ul className="mt-4 space-y-3">
              {notes
                .filter((note) => note.note)
                .map((note) => (
                  <li key={note.id} className="rounded-xl bg-[#f7f6f1] p-3 text-sm">
                    <p className="whitespace-pre-wrap">{note.note}</p>
                    <p className="mt-1 text-xs text-[#6b705c]">
                      {note.authorName ?? "Team"} | {formatDay(note.createdAt)}
                    </p>
                  </li>
                ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-[#6b705c]">
            To add or edit notes and photos, use the Property and notes tab on the
            customer page.
          </p>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow">
          <h2 className="text-lg font-bold">Messages around this visit</h2>
          {nearbyMessages.length === 0 ? (
            <p className="mt-3 text-sm text-[#6b705c]">
              No texts, emails or calls from 5 days before to 3 days after this visit.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[#f0eee6] text-sm">
              {nearbyMessages.map((entry) => (
                <li key={entry.id} className="py-2">
                  <p className="font-semibold">
                    {entry.channel === "sms" ? "Text" : entry.channel === "call" ? "Call" : entry.channel === "chat" ? "Chat" : "Email"}{" "}
                    {entry.direction === "inbound" ? "from customer" : "to customer"}
                    {entry.subject ? `: ${entry.subject}` : ""}
                  </p>
                  {entry.summary && <p className="text-[#4d5242]">{entry.summary}</p>}
                  <p className="text-xs text-[#6b705c]">
                    {formatDay(entry.createdAt)} {formatTime(entry.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
