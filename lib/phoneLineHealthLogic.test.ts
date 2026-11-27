import { describe, it, expect } from "vitest";
import { evaluatePhoneLine, type PhoneLineInput } from "./phoneLineHealthLogic";

const good: PhoneLineInput = {
  fromNumber: "+14804391340",
  twilioReachable: true,
  numberFound: true,
  voiceCapable: true,
  voiceUrl: "https://go.valleyturfrevival.com/api/webhooks/twilio-voice",
  voiceMethod: "POST",
  smsUrl: "https://go.valleyturfrevival.com/api/webhooks/twilio",
  balance: 40,
  forwardNumbers: ["+15039995502"],
  savedCellCount: 1,
  expectedVoiceUrl: "https://go.valleyturfrevival.com/api/webhooks/twilio-voice",
  expectedSmsPath: "/api/webhooks/twilio",
};

describe("evaluatePhoneLine", () => {
  it("passes when everything is right", () => {
    expect(evaluatePhoneLine(good)).toEqual([]);
  });
  it("fails when calls are not pointed at the CRM", () => {
    const f = evaluatePhoneLine({ ...good, voiceUrl: "https://handler.twilio.com/twiml/EH123" });
    expect(f.length).toBe(1);
    expect(f[0].severity).toBe("fail");
  });
  it("ignores a trailing slash and case", () => {
    expect(evaluatePhoneLine({ ...good, voiceUrl: "HTTPS://go.valleyturfrevival.com/api/webhooks/twilio-voice/" })).toEqual([]);
  });
  it("warns on low balance and fails on very low", () => {
    expect(evaluatePhoneLine({ ...good, balance: 10 })[0].severity).toBe("warn");
    expect(evaluatePhoneLine({ ...good, balance: 2 })[0].severity).toBe("fail");
  });
  it("fails on a forwarding loop", () => {
    const f = evaluatePhoneLine({ ...good, forwardNumbers: ["+14804391340"] });
    expect(f.some((x) => x.severity === "fail")).toBe(true);
  });
  it("warns when no cell is saved", () => {
    expect(evaluatePhoneLine({ ...good, savedCellCount: 0 })[0].severity).toBe("warn");
  });
  it("handles a missing number and unreachable Twilio", () => {
    expect(evaluatePhoneLine({ ...good, fromNumber: null })[0].severity).toBe("fail");
    expect(evaluatePhoneLine({ ...good, twilioReachable: false })[0].severity).toBe("warn");
    expect(evaluatePhoneLine({ ...good, numberFound: false })[0].severity).toBe("fail");
  });
  it("warns when texts point somewhere else", () => {
    expect(evaluatePhoneLine({ ...good, smsUrl: "https://example.com/sms" })[0].severity).toBe("warn");
    expect(evaluatePhoneLine({ ...good, smsUrl: "" })).toEqual([]);
  });
});
