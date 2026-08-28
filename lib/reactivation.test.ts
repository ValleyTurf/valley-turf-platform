import { describe, expect, it } from "vitest";
import {
  addMonthsIso,
  daysBetweenDateStrings,
  isActiveWorkflowStatus,
  isDueToday,
  isOverdue,
  isReactivationCandidate,
  isReactivationStatus,
  isSameDay,
  isUpcoming,
  matchesReactivationFilter,
  nextReactivationState,
  normalizeReactivationStatus,
  timeBucketForDays,
  type ReactivationCurrentState,
} from "./reactivation";

describe("isReactivationStatus", () => {
  it("accepts every known status", () => {
    expect(isReactivationStatus("candidate")).toBe(true);
    expect(isReactivationStatus("contacted_email")).toBe(true);
    expect(isReactivationStatus("contacted_text")).toBe(true);
    expect(isReactivationStatus("follow_up_3mo")).toBe(true);
    expect(isReactivationStatus("follow_up_6mo")).toBe(true);
    expect(isReactivationStatus("scheduled")).toBe(true);
    expect(isReactivationStatus("not_interested")).toBe(true);
    expect(isReactivationStatus("dog_passed_away")).toBe(true);
    expect(isReactivationStatus("removed")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isReactivationStatus("booked")).toBe(false);
    expect(isReactivationStatus("")).toBe(false);
    expect(isReactivationStatus("Candidate")).toBe(false);
  });
});

describe("normalizeReactivationStatus", () => {
  it("treats null/empty as candidate", () => {
    expect(normalizeReactivationStatus(null)).toBe("candidate");
    expect(normalizeReactivationStatus("")).toBe("candidate");
  });

  it("passes current-style statuses through unchanged", () => {
    expect(normalizeReactivationStatus("scheduled")).toBe("scheduled");
    expect(normalizeReactivationStatus("dog_passed_away")).toBe(
      "dog_passed_away"
    );
  });

  it("maps legacy pre-rebuild statuses to their closest current equivalent", () => {
    expect(normalizeReactivationStatus("contacted")).toBe("contacted_email");
    expect(normalizeReactivationStatus("follow_up")).toBe("follow_up_3mo");
    expect(normalizeReactivationStatus("booked")).toBe("scheduled");
  });

  it("falls back to candidate for anything unrecognized", () => {
    expect(normalizeReactivationStatus("some_future_status")).toBe(
      "candidate"
    );
  });
});

describe("addMonthsIso", () => {
  it("adds calendar months, not a flat 30/90/180-day offset", () => {
    const base = new Date(Date.UTC(2026, 0, 31)); // Jan 31, 2026
    // Jan 31 + 1 month: JS Date normalizes Feb 31 -> Mar 3 (2026 not a
    // leap year, Feb has 28 days) — documenting that behavior here
    // rather than pretending it's exactly "one month" in the calendar
    // sense for month-end dates.
    const plusOne = new Date(addMonthsIso(base, 1));
    expect(plusOne.getUTCMonth()).toBe(2); // March (0-indexed)
  });

  it("adds 3 and 6 months correctly for a mid-month date", () => {
    const base = new Date(Date.UTC(2026, 7, 15)); // Aug 15, 2026
    expect(addMonthsIso(base, 3)).toBe(
      new Date(Date.UTC(2026, 10, 15)).toISOString()
    );
    expect(addMonthsIso(base, 6)).toBe(
      new Date(Date.UTC(2027, 1, 15)).toISOString()
    );
  });
});

describe("nextReactivationState", () => {
  const blank: ReactivationCurrentState = {
    lastContactedAt: null,
    contactAttempts: 0,
    recontactInterval: null,
  };

  const now = new Date(Date.UTC(2026, 7, 26)); // Aug 26, 2026

  it("logs a contact and bumps attempts for contacted_email", () => {
    const result = nextReactivationState(blank, "contacted_email", now);

    expect(result.status).toBe("contacted_email");
    expect(result.lastContactedAt).toBe(now.toISOString());
    expect(result.contactAttempts).toBe(1);
    expect(result.nextFollowUpAt).toBeNull();
    expect(result.recontactInterval).toBeNull();
  });

  it("logs a contact and bumps attempts for contacted_text", () => {
    const result = nextReactivationState(blank, "contacted_text", now);

    expect(result.lastContactedAt).toBe(now.toISOString());
    expect(result.contactAttempts).toBe(1);
  });

  it("schedules a 3-month follow-up and records the interval", () => {
    const result = nextReactivationState(blank, "follow_up_3mo", now);

    expect(result.nextFollowUpAt).toBe(addMonthsIso(now, 3));
    expect(result.recontactInterval).toBe("3mo");
    expect(result.contactAttempts).toBe(1);
    expect(result.lastContactedAt).toBe(now.toISOString());
  });

  it("schedules a 6-month follow-up and records the interval", () => {
    const result = nextReactivationState(blank, "follow_up_6mo", now);

    expect(result.nextFollowUpAt).toBe(addMonthsIso(now, 6));
    expect(result.recontactInterval).toBe("6mo");
  });

  it("marking Cleaning Scheduled clears the follow-up date but preserves the recontact interval", () => {
    const afterThreeMonthFollowUp: ReactivationCurrentState = {
      lastContactedAt: now.toISOString(),
      contactAttempts: 2,
      recontactInterval: "3mo",
    };

    const result = nextReactivationState(
      afterThreeMonthFollowUp,
      "scheduled",
      now
    );

    expect(result.status).toBe("scheduled");
    expect(result.nextFollowUpAt).toBeNull();
    expect(result.recontactInterval).toBe("3mo");
    // Not a "contact" action itself, so attempts don't bump again.
    expect(result.contactAttempts).toBe(2);
    expect(result.lastContactedAt).toBe(now.toISOString());
  });

  it("Not Interested and Dog Passed Away also preserve the interval and don't bump attempts", () => {
    const afterSixMonthFollowUp: ReactivationCurrentState = {
      lastContactedAt: now.toISOString(),
      contactAttempts: 3,
      recontactInterval: "6mo",
    };

    const notInterested = nextReactivationState(
      afterSixMonthFollowUp,
      "not_interested",
      now
    );
    expect(notInterested.contactAttempts).toBe(3);
    expect(notInterested.recontactInterval).toBe("6mo");
    expect(notInterested.nextFollowUpAt).toBeNull();

    const dogPassedAway = nextReactivationState(
      afterSixMonthFollowUp,
      "dog_passed_away",
      now
    );
    expect(dogPassedAway.contactAttempts).toBe(3);
    expect(dogPassedAway.recontactInterval).toBe("6mo");
  });

  it("removed clears the follow-up date without touching attempts or the interval", () => {
    const current: ReactivationCurrentState = {
      lastContactedAt: now.toISOString(),
      contactAttempts: 1,
      recontactInterval: "3mo",
    };

    const result = nextReactivationState(current, "removed", now);

    expect(result.nextFollowUpAt).toBeNull();
    expect(result.contactAttempts).toBe(1);
    expect(result.recontactInterval).toBe("3mo");
  });
});

describe("isSameDay / isOverdue / isDueToday / isUpcoming", () => {
  const today = new Date(Date.UTC(2026, 7, 26, 15, 0, 0));

  it("isSameDay compares calendar day only", () => {
    const morning = new Date(Date.UTC(2026, 7, 26, 1, 0, 0));
    const evening = new Date(Date.UTC(2026, 7, 26, 23, 0, 0));
    expect(isSameDay(morning, evening)).toBe(true);
  });

  it("null follow-up date is never overdue, due today, or upcoming", () => {
    expect(isOverdue(null, today)).toBe(false);
    expect(isDueToday(null, today)).toBe(false);
    expect(isUpcoming(null, today)).toBe(false);
  });

  it("a past date is overdue only", () => {
    const past = new Date(Date.UTC(2026, 7, 20)).toISOString();
    expect(isOverdue(past, today)).toBe(true);
    expect(isDueToday(past, today)).toBe(false);
    expect(isUpcoming(past, today)).toBe(false);
  });

  it("today's date is due today only", () => {
    const sameDay = new Date(Date.UTC(2026, 7, 26, 3, 0, 0)).toISOString();
    expect(isOverdue(sameDay, today)).toBe(false);
    expect(isDueToday(sameDay, today)).toBe(true);
    expect(isUpcoming(sameDay, today)).toBe(false);
  });

  it("a future date is upcoming only", () => {
    const future = new Date(Date.UTC(2026, 8, 1)).toISOString();
    expect(isOverdue(future, today)).toBe(false);
    expect(isDueToday(future, today)).toBe(false);
    expect(isUpcoming(future, today)).toBe(true);
  });
});

describe("isActiveWorkflowStatus", () => {
  it("treats every in-progress or completed disposition as active", () => {
    expect(isActiveWorkflowStatus("contacted_email")).toBe(true);
    expect(isActiveWorkflowStatus("contacted_text")).toBe(true);
    expect(isActiveWorkflowStatus("follow_up_3mo")).toBe(true);
    expect(isActiveWorkflowStatus("follow_up_6mo")).toBe(true);
    expect(isActiveWorkflowStatus("scheduled")).toBe(true);
    expect(isActiveWorkflowStatus("not_interested")).toBe(true);
    expect(isActiveWorkflowStatus("dog_passed_away")).toBe(true);
  });

  it("does not treat candidate, removed, or null as active", () => {
    expect(isActiveWorkflowStatus("candidate")).toBe(false);
    expect(isActiveWorkflowStatus("removed")).toBe(false);
    expect(isActiveWorkflowStatus(null)).toBe(false);
  });
});

describe("matchesReactivationFilter", () => {
  it("all matches everything", () => {
    expect(matchesReactivationFilter("scheduled", "all")).toBe(true);
    expect(matchesReactivationFilter(null, "all")).toBe(true);
  });

  it("candidate matches null or explicit candidate status", () => {
    expect(matchesReactivationFilter(null, "candidate")).toBe(true);
    expect(matchesReactivationFilter("candidate", "candidate")).toBe(true);
    expect(matchesReactivationFilter("scheduled", "candidate")).toBe(false);
  });

  it("contacted groups both email and text dispositions", () => {
    expect(matchesReactivationFilter("contacted_email", "contacted")).toBe(
      true
    );
    expect(matchesReactivationFilter("contacted_text", "contacted")).toBe(
      true
    );
    expect(matchesReactivationFilter("follow_up_3mo", "contacted")).toBe(
      false
    );
  });

  it("follow_up groups both 3mo and 6mo windows", () => {
    expect(matchesReactivationFilter("follow_up_3mo", "follow_up")).toBe(
      true
    );
    expect(matchesReactivationFilter("follow_up_6mo", "follow_up")).toBe(
      true
    );
  });

  it("scheduled matches only that exact status", () => {
    expect(matchesReactivationFilter("scheduled", "scheduled")).toBe(true);
    expect(matchesReactivationFilter("not_interested", "scheduled")).toBe(
      false
    );
  });
});

describe("daysBetweenDateStrings", () => {
  it("computes a plain day count between two dates", () => {
    expect(daysBetweenDateStrings("2026-01-01", "2026-01-11")).toBe(10);
  });

  it("never returns negative — clamps to 0 if end is before start", () => {
    expect(daysBetweenDateStrings("2026-06-01", "2026-01-01")).toBe(0);
  });

  it("returns 0 for the same date", () => {
    expect(daysBetweenDateStrings("2026-03-15", "2026-03-15")).toBe(0);
  });
});

describe("timeBucketForDays", () => {
  it("matches Customer Intelligence's exact day ranges", () => {
    expect(timeBucketForDays(90)).toBe("3-6");
    expect(timeBucketForDays(179)).toBe("3-6");
    expect(timeBucketForDays(180)).toBe("6-12");
    expect(timeBucketForDays(364)).toBe("6-12");
    expect(timeBucketForDays(365)).toBe("12-18");
    expect(timeBucketForDays(547)).toBe("12-18");
  });

  it("returns null outside the 90-547 day range", () => {
    expect(timeBucketForDays(89)).toBeNull();
    expect(timeBucketForDays(548)).toBeNull();
    expect(timeBucketForDays(0)).toBeNull();
    expect(timeBucketForDays(1000)).toBeNull();
  });
});

describe("isReactivationCandidate", () => {
  const valid = {
    invoiceCount: 3,
    daysSinceLastInvoice: 120,
    isRecurring: false,
    isExcluded: false,
  };

  it("accepts a customer with invoices, in-range inactivity, not recurring, not excluded", () => {
    expect(isReactivationCandidate(valid)).toBe(true);
  });

  it("rejects a customer with zero invoices", () => {
    expect(isReactivationCandidate({ ...valid, invoiceCount: 0 })).toBe(
      false
    );
  });

  it("rejects null daysSinceLastInvoice", () => {
    expect(
      isReactivationCandidate({ ...valid, daysSinceLastInvoice: null })
    ).toBe(false);
  });

  it("rejects outside the 90-547 day window", () => {
    expect(
      isReactivationCandidate({ ...valid, daysSinceLastInvoice: 89 })
    ).toBe(false);
    expect(
      isReactivationCandidate({ ...valid, daysSinceLastInvoice: 548 })
    ).toBe(false);
  });

  it("rejects a recurring-service customer", () => {
    expect(isReactivationCandidate({ ...valid, isRecurring: true })).toBe(
      false
    );
  });

  it("rejects an excluded customer", () => {
    expect(isReactivationCandidate({ ...valid, isExcluded: true })).toBe(
      false
    );
  });
});
