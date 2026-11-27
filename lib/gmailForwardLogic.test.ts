import { describe, expect, it } from "vitest";
import {
  classifyForwardedMail,
  extractEmail,
  isAutomatedSender,
  parseAddressList,
} from "./gmailForwardLogic";

describe("extractEmail", () => {
  it("pulls the address out of a display name", () => {
    expect(extractEmail("Jane Doe <Jane.Doe@Example.com>")).toBe("jane.doe@example.com");
  });
  it("accepts a bare address and rejects junk", () => {
    expect(extractEmail("a@b.co")).toBe("a@b.co");
    expect(extractEmail("not an email")).toBeNull();
    expect(extractEmail(undefined)).toBeNull();
  });
});

describe("parseAddressList", () => {
  it("splits on commas and spaces", () => {
    expect(parseAddressList("A@x.com, b@y.com  c@z.com")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ]);
    expect(parseAddressList(undefined)).toEqual([]);
  });
});

describe("isAutomatedSender", () => {
  it("flags robots but keeps the Gmail forwarding confirmation", () => {
    expect(isAutomatedSender("noreply@shop.com")).toBe(true);
    expect(isAutomatedSender("no-reply+abc@shop.com")).toBe(true);
    expect(isAutomatedSender("mailer-daemon@googlemail.com")).toBe(true);
    expect(isAutomatedSender("forwarding-noreply@google.com")).toBe(false);
    expect(isAutomatedSender("jane@example.com")).toBe(false);
  });
});

describe("classifyForwardedMail", () => {
  const own = ["ryan@gmail.com"];

  it("treats a customer email as inbound from the sender", () => {
    const result = classifyForwardedMail({
      from: "Jane <jane@example.com>",
      to: ["ryan@gmail.com"],
      ownAddresses: own,
    });
    expect(result).toEqual({ kind: "mail", direction: "inbound", counterpart: "jane@example.com" });
  });

  it("treats mail from an own address as outbound to the recipient", () => {
    const result = classifyForwardedMail({
      from: "ryan@gmail.com",
      to: ["jane@example.com", "ryan@gmail.com"],
      ownAddresses: own,
    });
    expect(result).toEqual({ kind: "mail", direction: "outbound", counterpart: "jane@example.com" });
  });

  it("ignores automated senders", () => {
    expect(
      classifyForwardedMail({ from: "noreply@x.com", to: ["ryan@gmail.com"], ownAddresses: own }).kind
    ).toBe("ignore");
  });

  it("keeps the Gmail confirmation as inbound", () => {
    const result = classifyForwardedMail({
      from: "Gmail Team <forwarding-noreply@google.com>",
      to: ["inbox@reply.example.com"],
      ownAddresses: own,
    });
    expect(result.kind).toBe("mail");
  });
});
