import { describe, expect, it } from "vitest";
import { buildPortalPayments, paymentMethodLabel, receiptNumber, type RawPaymentRow } from "./portalPaymentsLogic";

const row = (over: Partial<RawPaymentRow>): RawPaymentRow => ({
  jobber_payment_id: "p1",
  jobber_invoice_id: "inv1",
  amount: 100,
  payment_date: "2026-11-01",
  payment_method: "Stripe",
  tip_amount: 0,
  transaction_status: "succeeded",
  ...over,
});

const nums = new Map<string, string | null>([["inv1", "1349"]]);

describe("paymentMethodLabel", () => {
  it("names common methods", () => {
    expect(paymentMethodLabel("Stripe")).toBe("Card (online)");
    expect(paymentMethodLabel("CREDIT_CARD")).toBe("Card");
    expect(paymentMethodLabel("cash")).toBe("Cash");
    expect(paymentMethodLabel("Check")).toBe("Check");
    expect(paymentMethodLabel(null)).toBe("Payment");
  });
});

describe("receiptNumber", () => {
  it("is stable and readable", () => {
    expect(receiptNumber("native-payment-pi_3abcdefgh")).toBe("R-ABCDEFGH");
    expect(receiptNumber("native-payment-pi_3abcdefgh")).toBe(receiptNumber("native-payment-pi_3abcdefgh"));
  });
});

describe("buildPortalPayments", () => {
  it("lists a normal payment with receipt and invoice number", () => {
    const [p] = buildPortalPayments([row({})], nums);
    expect(p.state).toBe("paid");
    expect(p.invoiceNumber).toBe("1349");
    expect(p.receiptAvailable).toBe(true);
  });

  it("folds a native refund into its payment (partial)", () => {
    const list = buildPortalPayments(
      [
        row({ jobber_payment_id: "native-payment-pi_1", amount: 100 }),
        row({ jobber_payment_id: "native-refund-pi_1", amount: -30, transaction_status: "refunded" }),
      ],
      nums
    );
    expect(list.length).toBe(1);
    expect(list[0].state).toBe("partially_refunded");
    expect(list[0].refundedAmount).toBe(30);
  });

  it("marks a fully refunded native payment refunded", () => {
    const list = buildPortalPayments(
      [
        row({ jobber_payment_id: "native-payment-pi_1", amount: 100 }),
        row({ jobber_payment_id: "native-refund-pi_1", amount: -100, transaction_status: "refunded" }),
      ],
      nums
    );
    expect(list[0].state).toBe("refunded");
  });

  it("treats a Jobber REFUNDED status as fully refunded", () => {
    const [p] = buildPortalPayments([row({ transaction_status: "REFUNDED" })], nums);
    expect(p.state).toBe("refunded");
    expect(p.refundedAmount).toBe(100);
  });

  it("lists an orphan refund on its own, without a receipt", () => {
    const [p] = buildPortalPayments([row({ jobber_payment_id: "native-refund-pi_9", amount: -25 })], nums);
    expect(p.state).toBe("refund");
    expect(p.amount).toBe(25);
    expect(p.receiptAvailable).toBe(false);
  });

  it("shows failed attempts with no receipt", () => {
    const [p] = buildPortalPayments([row({ transaction_status: "FAILED" })], nums);
    expect(p.state).toBe("failed");
    expect(p.receiptAvailable).toBe(false);
  });

  it("sorts newest first", () => {
    const list = buildPortalPayments(
      [row({ jobber_payment_id: "a", payment_date: "2026-10-01" }), row({ jobber_payment_id: "b", payment_date: "2026-11-01" })],
      nums
    );
    expect(list.map((p) => p.id)).toEqual(["b", "a"]);
  });
});
