import { describe, expect, it } from "vitest";
import { isAdminOnlyPath, ADMIN_ONLY_PREFIXES } from "./permissions";

describe("isAdminOnlyPath", () => {
  it("matches every registered admin-only prefix exactly", () => {
    for (const prefix of ADMIN_ONLY_PREFIXES) {
      expect(isAdminOnlyPath(prefix)).toBe(true);
    }
  });

  it("matches nested paths under an admin-only prefix", () => {
    expect(isAdminOnlyPath("/team/123")).toBe(true);
    expect(isAdminOnlyPath("/settings/jobber")).toBe(true);
    expect(isAdminOnlyPath("/customers/intelligence")).toBe(true);
  });

  it("does not match unrelated paths", () => {
    expect(isAdminOnlyPath("/dashboard")).toBe(false);
    expect(isAdminOnlyPath("/schedule")).toBe(false);
    expect(isAdminOnlyPath("/account")).toBe(false);
  });

  it("does not false-positive match a path that merely starts with the same characters", () => {
    // /customers is NOT admin-only, only /customers/intelligence is —
    // this guards against a naive `.startsWith` bug on the prefix itself.
    expect(isAdminOnlyPath("/customers")).toBe(false);
    expect(isAdminOnlyPath("/customers/123")).toBe(false);

    // A path like "/teamwork" should not match the "/team" prefix.
    expect(isAdminOnlyPath("/teamwork")).toBe(false);
  });
});
