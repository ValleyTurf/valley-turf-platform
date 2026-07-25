import { describe, expect, it } from "vitest";
import { normalizePhone, normalizeEmail } from "./matching";

describe("normalizePhone", () => {
  it("strips formatting from a plain 10-digit number", () => {
    expect(normalizePhone("(480) 555-1234")).toBe("4805551234");
    expect(normalizePhone("480-555-1234")).toBe("4805551234");
    expect(normalizePhone("480.555.1234")).toBe("4805551234");
  });

  it("strips a leading country-code 1 from an 11-digit number", () => {
    expect(normalizePhone("14805551234")).toBe("4805551234");
    expect(normalizePhone("1 (480) 555-1234")).toBe("4805551234");
  });

  it("does not strip a leading 1 that's part of an area code, not a country code", () => {
    // A 10-digit number that happens to start with 1 is not an 11-digit
    // country-coded number — normalizePhone only special-cases length 11.
    expect(normalizePhone("1234567890")).toBe("1234567890");
  });

  it("returns null for numbers that aren't 10 or 11-with-leading-1 digits", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("123456789012")).toBeNull();
    // 11 digits but not starting with 1 — not a recognized country-code
    // pattern, so this is rejected rather than guessed at.
    expect(normalizePhone("24805551234")).toBeNull();
  });

  it("returns null for missing input", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });

  it("returns null for input with no digits at all", () => {
    expect(normalizePhone("not a phone number")).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("trims whitespace and lowercases", () => {
    expect(normalizeEmail("  Test@Example.COM  ")).toBe("test@example.com");
  });

  it("returns null for missing input", () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });

  it("returns null for a string that's only whitespace", () => {
    expect(normalizeEmail("   ")).toBeNull();
  });
});
