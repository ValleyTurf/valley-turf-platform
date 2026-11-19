// Loan accounts in Reconciliation. A payment into a loan shows up in the
// bank feed as one row for the whole payment (principal + interest), with
// the split spelled out in the description, for example:
//   "... GROSS AMT: $-950.00 PRINCIPAL: $-926.80 INTEREST: $23.20"
// Only the principal lowers what is owed, so the in-app loan balance has
// to move by the principal, not by the whole payment. The sign is also
// opposite to a checking account: money going into a loan lowers the
// balance, it does not raise it.

export type LoanAccountInfo = {
  name?: string | null;
  subtype?: string | null;
};

export function isLoanAccount(account: LoanAccountInfo): boolean {
  const text = `${account.subtype ?? ""} ${account.name ?? ""}`.toLowerCase();
  return /\b(loan|mortgage|heloc|line of credit)\b/.test(text);
}

// Reads the dollar figure after a label such as "PRINCIPAL:". Handles
// "$-926.80", "-$926.80", "$926.80" and thousands commas.
function readAmountAfter(label: string, text: string): number | null {
  const match = new RegExp(
    `${label}\\s*:?\\s*(-)?\\s*\\$?\\s*(-)?\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)`,
    "i"
  ).exec(text);

  if (!match) return null;

  const value = Number(match[3].replace(/,/g, ""));

  if (!Number.isFinite(value)) return null;

  return match[1] || match[2] ? -value : value;
}

export function parsePrincipal(text: string | null | undefined): number | null {
  return readAmountAfter("PRINCIPAL", text ?? "");
}

export function parseInterest(text: string | null | undefined): number | null {
  return readAmountAfter("INTEREST", text ?? "");
}

export type LoanRowSplit = {
  // Amount the loan balance moves by, in the same sign convention as the
  // rest of the ledger (balance = starting balance - sum of effects).
  // Payments are positive here: they reduce what is owed.
  effect: number;
  principal: number | null;
  interest: number | null;
  // True when the description carried a principal figure.
  split: boolean;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// `amount` is the bank-feed amount (negative = money into the loan).
// `texts` are the fields to look in for the PRINCIPAL/INTEREST split.
export function loanRowEffect(
  amount: number,
  texts: (string | null | undefined)[]
): LoanRowSplit {
  const joined = texts.filter(Boolean).join(" ");
  const principalRaw = parsePrincipal(joined);
  const interestRaw = parseInterest(joined);

  // Loan balance goes down on a payment (negative amount) and up on an
  // advance (positive), the reverse of a checking account.
  if (principalRaw === null) {
    return {
      effect: round2(-amount),
      principal: null,
      interest: interestRaw === null ? null : Math.abs(interestRaw),
      split: false,
    };
  }

  const direction = amount < 0 ? -1 : 1;
  const principal = Math.abs(principalRaw) * direction;

  return {
    effect: round2(-principal),
    principal: Math.abs(principalRaw),
    interest: interestRaw === null ? null : Math.abs(interestRaw),
    split: true,
  };
}
