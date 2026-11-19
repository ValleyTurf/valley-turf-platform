import { describe, it, expect } from "vitest";
import {
  isLoanAccount,
  loanRowEffect,
  parseInterest,
  parsePrincipal,
} from "./loanPayments";

const D1 =
  "Home banking Payment Transfer from Plaid Knickers Llc ******0101 S0050 GROSS AMT: $-950.00 PRINCIPAL: $-926.80 INTEREST: $23.20 - Loan Payment";
const D2 =
  "Home banking Payment Transfer from Plaid Knickers Llc ******0101 S0050 GROSS AMT: $-18.11 PRINCIPAL: $-18.11 - Loan Payment";

describe("parsing", () => {
  it("reads principal and interest", () => {
    expect(parsePrincipal(D1)).toBe(-926.8);
    expect(parseInterest(D1)).toBe(23.2);
  });

  it("returns null when there is no split", () => {
    expect(parsePrincipal("Payment Transfer")).toBeNull();
    expect(parseInterest(D2)).toBeNull();
  });

  it("handles other formats", () => {
    expect(parsePrincipal("PRINCIPAL: -$2,055.09")).toBe(-2055.09);
    expect(parsePrincipal("principal $1,000.00")).toBe(1000);
  });
});

describe("loanRowEffect", () => {
  it("uses only the principal for the balance", () => {
    const row = loanRowEffect(-950, [D1]);
    expect(row.effect).toBe(926.8);
    expect(row.principal).toBe(926.8);
    expect(row.interest).toBe(23.2);
    expect(row.split).toBe(true);
  });

  it("handles a principal-only payment", () => {
    expect(loanRowEffect(-18.11, [D2]).effect).toBe(18.11);
  });

  it("falls back to the whole amount without a split, as a payment", () => {
    const row = loanRowEffect(-500, ["Payment Transfer"]);
    expect(row.effect).toBe(500);
    expect(row.split).toBe(false);
  });

  it("treats an advance as increasing what is owed", () => {
    expect(loanRowEffect(500, ["Advance"]).effect).toBe(-500);
  });

  it("matches the real loan: 121,850 less principal is 116,000", () => {
    const rows: [number, string][] = [
      [-2253.33, "GROSS AMT: $-2253.33 PRINCIPAL: $-2156.65 INTEREST: $96.68"],
      [-693.35, "GROSS AMT: $-693.35 PRINCIPAL: $-693.35"],
      [-2267.53, "GROSS AMT: $-2267.53 PRINCIPAL: $-2055.09 INTEREST: $212.44"],
      [-18.11, D2],
      [-950, D1],
    ];
    const total = rows.reduce((sum, [a, d]) => sum + loanRowEffect(a, [d]).effect, 0);
    expect(Math.round((121850 - total) * 100) / 100).toBe(116000);
  });
});

describe("isLoanAccount", () => {
  it("recognizes loans and mortgages by name or subtype", () => {
    expect(isLoanAccount({ name: "2ND MORTGAGE FIXED RATE LOAN" })).toBe(true);
    expect(isLoanAccount({ subtype: "mortgage" })).toBe(true);
    expect(isLoanAccount({ name: "Home Equity Line of Credit" })).toBe(true);
  });

  it("leaves checking, savings and cards alone", () => {
    expect(isLoanAccount({ name: "PK CHECKING", subtype: "checking" })).toBe(false);
    expect(isLoanAccount({ name: "REWARDS BUSINESS VISA PLATINUM", subtype: "credit card" })).toBe(false);
    expect(isLoanAccount({ name: "MONEY MARKET", subtype: "money market" })).toBe(false);
  });
});

import { interestExpenseFor } from "./loanPayments";

describe("interestExpenseFor", () => {
  const row = { amount: -950, description: D1, vendor: null, ledgerType: "loan_payment" };

  it("returns the interest for a filed payment", () => {
    expect(interestExpenseFor(row)).toBe(23.2);
  });

  it("returns null for principal-only payments", () => {
    expect(interestExpenseFor({ ...row, amount: -18.11, description: D2 })).toBeNull();
  });

  it("skips payments categorized as real expenses", () => {
    expect(interestExpenseFor({ ...row, ledgerType: null })).toBeNull();
  });

  it("skips money going out of the loan", () => {
    expect(interestExpenseFor({ ...row, amount: 950 })).toBeNull();
  });
});
