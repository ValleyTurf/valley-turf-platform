// Pure half of the "Leaving Jobber" report (lib/jobberExit.ts loads the
// data): decides who is still tied to Jobber and whether it is safe to
// cancel. Kept free of database imports so it can be checked by script.

export type ExitCustomer = {
  clientId: string;
  name: string;
  // customers.invoicing_mode_source: auto_has_card = Jobber had a card on
  // file for them when invoicing was sorted into native vs Jobber.
  modeSource: string | null;
};

export type ExitInvoice = {
  clientId: string | null;
  status: string | null;
  total: number;
  issueDate: string | null;
  invoiceNumber: string | null;
};

export type ExitPayment = {
  amount: number;
  paymentDate: string | null;
};

export type StillOnJobberCustomer = {
  clientId: string;
  name: string;
  openCount: number;
  openTotal: number;
  lastInvoiceDate: string | null;
  // Saved a card in this app (so they can be moved to native invoicing
  // without losing autopay).
  hasNativeCard: boolean;
  // Jobber had a card for them but this app does not.
  needsCardMoved: boolean;
};

export type JobberExitReport = {
  stillOnJobber: StillOnJobberCustomer[];
  openInvoiceCount: number;
  openInvoiceTotal: number;
  jobberPaymentsRecent: { count: number; total: number };
  blockers: string[];
  readyToCancel: boolean;
};

// Same permissive test the reminders and digest use: Jobber's synced
// statuses are uppercase, native ones lowercase.
export function isOpenInvoiceStatus(status: string | null): boolean {
  if (!status) return false;
  const upper = status.toUpperCase();
  return !upper.includes("PAID") && !upper.includes("VOID") && upper !== "DRAFT";
}

// A customer counts as "still on Jobber" when they invoice there (not
// moved to native) and either owe something there or were billed there
// recently.
export const RECENT_INVOICE_DAYS = 120;
export const RECENT_PAYMENT_DAYS = 30;

function daysAgoIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
}

export function buildExitReport(params: {
  // Customers whose invoicing is NOT yet native.
  jobberInvoicedCustomers: ExitCustomer[];
  // Invoices that live in Jobber (not mirrored native ones).
  jobberInvoices: ExitInvoice[];
  // Payments that arrived through Jobber (not mirrored native ones).
  jobberPayments: ExitPayment[];
  nativeCardClientIds: Set<string>;
  now: Date;
}): JobberExitReport {
  const recentCutoff = daysAgoIso(params.now, RECENT_INVOICE_DAYS);
  const paymentCutoff = daysAgoIso(params.now, RECENT_PAYMENT_DAYS);

  const byClient = new Map<
    string,
    { openCount: number; openTotal: number; last: string | null }
  >();
  let openInvoiceCount = 0;
  let openInvoiceTotal = 0;

  for (const invoice of params.jobberInvoices) {
    if (!invoice.clientId) continue;

    const entry = byClient.get(invoice.clientId) ?? {
      openCount: 0,
      openTotal: 0,
      last: null,
    };

    if (isOpenInvoiceStatus(invoice.status)) {
      entry.openCount += 1;
      entry.openTotal += invoice.total;
      openInvoiceCount += 1;
      openInvoiceTotal += invoice.total;
    }

    if (invoice.issueDate && (!entry.last || invoice.issueDate > entry.last)) {
      entry.last = invoice.issueDate;
    }

    byClient.set(invoice.clientId, entry);
  }

  const stillOnJobber: StillOnJobberCustomer[] = [];

  for (const customer of params.jobberInvoicedCustomers) {
    const entry = byClient.get(customer.clientId);

    if (!entry) continue;

    const recent = entry.last !== null && entry.last >= recentCutoff;

    if (entry.openCount === 0 && !recent) continue;

    const hasNativeCard = params.nativeCardClientIds.has(customer.clientId);

    stillOnJobber.push({
      clientId: customer.clientId,
      name: customer.name,
      openCount: entry.openCount,
      openTotal: entry.openTotal,
      lastInvoiceDate: entry.last,
      hasNativeCard,
      needsCardMoved: customer.modeSource === "auto_has_card" && !hasNativeCard,
    });
  }

  // Money owed first, then most recently billed.
  stillOnJobber.sort(
    (a, b) =>
      b.openTotal - a.openTotal ||
      (b.lastInvoiceDate ?? "").localeCompare(a.lastInvoiceDate ?? "")
  );

  const recentPayments = params.jobberPayments.filter(
    (payment) => payment.paymentDate !== null && payment.paymentDate >= paymentCutoff
  );
  const jobberPaymentsRecent = {
    count: recentPayments.length,
    total: recentPayments.reduce((sum, payment) => sum + payment.amount, 0),
  };

  const blockers: string[] = [];

  if (stillOnJobber.length > 0) {
    blockers.push(
      `${stillOnJobber.length} customer${stillOnJobber.length === 1 ? " is" : "s are"} still invoiced through Jobber`
    );
  }

  if (openInvoiceCount > 0) {
    blockers.push(
      `${openInvoiceCount} Jobber invoice${openInvoiceCount === 1 ? " is" : "s are"} still unpaid`
    );
  }

  if (jobberPaymentsRecent.count > 0) {
    blockers.push(
      `${jobberPaymentsRecent.count} payment${jobberPaymentsRecent.count === 1 ? "" : "s"} came in through Jobber in the last ${RECENT_PAYMENT_DAYS} days`
    );
  }

  return {
    stillOnJobber,
    openInvoiceCount,
    openInvoiceTotal,
    jobberPaymentsRecent,
    blockers,
    readyToCancel: blockers.length === 0,
  };
}
