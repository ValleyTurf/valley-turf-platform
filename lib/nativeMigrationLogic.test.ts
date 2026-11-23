import { describe, it, expect } from "vitest";
import {
  buildInviteSms,
  inviteSkipReason,
  inviteWindowOpen,
  migrationStage,
  phoenixHour,
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

describe("buildInviteSms", () => {
  it("includes the link and the name, with no fancy punctuation", () => {
    const sms = buildInviteSms({
      firstName: "Chris",
      link: "https://go.example.com/autopay/abc",
      businessName: "Valley Turf Revival",
      phoneDisplay: "(480) 331-4596",
    });
    expect(sms.includes("Hi Chris")).toBe(true);
    expect(sms.includes("https://go.example.com/autopay/abc")).toBe(true);
    expect(/[—–‘’“”]/.test(sms)).toBe(false);
  });
});
