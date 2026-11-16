// Pure logic for the month-end close checklist (lib/monthClose.ts loads
// the data). Months are "YYYY-MM" strings, always read as Phoenix
// calendar months because every date in the app is a plain date.

export type CloseSnapshot = {
  revenue: number;
  costOfService: number;
  payroll: number;
  operatingExpenses: number;
  overhead: number;
  netProfit: number;
  invoiceCount: number;
  expenseCount: number;
};

export function isValidMonth(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5));
  return month >= 1 && month <= 12;
}

export function monthRange(month: string): { start: string; end: string } {
  const [year, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();

  return {
    start: `${month}-01`,
    end: `${month}-${String(last).padStart(2, "0")}`,
  };
}

export function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);

  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

// Newest first, starting with the month before `today` (a month is only
// worth closing once it is over), then going back `count` months total.
// `today` is a "YYYY-MM-DD" Phoenix date.
export function closableMonths(today: string, count: number): string[] {
  let year = Number(today.slice(0, 4));
  let month = Number(today.slice(5, 7));
  const months: string[] = [];

  for (let i = 0; i < count; i++) {
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
    months.push(`${year}-${String(month).padStart(2, "0")}`);
  }

  return months;
}

// A month can be closed once it has ended.
export function isMonthOver(month: string, today: string): boolean {
  return monthRange(month).end < today;
}

export type CheckStatus = "ok" | "todo" | "info";

export type ChecklistItem = {
  key: string;
  title: string;
  detail: string;
  status: CheckStatus;
  href: string | null;
};

export type ChecklistInput = {
  month: string;
  bankRowsToReview: number;
  depositsToMatch: number;
  // Tracked bank accounts: difference = bank balance minus in-app
  // balance, null when it cannot be computed yet.
  accounts: { name: string; difference: number | null }[];
  unpaidInvoices: { count: number; total: number };
  failedCardCharges: number;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const BALANCE_TOLERANCE = 1;

export function buildChecklist(input: ChecklistInput): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const label = monthLabel(input.month);

  items.push({
    key: "bank-review",
    title: "Bank transactions reviewed",
    status: input.bankRowsToReview === 0 ? "ok" : "todo",
    detail:
      input.bankRowsToReview === 0
        ? `Every bank charge in ${label} has been categorized.`
        : `${input.bankRowsToReview} bank ${plural(input.bankRowsToReview, "charge", "charges")} in ${label} still need a category.`,
    href: "/expenses?status=needs_review",
  });

  items.push({
    key: "deposits",
    title: "Deposits matched to invoices",
    status: input.depositsToMatch === 0 ? "ok" : "todo",
    detail:
      input.depositsToMatch === 0
        ? `No unmatched deposits in ${label}.`
        : `${input.depositsToMatch} ${plural(input.depositsToMatch, "deposit", "deposits")} in ${label} not yet matched to an invoice or filed.`,
    href: "/reconciliation/deposits",
  });

  const measurable = input.accounts.filter((a) => a.difference !== null);
  const off = measurable.filter(
    (a) => Math.abs(a.difference as number) > BALANCE_TOLERANCE
  );

  if (input.accounts.length === 0) {
    items.push({
      key: "balances",
      title: "Bank balances match",
      status: "info",
      detail: "No bank accounts are being tracked yet.",
      href: "/settings/bank-feed",
    });
  } else if (measurable.length === 0) {
    items.push({
      key: "balances",
      title: "Bank balances match",
      status: "info",
      detail: "Set a starting balance on each account to compare it to the bank.",
      href: "/reconciliation",
    });
  } else if (off.length === 0) {
    items.push({
      key: "balances",
      title: "Bank balances match",
      status: "ok",
      detail: `Bank and app balances agree (checked against today's balances).`,
      href: "/reconciliation",
    });
  } else {
    items.push({
      key: "balances",
      title: "Bank balances match",
      status: "todo",
      detail: off
        .map(
          (a) =>
            `${a.name}: off by ${money(Math.abs(a.difference as number))}`
        )
        .join("; "),
      href: "/reconciliation",
    });
  }

  items.push({
    key: "failed-charges",
    title: "No failed card charges",
    status: input.failedCardCharges === 0 ? "ok" : "todo",
    detail:
      input.failedCardCharges === 0
        ? "No card charges failed on unpaid invoices this month."
        : `${input.failedCardCharges} ${plural(input.failedCardCharges, "invoice", "invoices")} from ${label} had a failed card charge and ${plural(input.failedCardCharges, "is", "are")} still unpaid.`,
    href: "/invoices",
  });

  items.push({
    key: "unpaid",
    title: "Unpaid invoices",
    status: "info",
    detail:
      input.unpaidInvoices.count === 0
        ? `Every invoice issued in ${label} is paid.`
        : `${input.unpaidInvoices.count} ${plural(input.unpaidInvoices.count, "invoice", "invoices")} issued in ${label} (${money(input.unpaidInvoices.total)}) still unpaid. Normal, but worth a look before you close.`,
    href: "/invoices",
  });

  return items;
}

export function openItemCount(items: ChecklistItem[]): number {
  return items.filter((i) => i.status === "todo").length;
}

export type SnapshotChange = { label: string; was: number; now: number };

const FIELDS: { key: keyof CloseSnapshot; label: string; money: boolean }[] = [
  { key: "revenue", label: "Revenue", money: true },
  { key: "costOfService", label: "Cost of service", money: true },
  { key: "payroll", label: "Payroll", money: true },
  { key: "operatingExpenses", label: "Operating expenses", money: true },
  { key: "netProfit", label: "Net profit", money: true },
  { key: "invoiceCount", label: "Invoices issued", money: false },
  { key: "expenseCount", label: "Expense entries", money: false },
];

export function diffSnapshot(
  closed: Partial<CloseSnapshot>,
  current: CloseSnapshot
): SnapshotChange[] {
  const changes: SnapshotChange[] = [];

  for (const field of FIELDS) {
    const was = Number(closed[field.key] ?? 0);
    const now = Number(current[field.key] ?? 0);
    const tolerance = field.money ? 0.005 : 0;

    if (Math.abs(was - now) > tolerance) {
      changes.push({ label: field.label, was, now });
    }
  }

  return changes;
}

export function isMoneyLabel(label: string): boolean {
  return !["Invoices issued", "Expense entries"].includes(label);
}
