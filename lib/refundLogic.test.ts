import { describe, it, expect } from "vitest";
import { checkRefundAmount, netCollectedAmount, stripeReasonFor, toCents } from "./refundLogic";
import { isCollectedPayment } from "./visitDetailLogic";

describe("checkRefundAmount", () => {
  it("allows a full refund", () => {
    expect(checkRefundAmount(380, 38000, 0)).toEqual({ ok: true, cents: 38000, fullyRefunded: true });
  });
  it("allows a partial refund and is not full", () => {
    expect(checkRefundAmount(50, 38000, 0)).toEqual({ ok: true, cents: 5000, fullyRefunded: false });
  });
  it("completes a payment refunded in two parts", () => {
    expect(checkRefundAmount(330, 38000, 5000)).toEqual({ ok: true, cents: 33000, fullyRefunded: true });
  });
  it("rejects more than what is left", () => {
    const r = checkRefundAmount(340, 38000, 5000);
    expect(r.ok).toBe(false);
  });
  it("rejects zero, negative and already-refunded", () => {
    expect(checkRefundAmount(0, 38000, 0).ok).toBe(false);
    expect(checkRefundAmount(-5, 38000, 0).ok).toBe(false);
    expect(checkRefundAmount(10, 38000, 38000).ok).toBe(false);
  });
  it("rounds dollars to cents safely", () => {
    expect(toCents(93.31)).toBe(9331);
  });
});

describe("netCollectedAmount", () => {
  it("counts a normal payment", () => {
    expect(netCollectedAmount(380, "SUCCEEDED", isCollectedPayment)).toBe(380);
  });
  it("ignores a Jobber payment marked REFUNDED", () => {
    expect(netCollectedAmount(380, "REFUNDED", isCollectedPayment)).toBe(0);
  });
  it("counts a negative mirrored refund row so it nets out", () => {
    expect(netCollectedAmount(-380, "refunded", isCollectedPayment)).toBe(-380);
  });
});

describe("stripeReasonFor", () => {
  it("maps known reasons and leaves the rest to metadata", () => {
    expect(stripeReasonFor("duplicate")).toBe("duplicate");
    expect(stripeReasonFor("wrong_card") === undefined).toBe(true);
  });
});
