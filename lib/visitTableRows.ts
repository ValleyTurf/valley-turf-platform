// Row model for the customer page Visits tab. Pure, so the money rules
// (profit only since Aug 2026, never guess an invoice, don't let visits
// with no logged costs inflate the margin) are tested.
import { isProfitTracked, marginPercent } from "@/lib/profitTracking";
import {
  paymentState,
  visitFlags,
  type VisitPaymentState,
} from "@/lib/visitDetailLogic";

export type VisitRowInput = {
  visitId: string;
  startAt: string | null;
  title: string | null;
  completed: boolean;
  crew: string[];
  minutes: number | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  billed: number | null;
  collected: number;
  // Total cost from the visit's cost breakdown; 0 when nothing was logged.
  cost: number;
  photoCount: number;
};

export type VisitTableRow = {
  visitId: string;
  startAt: string | null;
  title: string | null;
  completed: boolean;
  crew: string[];
  minutes: number | null;
  invoiceNumber: string | null;
  hasInvoice: boolean;
  billed: number | null;
  state: VisitPaymentState;
  tracked: boolean;
  cost: number | null;
  profit: number | null;
  margin: number | null;
  flags: string[];
};

export type VisitTableTotals = {
  visitCount: number;
  billedAll: number;
  trackedCount: number;
  trackedBilled: number;
  trackedCost: number;
  trackedProfit: number;
  trackedMargin: number | null;
  unpaidCount: number;
  unpaidAmount: number;
};

export type VisitFilter = "all" | "attention" | "unpaid" | "low-margin";

export function isVisitFilter(value: string | undefined): value is VisitFilter {
  return value === "all" || value === "attention" || value === "unpaid" || value === "low-margin";
}

export function buildVisitRows(
  inputs: VisitRowInput[],
  marginTarget: number
): { rows: VisitTableRow[]; totals: VisitTableTotals } {
  const rows: VisitTableRow[] = inputs.map((input) => {
    const hasInvoice = input.invoiceId !== null && input.billed !== null;
    const state = paymentState(input.billed, input.collected, hasInvoice);
    const tracked = input.completed && isProfitTracked(input.startAt);
    const costLogged = input.cost > 0;
    const showProfit = tracked && hasInvoice && costLogged && (input.billed ?? 0) > 0;
    const profit = showProfit ? (input.billed as number) - input.cost : null;
    const margin = showProfit && profit !== null ? marginPercent(input.billed as number, profit) : null;

    const flags = visitFlags({
      completed: input.completed,
      photoCount: input.photoCount,
      margin,
      marginTarget,
      state,
      hasInvoice,
    });
    if (tracked && !costLogged) flags.push("No costs logged");

    return {
      visitId: input.visitId,
      startAt: input.startAt,
      title: input.title,
      completed: input.completed,
      crew: input.crew,
      minutes: input.minutes,
      invoiceNumber: input.invoiceNumber,
      hasInvoice,
      billed: input.billed,
      state,
      tracked,
      cost: tracked || costLogged ? input.cost : null,
      profit,
      margin,
      flags,
    };
  });

  let billedAll = 0;
  let trackedCount = 0;
  let trackedBilled = 0;
  let trackedCost = 0;
  let unpaidCount = 0;
  let unpaidAmount = 0;
  const byId = new Map(inputs.map((i) => [i.visitId, i]));

  for (const row of rows) {
    if (!row.completed) continue;
    if (row.billed !== null) billedAll += row.billed;
    if (row.state === "unpaid" || row.state === "partial") {
      unpaidCount += 1;
      const input = byId.get(row.visitId);
      unpaidAmount += Math.max(0, (row.billed ?? 0) - (input?.collected ?? 0));
    }
    if (row.profit !== null && row.billed !== null && row.cost !== null) {
      trackedCount += 1;
      trackedBilled += row.billed;
      trackedCost += row.cost;
    }
  }

  const trackedProfit = trackedBilled - trackedCost;

  return {
    rows,
    totals: {
      visitCount: rows.filter((r) => r.completed).length,
      billedAll,
      trackedCount,
      trackedBilled,
      trackedCost,
      trackedProfit,
      trackedMargin: marginPercent(trackedBilled, trackedProfit),
      unpaidCount,
      unpaidAmount,
    },
  };
}

export function filterRows(
  rows: VisitTableRow[],
  filter: VisitFilter
): VisitTableRow[] {
  switch (filter) {
    case "attention":
      return rows.filter((row) => row.flags.length > 0);
    case "unpaid":
      return rows.filter((row) => row.state === "unpaid" || row.state === "partial");
    case "low-margin":
      return rows.filter((row) => row.flags.includes("Low margin"));
    default:
      return rows;
  }
}
