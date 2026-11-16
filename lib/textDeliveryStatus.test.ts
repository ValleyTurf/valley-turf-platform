import { describe, expect, it } from "vitest";
import {
  deliveryBadge,
  describeTwilioError,
  isFailedStatus,
  shouldApplyStatus,
} from "./textDeliveryStatus";

describe("shouldApplyStatus", () => {
  it("accepts the first status", () => {
    expect(shouldApplyStatus(null, "queued")).toBe(true);
  });

  it("moves forward through the normal sequence", () => {
    expect(shouldApplyStatus("queued", "sent")).toBe(true);
    expect(shouldApplyStatus("sent", "delivered")).toBe(true);
  });

  it("ignores a late 'sent' arriving after 'delivered'", () => {
    expect(shouldApplyStatus("delivered", "sent")).toBe(false);
  });

  it("lets a sent text turn out to be undelivered", () => {
    expect(shouldApplyStatus("sent", "undelivered")).toBe(true);
  });

  it("never changes a final status", () => {
    expect(shouldApplyStatus("delivered", "failed")).toBe(false);
    expect(shouldApplyStatus("failed", "delivered")).toBe(false);
  });

  it("ignores statuses it does not know", () => {
    expect(shouldApplyStatus("sent", "bogus")).toBe(false);
  });
});

describe("isFailedStatus", () => {
  it("is true only for failed and undelivered", () => {
    expect(isFailedStatus("failed")).toBe(true);
    expect(isFailedStatus("undelivered")).toBe(true);
    expect(isFailedStatus("sent")).toBe(false);
    expect(isFailedStatus(null)).toBe(false);
  });
});

describe("deliveryBadge", () => {
  it("shows delivered texts as good", () => {
    expect(deliveryBadge("delivered", null)?.tone).toBe("good");
  });

  it("shows nothing while a text is still on its way", () => {
    expect(deliveryBadge("sent", null)).toBeNull();
  });

  it("explains a carrier-filtered text", () => {
    expect(deliveryBadge("undelivered", "30007")).toEqual({
      label: "Not delivered: the carrier filtered the message as spam",
      tone: "bad",
    });
  });
});

describe("describeTwilioError", () => {
  it("falls back to a generic reason", () => {
    expect(describeTwilioError(null)).toBe("the carrier did not deliver it");
    expect(describeTwilioError("99999")).toBe("carrier error 99999");
  });
});
