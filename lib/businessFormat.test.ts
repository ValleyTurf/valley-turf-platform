import { describe, expect, it } from "vitest";
import {
  buildBusiness,
  DEFAULT_BUSINESS_INPUT,
  normalizePhoneDigits,
  normalizeWebsite,
  validateBusinessInput,
} from "./businessFormat";

describe("buildBusiness", () => {
  it("formats the phone for texts and for invoices", () => {
    const business = buildBusiness(DEFAULT_BUSINESS_INPUT);

    expect(business.phoneDashed).toBe("480-331-4596");
    expect(business.phoneDisplay).toBe("(480) 331-4596");
  });
});

describe("normalizePhoneDigits", () => {
  it("accepts the usual ways of typing a number", () => {
    expect(normalizePhoneDigits("(480) 331-4596")).toBe("4803314596");
    expect(normalizePhoneDigits("480.331.4596")).toBe("4803314596");
    expect(normalizePhoneDigits("+1 480 331 4596")).toBe("4803314596");
  });

  it("rejects numbers that are not ten digits", () => {
    expect(normalizePhoneDigits("331-4596")).toBeNull();
    expect(normalizePhoneDigits("")).toBeNull();
    expect(normalizePhoneDigits("+44 20 7946 0958")).toBeNull();
  });
});

describe("normalizeWebsite", () => {
  it("drops the scheme, trailing slash and capitals", () => {
    expect(normalizeWebsite(" https://www.Example.com/ ")).toBe("www.example.com");
  });
});

describe("validateBusinessInput", () => {
  const good = {
    name: " Test Co ",
    phone: "(555) 123-4567",
    website: "https://test.example/",
    ownerFirstName: "Sam",
  };

  it("cleans up good input", () => {
    expect(validateBusinessInput(good)).toEqual({
      ok: true,
      value: {
        name: "Test Co",
        phoneDigits: "5551234567",
        website: "test.example",
        ownerFirstName: "Sam",
      },
    });
  });

  it("explains what is wrong", () => {
    expect(validateBusinessInput({ ...good, name: "" })).toEqual({
      ok: false,
      error: "Enter the business name.",
    });
    expect(validateBusinessInput({ ...good, phone: "123" })).toEqual({
      ok: false,
      error: "Enter a 10 digit phone number.",
    });
    expect(validateBusinessInput({ ...good, website: "nodot" }).ok).toBe(false);
    expect(validateBusinessInput({ ...good, name: "A <b> Co" }).ok).toBe(false);
    expect(validateBusinessInput({ ...good, ownerFirstName: "" }).ok).toBe(false);
  });
});
