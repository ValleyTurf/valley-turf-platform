// Pure view-model helpers for the visit detail page, kept out of the
// server-only loader so they can be tested directly.
import { marginPercent } from "@/lib/profitTracking";

export type CostTotals = {
  labor: number;
  materials: number;
  equipment: number;
  overhead: number;
  cardFee: number;
};

export type SplitSegment = {
  key: "labor" | "materials" | "equipment" | "overhead" | "cardFee" | "profit";
  label: string;
  amount: number;
  // Share of what was billed, 0..100, for the bar width.
  percent: number;
};

export function totalCost(costs: CostTotals): number {
  return costs.labor + costs.materials + costs.equipment + costs.overhead + costs.cardFee;
}

export function buildCostSplit(
  billed: number | null,
  costs: CostTotals,
  profitTracked: boolean
): { segments: SplitSegment[]; cost: number; profit: number | null; margin: number | null } {
  const cost = totalCost(costs);
  const canJudge = profitTracked && billed !== null && billed > 0;
  const profit = canJudge ? billed - cost : null;
  const margin = canJudge && profit !== null ? marginPercent(billed, profit) : null;

  const base = canJudge ? billed : cost;
  const pct = (amount: number) => (base > 0 ? Math.max(0, (amount / base) * 100) : 0);

  const segments: SplitSegment[] = [
    { key: "labor", label: "Labor", amount: costs.labor, percent: pct(costs.labor) },
    { key: "materials", label: "Materials", amount: costs.materials, percent: pct(costs.materials) },
    { key: "equipment", label: "Equipment", amount: costs.equipment, percent: pct(costs.equipment) },
    { key: "overhead", label: "Overhead share", amount: costs.overhead, percent: pct(costs.overhead) },
    { key: "cardFee", label: "Card processing fee", amount: costs.cardFee, percent: pct(costs.cardFee) },
  ];

  if (canJudge && profit !== null) {
    segments.push({ key: "profit", label: "Profit", amount: profit, percent: pct(profit) });
  }

  return { segments, cost, profit, margin };
}

// Payments that count as money received. Failed or declined attempts are
// kept out of "collected".
export function isCollectedPayment(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  if (!s) return true;
  return !(s.includes("fail") || s.includes("declin") || s.includes("void") || s.includes("refund"));
}

export type VisitPaymentState = "paid" | "partial" | "unpaid" | "no-invoice";

export function paymentState(
  invoiceTotal: number | null,
  collected: number,
  hasInvoice: boolean
): VisitPaymentState {
  if (!hasInvoice || invoiceTotal === null) return "no-invoice";
  if (invoiceTotal <= 0) return "paid";
  if (collected + 0.005 >= invoiceTotal) return "paid";
  if (collected > 0) return "partial";
  return "unpaid";
}

export type VisitFlag = string;

// Short "needs a look" flags shown on the Visits table and visit header.
export function visitFlags(input: {
  completed: boolean;
  photoCount: number;
  margin: number | null;
  marginTarget: number;
  state: VisitPaymentState;
  hasInvoice: boolean;
}): VisitFlag[] {
  const flags: VisitFlag[] = [];
  if (!input.completed) return flags;
  if (input.photoCount === 0) flags.push("No photos");
  if (!input.hasInvoice) flags.push("No invoice linked");
  if (input.margin !== null && input.margin < input.marginTarget) flags.push("Low margin");
  if (input.state === "unpaid" || input.state === "partial") flags.push("Unpaid");
  return flags;
}
