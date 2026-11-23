import { describe, it, expect } from "vitest";
import {
  defaultInviteTemplate,
  renderInviteMessage,
  smsSegments,
  validateInviteTemplate,
  inviteSkipReason,
  inviteWindowOpen,
  migrationStage,
  phoenixHour,
  nextInviteOpening,
  describeOpening,
} from "./nativeMigrationLogic";

describe("migrationStage", () => {
  it("orders the stages", () => {
    expect(migrationStage({ native: true, cardSaved: true, lastInvitedAt: "x" })).toBe("switched");
    expect(migrationStage({ native: false, cardSaved: true, lastInvitedAt: "x" })).toBe("card_saved");
    expect(migrationStage({ native: false, cardSaved: false, lastInvitedAt: "2026-11-20" })).toBe("invited");
    expect(migrationStage({ native: false, cardSaved: false, lastInvitedAt: null })).toBe("not_invited");
  });
});

describe("invite window (Phoenix time, UTC-7)", () => {
  it("is closed at 8:59am and open at 9am", () => {
    expect(inviteWindowOpen(new Date("2026-11-23T15:59:00Z"))).toBe(false); // 8:59 Phoenix
    expect(inviteWindowOpen(new Date("2026-11-23T16:00:00Z"))).toBe(true); // 9:00 Phoenix
  });
  it("is open at 5:59pm and closed at 6pm", () => {
    expect(inviteWindowOpen(new Date("2026-11-24T00:59:00Z"))).toBe(true); // 5:59pm
    expect(inviteWindowOpen(new Date("2026-11-24T01:00:00Z"))).toBe(false); // 6:00pm
  });
  it("is closed late at night", () => {
    expect(phoenixHour(new Date("2026-11-24T06:00:00Z"))).toBe(23);
    expect(inviteWindowOpen(new Date("2026-11-24T06:00:00Z"))).toBe(false);
  });
});

describe("inviteSkipReason", () => {
  const base = {
    native: false,
    cardSaved: false,
    optedOut: false,
    hasPhone: true,
    hasEmail: false,
    lastInvitedAt: null as string | null,
    now: new Date("2026-11-23T20:00:00Z"),
  };
  it("allows a fresh customer", () => {
    expect(inviteSkipReason(base) === null).toBe(true);
  });
  it("skips native, card saved, opted out and no contact", () => {
    expect(inviteSkipReason({ ...base, native: true })).toBe("already_native");
    expect(inviteSkipReason({ ...base, cardSaved: true })).toBe("card_saved");
    expect(inviteSkipReason({ ...base, optedOut: true })).toBe("opted_out");
    expect(inviteSkipReason({ ...base, hasPhone: false })).toBe("no_contact");
  });
  it("skips a recent invite but allows an older one", () => {
    expect(inviteSkipReason({ ...base, lastInvitedAt: "2026-11-22T20:00:00Z" })).toBe("invited_recently");
    expect(inviteSkipReason({ ...base, lastInvitedAt: "2026-11-18T20:00:00Z" }) === null).toBe(true);
  });
});

describe("invite message template", () => {
  const template = defaultInviteTemplate("Valley Turf Revival", "(480) 331-4596");
  it("fills in the name and link", () => {
    const text = renderInviteMessage(template, { firstName: "Chris", link: "https://go.example.com/autopay/abc" });
    expect(text.includes("Hi Chris")).toBe(true);
    expect(text.includes("https://go.example.com/autopay/abc")).toBe(true);
    expect(text.includes("{link}")).toBe(false);
    expect(text.includes("{first_name}")).toBe(false);
  });
  it("fills every occurrence", () => {
    const text = renderInviteMessage("{first_name}! {first_name}, {link} {link}", { firstName: "A", link: "L" });
    expect(text).toBe("A! A, L L");
  });
  it("uses no fancy punctuation in the suggested wording", () => {
    expect(/[\u2014\u2013\u2018\u2019\u201c\u201d]/.test(template)).toBe(false);
  });
  it("requires the link and a sensible length", () => {
    expect(validateInviteTemplate(template) === null).toBe(true);
    expect((validateInviteTemplate("Hi {first_name}, please pay") ?? "").includes("{link}")).toBe(true);
    expect(validateInviteTemplate("   ") === null).toBe(false);
    expect(validateInviteTemplate("{link} " + "x".repeat(700)) === null).toBe(false);
  });
  it("counts text segments", () => {
    expect(smsSegments(100)).toBe(1);
    expect(smsSegments(160)).toBe(1);
    expect(smsSegments(161)).toBe(2);
    expect(smsSegments(400)).toBe(3);
  });
});

describe("nextInviteOpening (Phoenix 9am = 16:00 UTC)", () => {
  it("before 9am is today at 9am", () => {
    expect(nextInviteOpening(new Date("2026-11-23T14:00:00Z")).toISOString()).toBe("2026-11-23T16:00:00.000Z");
  });
  it("after 9am is tomorrow at 9am", () => {
    expect(nextInviteOpening(new Date("2026-11-23T20:00:00Z")).toISOString()).toBe("2026-11-24T16:00:00.000Z");
  });
  it("late night Phoenix (UTC already next day) is the next Phoenix morning", () => {
    // 10:30pm Phoenix Nov 23 = 05:30 UTC Nov 24
    expect(nextInviteOpening(new Date("2026-11-24T05:30:00Z")).toISOString()).toBe("2026-11-24T16:00:00.000Z");
  });
  it("describes today / tomorrow", () => {
    const now = new Date("2026-11-24T05:30:00Z"); // Nov 23 10:30pm Phoenix
    expect(describeOpening(nextInviteOpening(now), now)).toBe("tomorrow at 9am");
    const early = new Date("2026-11-23T14:00:00Z");
    expect(describeOpening(nextInviteOpening(early), early)).toBe("today at 9am");
  });
});
