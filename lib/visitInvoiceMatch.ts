// Visits and invoices are not reliably linked in the data:
// jobber_visits.jobber_invoice_id is only sometimes populated, and many
// customers pay one invoice in advance for the whole month (paid on the
// 1st, 10th or 15th) that covers every visit in that month.
//
// Order of trust:
//   1. The visit's own jobber_invoice_id, when set.
//   2. Otherwise every invoice dated in the same month as the visit.
//
// When one invoice covers several visits its amount is split evenly
// across them, so a $350 monthly invoice over two visits is $175 per
// visit. Visits with no invoice in their month stay unlinked.

export type MatchVisit = {
  visitId: string;
  invoiceId: string | null;
  // Phoenix month of the visit, YYYY-MM.
  month: string | null;
};

export type MatchInvoice = {
  invoiceId: string;
  // YYYY-MM-DD, already a Phoenix calendar date.
  date: string | null;
};

export type VisitInvoiceMatch = {
  invoiceIds: string[];
  // Parallel to invoiceIds: how many visits share that invoice (this one included).
  visitCounts: number[];
  method: "direct" | "month" | "none";
};

function monthOf(value: string | null): string | null {
  if (!value) return null;
  const month = value.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(month) ? month : null;
}

export function matchVisitsToInvoices(
  visits: MatchVisit[],
  invoices: MatchInvoice[]
): Map<string, VisitInvoiceMatch> {
  const invoicesByMonth = new Map<string, string[]>();
  for (const invoice of invoices) {
    const month = monthOf(invoice.date);
    if (!month) continue;
    const list = invoicesByMonth.get(month) ?? [];
    list.push(invoice.invoiceId);
    invoicesByMonth.set(month, list);
  }

  const attached = new Map<string, string[]>();
  const picks = new Map<string, { ids: string[]; method: "direct" | "month" | "none" }>();

  for (const visit of visits) {
    let ids: string[] = [];
    let method: "direct" | "month" | "none" = "none";

    if (visit.invoiceId) {
      ids = [visit.invoiceId];
      method = "direct";
    } else if (visit.month) {
      ids = invoicesByMonth.get(visit.month) ?? [];
      method = ids.length > 0 ? "month" : "none";
    }

    picks.set(visit.visitId, { ids, method });
    for (const id of ids) {
      const list = attached.get(id) ?? [];
      list.push(visit.visitId);
      attached.set(id, list);
    }
  }

  const result = new Map<string, VisitInvoiceMatch>();
  for (const [visitId, pick] of picks) {
    result.set(visitId, {
      invoiceIds: pick.ids,
      visitCounts: pick.ids.map((id) => attached.get(id)?.length ?? 1),
      method: pick.method,
    });
  }
  return result;
}

export type InvoiceAllocation = {
  hasInvoice: boolean;
  // This visit's share of the linked invoices.
  billed: number;
  collected: number;
  // Whole linked invoices, not split, for deciding paid or unpaid.
  invoiceTotal: number;
  invoiceCollected: number;
  shared: boolean;
};

export function allocateInvoices(
  match: VisitInvoiceMatch | undefined,
  totalById: Map<string, number>,
  collectedById: Map<string, number>
): InvoiceAllocation {
  const empty: InvoiceAllocation = {
    hasInvoice: false,
    billed: 0,
    collected: 0,
    invoiceTotal: 0,
    invoiceCollected: 0,
    shared: false,
  };
  if (!match) return empty;

  const known = match.invoiceIds
    .map((id, index) => ({ id, count: Math.max(1, match.visitCounts[index] ?? 1) }))
    .filter((entry) => totalById.has(entry.id));
  if (known.length === 0) return empty;

  let billed = 0;
  let collected = 0;
  let invoiceTotal = 0;
  let invoiceCollected = 0;
  for (const entry of known) {
    const total = totalById.get(entry.id) ?? 0;
    const paid = collectedById.get(entry.id) ?? 0;
    billed += total / entry.count;
    collected += paid / entry.count;
    invoiceTotal += total;
    invoiceCollected += paid;
  }

  return {
    hasInvoice: true,
    billed,
    collected,
    invoiceTotal,
    invoiceCollected,
    shared: known.some((entry) => entry.count > 1),
  };
}
