import { describe, it, expect } from "vitest";
import {
  formatPhone,
  isValidEmail,
  phoneDigits,
  validateExtraContact,
  validatePrimaryContact,
} from "./portalContactLogic";

describe("phone", () => {
  it("accepts common US formats", () => {
    expect(phoneDigits("(480) 555-1234")).toBe("4805551234");
    expect(phoneDigits("+1 480-555-1234")).toBe("4805551234");
    expect(phoneDigits("480.555.1234")).toBe("4805551234");
  });
  it("rejects short or long numbers", () => {
    expect(phoneDigits("555-1234") === null).toBe(true);
    expect(phoneDigits("123456789012") === null).toBe(true);
  });
  it("formats", () => {
    expect(formatPhone("4805551234")).toBe("(480) 555-1234");
  });
});

describe("email", () => {
  it("validates", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a b@c.com")).toBe(false);
  });
});

describe("validatePrimaryContact", () => {
  it("normalizes email and phone", () => {
    const r = validatePrimaryContact({ email: "  Ryan@Example.COM ", phone: "480 555 1234" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.email).toBe("ryan@example.com");
      expect(r.phone).toBe("(480) 555-1234");
    }
  });
  it("allows clearing one but not both", () => {
    const onlyEmail = validatePrimaryContact({ email: "a@b.com", phone: "" });
    expect(onlyEmail.ok).toBe(true);
    const neither = validatePrimaryContact({ email: "", phone: "" });
    expect(neither.ok).toBe(false);
    if (!neither.ok) expect(neither.error).toBe("need_one");
  });
  it("reports bad values", () => {
    const badEmail = validatePrimaryContact({ email: "nope", phone: "" });
    if (!badEmail.ok) expect(badEmail.error).toBe("invalid_email");
    const badPhone = validatePrimaryContact({ email: "", phone: "12" });
    if (!badPhone.ok) expect(badPhone.error).toBe("invalid_phone");
    expect(badEmail.ok || badPhone.ok).toBe(false);
  });
});

describe("validateExtraContact", () => {
  it("trims and keeps the notification flag", () => {
    const r = validateExtraContact({
      name: " Jamie ",
      label: " Spouse ",
      email: "",
      phone: "4805551234",
      receivesNotifications: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.contactName).toBe("Jamie");
      expect(r.value.label).toBe("Spouse");
      expect(r.value.receivesNotifications).toBe(true);
    }
  });
});
