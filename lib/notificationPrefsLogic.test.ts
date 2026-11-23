import { describe, it, expect } from "vitest";
import {
  DEFAULT_PREFS,
  describePrefs,
  parseReminderChannel,
  recipientsForChannel,
} from "./notificationPrefsLogic";

const both = { emails: ["a@b.com"], phones: ["(480) 555-1234"] };

describe("recipientsForChannel", () => {
  it("keeps everyone for both", () => {
    expect(recipientsForChannel("both", both)).toEqual(both);
  });
  it("text only drops emails", () => {
    expect(recipientsForChannel("text", both)).toEqual({ emails: [], phones: ["(480) 555-1234"] });
  });
  it("email only drops phones", () => {
    expect(recipientsForChannel("email", both)).toEqual({ emails: ["a@b.com"], phones: [] });
  });
  it("falls back to the other channel when the chosen one is empty", () => {
    const onlyEmail = { emails: ["a@b.com"], phones: [] as string[] };
    expect(recipientsForChannel("text", onlyEmail)).toEqual(onlyEmail);
    const onlyPhone = { emails: [] as string[], phones: ["(480) 555-1234"] };
    expect(recipientsForChannel("email", onlyPhone)).toEqual(onlyPhone);
  });
});

describe("parse and describe", () => {
  it("defaults unknown values to both", () => {
    expect(parseReminderChannel("nonsense")).toBe("both");
    expect(parseReminderChannel(null)).toBe("both");
    expect(parseReminderChannel("text")).toBe("text");
  });
  it("describes only non-default choices", () => {
    expect(describePrefs(DEFAULT_PREFS).length).toBe(0);
    expect(
      describePrefs({ reminderChannel: "text", reviewRequestsEnabled: false, promotionsEnabled: false })
    ).toEqual(["reminders by text only", "no review requests", "no promotions"]);
  });
});
