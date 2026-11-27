import { describe, expect, it } from "vitest";
import {
  elapsedMinutes,
  firstQuoteSentAt,
  formatDuration,
  speedBucket,
  summarizeQuoteSpeed,
} from "./quoteSpeedLogic";

const NOW = new Date("2026-11-30T20:00:00Z");

describe("firstQuoteSentAt", () => {
  it("ignores drafts and takes the earliest sent quote", () => {
    expect(
      firstQuoteSentAt([
        { status: "draft", sent_at: null, created_at: "2026-11-01T00:00:00Z" },
        { status: "sent", sent_at: "2026-11-03T00:00:00Z", created_at: "2026-11-02T00:00:00Z" },
        { status: "accepted", sent_at: "2026-11-02T12:00:00Z", created_at: "2026-11-02T00:00:00Z" },
      ])
    ).toBe("2026-11-02T12:00:00Z");
  });
  it("falls back to created_at when sent_at is missing, null with no quotes", () => {
    expect(
      firstQuoteSentAt([{ status: "sent", sent_at: null, created_at: "2026-11-02T00:00:00Z" }])
    ).toBe("2026-11-02T00:00:00Z");
    expect(firstQuoteSentAt([])).toBeNull();
  });
});

describe("elapsed and format", () => {
  it("computes minutes and never goes negative", () => {
    expect(elapsedMinutes("2026-11-30T10:00:00Z", "2026-11-30T11:30:00Z")).toBe(90);
    expect(elapsedMinutes("2026-11-30T11:00:00Z", "2026-11-30T10:00:00Z")).toBe(0);
  });
  it("formats durations", () => {
    expect(formatDuration(0)).toBe("under a minute");
    expect(formatDuration(25)).toBe("25 min");
    expect(formatDuration(200)).toBe("3 h 20 min");
    expect(formatDuration(180)).toBe("3 h");
    expect(formatDuration(3000)).toBe("2 d 2 h");
  });
});

describe("speedBucket", () => {
  it("buckets by elapsed minutes", () => {
    expect(speedBucket(59)).toBe("under_1h");
    expect(speedBucket(60)).toBe("1_to_4h");
    expect(speedBucket(239)).toBe("1_to_4h");
    expect(speedBucket(240)).toBe("4_to_24h");
    expect(speedBucket(1440)).toBe("over_24h");
  });
});

describe("summarizeQuoteSpeed", () => {
  it("summarizes speed, close rate by bucket, and who is still waiting", () => {
    const summary = summarizeQuoteSpeed(
      [
        { createdAt: "2026-11-30T10:00:00Z", firstQuoteSentAt: "2026-11-30T10:30:00Z", accepted: true, waiting: false },
        { createdAt: "2026-11-30T10:00:00Z", firstQuoteSentAt: "2026-11-30T10:45:00Z", accepted: false, waiting: false },
        { createdAt: "2026-11-28T10:00:00Z", firstQuoteSentAt: "2026-11-30T10:00:00Z", accepted: false, waiting: false },
        { createdAt: "2026-11-29T10:00:00Z", firstQuoteSentAt: null, accepted: false, waiting: true },
        { createdAt: "2026-11-30T19:00:00Z", firstQuoteSentAt: null, accepted: false, waiting: true },
        { createdAt: "2026-11-01T10:00:00Z", firstQuoteSentAt: null, accepted: false, waiting: false },
      ],
      NOW
    );

    expect(summary.quotedCount).toBe(3);
    expect(summary.medianMinutes).toBe(45);
    expect(summary.within1hPercent).toBe(67);
    expect(summary.within24hPercent).toBe(67);
    expect(summary.buckets[0]).toEqual({
      key: "under_1h",
      label: "Under 1 hour",
      quoted: 2,
      accepted: 1,
      closeRatePercent: 50,
      smallSample: true,
    });
    expect(summary.buckets[3].quoted).toBe(1);
    expect(summary.waitingCount).toBe(2);
    expect(summary.waitingOver24h).toBe(1);
    expect(summary.oldestWaitingMinutes).toBe(34 * 60);
  });

  it("is empty-safe", () => {
    const summary = summarizeQuoteSpeed([], NOW);
    expect(summary.medianMinutes).toBeNull();
    expect(summary.within1hPercent).toBeNull();
    expect(summary.waitingCount).toBe(0);
  });
});
