import { describe, it, expect } from "vitest";
import {
  describeReasons,
  findDuplicatePairs,
  normalizeAddress,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  pairKey,
  suggestKeeper,
  type DupCustomer,
} from "./duplicateCustomersLogic";

const c = (id: string, over: Partial<DupCustomer> = {}): DupCustomer => ({
  id,
  name: null,
  email: null,
  phone: null,
  addressLine1: null,
  city: null,
  ...over,
});

describe("normalizers", () => {
  it("reads phones in any format", () => {
    expect(normalizePhone("(602) 555-1234")).toBe("6025551234");
    expect(normalizePhone("+1 602-555-1234")).toBe("6025551234");
    expect(normalizePhone("555-1234")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it("lowercases emails and rejects non-emails", () => {
    expect(normalizeEmail(" Bob@Example.COM ")).toBe("bob@example.com");
    expect(normalizeEmail("n/a")).toBeNull();
  });

  it("ignores punctuation and case in names", () => {
    expect(normalizeName("Bob  O'Neil")).toBe("bob o neil");
    expect(normalizeName("ab")).toBeNull();
  });

  it("treats street abbreviations as equal", () => {
    expect(normalizeAddress("123 North Main Street")).toBe(normalizeAddress("123 N. Main St"));
    expect(normalizeAddress("Main Street")).toBeNull();
  });
});

describe("findDuplicatePairs", () => {
  it("finds same phone and same email", () => {
    const pairs = findDuplicatePairs(
      [
        c("1", { name: "Bob Smith", phone: "602-555-1234" }),
        c("2", { name: "Robert Smith", phone: "(602) 555-1234", email: "b@x.com" }),
        c("3", { name: "Zed", email: "b@x.com" }),
      ],
      new Set()
    );
    expect(pairs).toHaveLength(2);
  });

  it("calls same name and address high confidence", () => {
    const pairs = findDuplicatePairs(
      [
        c("1", { name: "Ann Lee", addressLine1: "10 West Oak Drive" }),
        c("2", { name: "ann lee", addressLine1: "10 W Oak Dr" }),
      ],
      new Set()
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0].confidence).toBe("high");
    expect(pairs[0].reasons).toEqual(["name_address"]);
  });

  it("calls a shared phone with different names only possible", () => {
    const pairs = findDuplicatePairs(
      [
        c("1", { name: "Ann Lee", phone: "6025551234" }),
        c("2", { name: "Tom Lee", phone: "6025551234" }),
      ],
      new Set()
    );
    expect(pairs[0].confidence).toBe("possible");
  });

  it("calls two matching details high confidence", () => {
    const pairs = findDuplicatePairs(
      [
        c("1", { name: "Ann Lee", phone: "6025551234", email: "a@x.com" }),
        c("2", { name: "Tom Lee", phone: "6025551234", email: "A@x.com" }),
      ],
      new Set()
    );
    expect(pairs[0].confidence).toBe("high");
    expect(pairs[0].reasons).toHaveLength(2);
  });

  it("skips dismissed pairs", () => {
    const list = [
      c("1", { name: "Ann Lee", phone: "6025551234" }),
      c("2", { name: "Tom Lee", phone: "6025551234" }),
    ];
    expect(findDuplicatePairs(list, new Set([pairKey("2", "1")]))).toHaveLength(0);
  });

  it("ignores a phone shared by many customers", () => {
    const list = Array.from({ length: 7 }, (_, i) =>
      c(String(i), { name: `Person ${i}`, phone: "6025551234" })
    );
    expect(findDuplicatePairs(list, new Set())).toHaveLength(0);
  });

  it("puts high confidence first", () => {
    const pairs = findDuplicatePairs(
      [
        c("1", { name: "Ann Lee", phone: "6025550000" }),
        c("2", { name: "Tom Lee", phone: "6025550000" }),
        c("3", { name: "Sue Kim", email: "s@x.com" }),
        c("4", { name: "Sue Kim", email: "s@x.com" }),
      ],
      new Set()
    );
    expect(pairs[0].confidence).toBe("high");
  });
});

describe("suggestKeeper and labels", () => {
  it("keeps the one with more history", () => {
    const a = c("a");
    const b = c("b");
    const activity = new Map([["b", { invoices: 3, jobs: 1 }]]);
    expect(suggestKeeper(a, b, activity)).toBe("b");
  });

  it("falls back to more contact details, then id", () => {
    expect(suggestKeeper(c("a"), c("b", { email: "x@y.com" }), new Map())).toBe("b");
    expect(suggestKeeper(c("a"), c("b"), new Map())).toBe("a");
  });

  it("describes reasons", () => {
    expect(describeReasons(["phone", "email"])).toBe("same phone, same email");
  });
});
