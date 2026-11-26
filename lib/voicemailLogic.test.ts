import { describe, it, expect } from "vitest";
import {
  formatVoicemailLength,
  isUsableRecording,
  isValidRecordingSid,
  shouldTakeVoicemail,
  voicemailGreeting,
  voicemailTwiml,
} from "./voicemailLogic";

describe("voicemail logic", () => {
  it("takes voicemail only when nobody answered", () => {
    expect(shouldTakeVoicemail("no-answer")).toBe(true);
    expect(shouldTakeVoicemail("busy")).toBe(true);
    expect(shouldTakeVoicemail("failed")).toBe(true);
    expect(shouldTakeVoicemail("completed")).toBe(false);
    expect(shouldTakeVoicemail(undefined)).toBe(false);
  });

  it("ignores hang-ups", () => {
    expect(isUsableRecording("1")).toBe(false);
    expect(isUsableRecording("2")).toBe(true);
    expect(isUsableRecording(undefined)).toBe(false);
  });

  it("validates recording ids", () => {
    expect(isValidRecordingSid("RE" + "a".repeat(32))).toBe(true);
    expect(isValidRecordingSid("RE123")).toBe(false);
    expect(isValidRecordingSid("../etc")).toBe(false);
    expect(isValidRecordingSid(null)).toBe(false);
  });

  it("formats length", () => {
    expect(formatVoicemailLength("23")).toBe("0:23");
    expect(formatVoicemailLength(125)).toBe("2:05");
    expect(formatVoicemailLength(undefined)).toBe("0:00");
  });

  it("builds TwiML with an escaped greeting and action", () => {
    const xml = voicemailTwiml({ greeting: voicemailGreeting("Valley & Co"), actionUrl: "https://x.com/a?b=1&c=2" });
    expect(xml.includes("Valley &amp; Co")).toBe(true);
    expect(xml.includes("b=1&amp;c=2")).toBe(true);
    expect(xml.includes("<Record")).toBe(true);
  });
});
