// Visits and invoices are not reliably linked in the data:
// jobber_visits.jobber_invoice_id is only sometimes populated. This
// decides which invoice belongs to a visit, as safely as it can.
//
// Order of trust:
//   1. The visit's own jobber_invoice_id, when set.
//   2. Otherwise the single invoice dated in the same month, but only if
//      exactly one visit and one invoice in that month are still
//      unclaimed (the monthly-invoice convention). Anything ambiguous
//      stays unlinked rather than guessing.

export type MatchVisit = {
  visitId: string;
  startAt: string | null;
  invoiceId: string | null;
};

export type MatchInvoice = {
  invoiceId: string;
  // YYYY-MM-DD, already in Phoenix time (issue date, falling back to due date).
  date: string | null;
};

export type VisitInvoiceMatch = {
  invoiceId: string | null;
  method: "direct" | "month" | "none";
};

function monthOf(value: string | null): string | null {
  if (!value) return null;
  const month = value.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(month) ? month : null;
}

// visitMonth must be the visit's Phoenix month (YYYY-MM); callers pass
// startAt already converted, so this stays a pure string function.
export function matchVisitsToInvoices(
  visits: (MatchVisit & { month: string | null })[],
  invoices: MatchInvoice[]
): Map<string, VisitInvoiceMatch> {
  const result = new Map<string, VisitInvoiceMatch>();
  const claimed = new Set<string>();

  for (const visit of visits) {
    if (visit.invoiceId) {
      result.set(visit.visitId, { invoiceId: visit.invoiceId, method: "direct" });
      claimed.add(visit.invoiceId);
    }
  }

  const unlinkedByMonth = new Map<string, string[]>();
  for (const visit of visits) {
    if (result.has(visit.visitId)) continue;
    if (!visit.month) {
      result.set(visit.visitId, { invoiceId: null, method: "none" });
      continue;
    }
    const list = unlinkedByMonth.get(visit.month) ?? [];
    list.push(visit.visitId);
    unlinkedByMonth.set(visit.month, list);
  }

  const freeInvoicesByMonth = new Map<string, string[]>();
  for (const invoice of invoices) {
    if (claimed.has(invoice.invoiceId)) continue;
    const month = monthOf(invoice.date);
    if (!month) continue;
    const list = freeInvoicesByMonth.get(month) ?? [];
    list.push(invoice.invoiceId);
    freeInvoicesByMonth.set(month, list);
  }

  for (const [month, visitIds] of unlinkedByMonth) {
    const free = freeInvoicesByMonth.get(month) ?? [];
    if (visitIds.length === 1 && free.length === 1) {
      result.set(visitIds[0], { invoiceId: free[0], method: "month" });
    } else {
      for (const visitId of visitIds) {
        result.set(visitId, { invoiceId: null, method: "none" });
      }
    }
  }

  return result;
}
