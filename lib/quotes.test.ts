import { describe, expect, it } from "vitest";
import {
  isQuoteStatus,
  computeDisplayStatus,
  canEditQuote,
  allowedStatusTransitions,
  quoteStatusLabel,
  generatePublicToken,
  QUOTE_STATUSES,
} from "./quotes";

describe("isQuoteStatus", () => {
  it("accepts every real status", () => {
    for (const status of QUOTE_STATUSES) {
      expect(isQuoteStatus(status)).toBe(true);
    }
  });

  it("rejects unknown strings, null, and undefined", () => {
    expect(isQuoteStatus("pending")).toBe(false);
    expect(isQuoteStatus(null)).toBe(false);
    expect(isQuoteStatus(undefined)).toBe(false);
    expect(isQuoteStatus("")).toBe(false);
  });
});

describe("computeDisplayStatus", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("returns 'expired' for a sent quote past its expires_at", () => {
    expect(computeDisplayStatus("sent", "2026-06-01T00:00:00Z", now)).toBe(
      "expired"
    );
  });

  it("returns 'sent' for a sent quote not yet past its expires_at", () => {
    expect(computeDisplayStatus("sent", "2026-07-01T00:00:00Z", now)).toBe(
      "sent"
    );
  });

  it("returns 'sent' unchanged when there's no expires_at at all", () => {
    expect(computeDisplayStatus("sent", null, now)).toBe("sent");
  });

  it("leaves draft/accepted/declined alone regardless of expires_at", () => {
    expect(computeDisplayStatus("draft", "2020-01-01T00:00:00Z", now)).toBe(
      "draft"
    );
    expect(
      computeDisplayStatus("accepted", "2020-01-01T00:00:00Z", now)
    ).toBe("accepted");
    expect(
      computeDisplayStatus("declined", "2020-01-01T00:00:00Z", now)
    ).toBe("declined");
  });

  it("leaves an already-expired quote as expired", () => {
    expect(
      computeDisplayStatus("expired", "2020-01-01T00:00:00Z", now)
    ).toBe("expired");
  });

  it("treats an unparseable expires_at as not-expired rather than throwing", () => {
    expect(computeDisplayStatus("sent", "not-a-date", now)).toBe("sent");
  });

  it("defaults `now` to the current time when not passed", () => {
    const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
    expect(computeDisplayStatus("sent", farFuture)).toBe("sent");

    const farPast = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365).toISOString();
    expect(computeDisplayStatus("sent", farPast)).toBe("expired");
  });
});

describe("canEditQuote", () => {
  it("is only true for draft", () => {
    expect(canEditQuote("draft")).toBe(true);
    expect(canEditQuote("sent")).toBe(false);
    expect(canEditQuote("accepted")).toBe(false);
    expect(canEditQuote("declined")).toBe(false);
    expect(canEditQuote("expired")).toBe(false);
  });
});

describe("allowedStatusTransitions", () => {
  it("draft can only move to sent", () => {
    expect(allowedStatusTransitions("draft")).toEqual(["sent"]);
  });

  it("sent and expired can move to accepted or declined", () => {
    expect(allowedStatusTransitions("sent")).toEqual(["accepted", "declined"]);
    expect(allowedStatusTransitions("expired")).toEqual([
      "accepted",
      "declined",
    ]);
  });

  it("accepted and declined are terminal", () => {
    expect(allowedStatusTransitions("accepted")).toEqual([]);
    expect(allowedStatusTransitions("declined")).toEqual([]);
  });
});

describe("quoteStatusLabel", () => {
  it("has a human label for every status", () => {
    for (const status of QUOTE_STATUSES) {
      expect(quoteStatusLabel(status)).toBeTruthy();
    }
  });

  it("labels are titlecase, not raw status strings", () => {
    expect(quoteStatusLabel("draft")).toBe("Draft");
    expect(quoteStatusLabel("expired")).toBe("Expired");
  });
});

describe("generatePublicToken", () => {
  it("returns a URL-safe, dash-free, reasonably long token", () => {
    const token = generatePublicToken();
    expect(token).toMatch(/^[a-f0-9]{32}$/);
  });

  it("returns a different token on every call", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generatePublicToken()));
    expect(tokens.size).toBe(20);
  });
});
