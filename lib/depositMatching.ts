// Pure "which invoice(s) does this bank deposit probably pay?" logic
// (ROADMAP "Top 10 (November 2026)" #5, migration 106). No database in
// here so it can be checked on its own; lib/depositMatches.ts is the
// database half.
//
// A suggestion is only ever offered -- nothing is matched or marked
// paid until someone presses the button. So the bar is "worth
// showing", and anything shown has to be an EXACT amount match: a
// suggestion that's a few dollars off would just train people to click
// through wrong ones.
//
// Amounts are compared in whole cents to keep floating point out of it.

export type MatchableInvoice = {
  id: string;
  invoiceNumber: string;
  customerName: string | null;
  jobberClientId: string | null;
  total: number;
  issueDate: string;
};

export type MatchableDeposit = {
  // Positive dollars (the bank feed stores money-in as negative; the
  // caller flips it).
  amount: number;
  // Whatever the bank called it -- vendor and description together.
  text: string;
};

export type DepositSuggestion = {
  invoiceIds: string[];
  // True when the customer's name appears in the bank's text for the
  // deposit ("ZELLE FROM KATIE RAY") -- the difference between "same
  // amount, could be anyone's" and "almost certainly this one".
  nameMatch: boolean;
  score: number;
};

const MAX_SUGGESTIONS = 3;

function cents(amount: number): number {
  return Math.round(amount * 100);
}

function normalize(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// A customer "appears" in the deposit text when their full name does,
// or their last name does as a whole word and is long enough not to be
// a coincidence ("Ray" inside "array" or a 2-letter surname shouldn't
// count; "Henderson" on its own should).
export function nameAppearsInText(customerName: string | null, text: string): boolean {
  const name = normalize(customerName);
  const haystack = ` ${normalize(text)} `;

  if (!name || haystack.trim() === "") return false;

  if (haystack.includes(` ${name} `)) return true;

  const parts = name.split(" ");
  const last = parts[parts.length - 1];

  return parts.length > 1 && last.length >= 4 && haystack.includes(` ${last} `);
}

export function suggestInvoicesForDeposit(
  deposit: MatchableDeposit,
  invoices: MatchableInvoice[]
): DepositSuggestion[] {
  const target = cents(deposit.amount);

  if (target <= 0) return [];

  const suggestions: DepositSuggestion[] = [];

  // One invoice for exactly this amount.
  for (const invoice of invoices) {
    if (cents(invoice.total) !== target) continue;

    const nameMatch = nameAppearsInText(invoice.customerName, deposit.text);
    suggestions.push({ invoiceIds: [invoice.id], nameMatch, score: nameMatch ? 100 : 50 });
  }

  // Two or three invoices from the SAME customer adding up to exactly
  // this amount -- one payment covering several invoices (Katie Ray's
  // $400 Zelle for two $200 invoices). Never mixes customers.
  const byCustomer = new Map<string, MatchableInvoice[]>();

  for (const invoice of invoices) {
    if (!invoice.jobberClientId) continue;

    const list = byCustomer.get(invoice.jobberClientId) ?? [];
    list.push(invoice);
    byCustomer.set(invoice.jobberClientId, list);
  }

  for (const customerInvoices of byCustomer.values()) {
    if (customerInvoices.length < 2) continue;

    // Oldest first, and capped, so a customer with a long backlog can't
    // blow up the number of combinations tried.
    const pool = [...customerInvoices]
      .sort((a, b) => a.issueDate.localeCompare(b.issueDate))
      .slice(0, 8);
    const nameMatch = nameAppearsInText(pool[0].customerName, deposit.text);

    for (let i = 0; i < pool.length; i += 1) {
      for (let j = i + 1; j < pool.length; j += 1) {
        const pair = cents(pool[i].total) + cents(pool[j].total);

        if (pair === target) {
          suggestions.push({
            invoiceIds: [pool[i].id, pool[j].id],
            nameMatch,
            score: nameMatch ? 95 : 45,
          });
        }

        for (let k = j + 1; k < pool.length; k += 1) {
          if (pair + cents(pool[k].total) === target) {
            suggestions.push({
              invoiceIds: [pool[i].id, pool[j].id, pool[k].id],
              nameMatch,
              score: nameMatch ? 90 : 40,
            });
          }
        }
      }
    }
  }

  return suggestions.sort((a, b) => b.score - a.score).slice(0, MAX_SUGGESTIONS);
}
