import { describe, expect, it } from "vitest";
import { nameAppearsInText, suggestInvoicesForDeposit, type MatchableInvoice } from "./depositMatching";

describe("depositMatching", () => {
  // Each check reads as one test. The expected value is compared with
  // toEqual, so objects and arrays compare by content.
  function t(name: string, got: unknown, want: unknown) {
    it(name, () => {
      expect(got).toEqual(want);
    });
  }

  const inv = (id: string, customerName: string, clientId: string, total: number, issueDate = "2026-10-01"): MatchableInvoice => ({ id, invoiceNumber: id, customerName, jobberClientId: clientId, total, issueDate });
  const invoices = [inv("A", "Katie Ray", "c1", 200, "2026-09-26"), inv("B", "Katie Ray", "c1", 200, "2026-10-30"), inv("C", "Heather Henderson", "c2", 150), inv("D", "Chris Brown", "c3", 400), inv("E", "Bob Li", "c4", 99.99)];
  // Katie: $400 zelle, two $200 invoices; also Chris Brown has a $400 invoice
  let s = suggestInvoicesForDeposit({ amount: 400, text: "ZELLE FROM KATIE RAY" }, invoices);
  t("katie combo first", s[0], { invoiceIds: ["A", "B"], nameMatch: true, score: 95 });
  t("chris same-amount second", s[1], { invoiceIds: ["D"], nameMatch: false, score: 50 });
  // no name in text: single exact beats combo
  s = suggestInvoicesForDeposit({ amount: 400, text: "ZELLE DEPOSIT" }, invoices);
  t("no name: single first", s.map(x => x.invoiceIds.join("+")), ["D", "A+B"]);
  // exact single with last-name-only match
  s = suggestInvoicesForDeposit({ amount: 150, text: "Zelle payment HENDERSON 8831" }, invoices);
  t("last name match", s, [{ invoiceIds: ["C"], nameMatch: true, score: 100 }]);
  // no exact amount -> nothing (never suggest near misses)
  t("near miss nothing", suggestInvoicesForDeposit({ amount: 199, text: "KATIE RAY" }, invoices), []);
  // cents precision
  t("cents exact", suggestInvoicesForDeposit({ amount: 99.99, text: "x" }, invoices).length, 1);
  t("float sum", suggestInvoicesForDeposit({ amount: 0.3, text: "x" }, [inv("1", "A B", "c", 0.1), inv("2", "A B", "c", 0.2)])[0]?.invoiceIds, ["1", "2"]);
  // never mixes customers: 350 = 200 (Katie) + 150 (Heather) must not be suggested
  t("no cross-customer", suggestInvoicesForDeposit({ amount: 350, text: "x" }, invoices), []);
  // triple
  t("triple", suggestInvoicesForDeposit({ amount: 600, text: "x" }, [inv("1", "A Bee", "c", 100), inv("2", "A Bee", "c", 200), inv("3", "A Bee", "c", 300)])[0]?.invoiceIds, ["1", "2", "3"]);
  // name rules
  t("short last name not enough", nameAppearsInText("Katie Ray", "PAYMENT RAY 1"), false);
  t("full short name ok", nameAppearsInText("Katie Ray", "from katie ray"), true);
  t("not substring", nameAppearsInText("Chris Brown", "BROWNSTONE LLC"), false);
  t("punctuation", nameAppearsInText("Heather Henderson", "ZELLE*HENDERSON,HEATHER"), true);
  t("null name", nameAppearsInText(null, "abc"), false);
  t("zero amount", suggestInvoicesForDeposit({ amount: 0, text: "x" }, invoices), []);
  // max 3
  t("capped", suggestInvoicesForDeposit({ amount: 10, text: "x" }, [1,2,3,4,5].map(n => inv(String(n), `P${n} Lastname${n}`, `c${n}`, 10))).length, 3);
});
