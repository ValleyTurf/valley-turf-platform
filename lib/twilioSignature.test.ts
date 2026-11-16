import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { verifyTwilioSignature } from "./twilioSignature";

const URL = "https://go.example.test/api/webhooks/twilio-status";
const PARAMS = { MessageSid: "SM1", MessageStatus: "delivered" };

function sign(token: string): string {
  return crypto
    .createHmac("sha1", token)
    .update(URL + "MessageSidSM1MessageStatusdelivered")
    .digest("base64");
}

describe("verifyTwilioSignature", () => {
  it("accepts a correctly signed request", () => {
    expect(verifyTwilioSignature("token", URL, PARAMS, sign("token"))).toBe(true);
  });

  it("rejects a signature made with a different token", () => {
    expect(verifyTwilioSignature("token", URL, PARAMS, sign("other"))).toBe(false);
  });

  it("rejects garbage", () => {
    expect(verifyTwilioSignature("token", URL, PARAMS, "AAAA")).toBe(false);
  });

  it("rejects when a parameter was changed", () => {
    expect(
      verifyTwilioSignature("token", URL, { ...PARAMS, MessageStatus: "failed" }, sign("token"))
    ).toBe(false);
  });
});
