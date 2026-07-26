import { describe, expect, it } from "vitest";
import { diffRecords } from "./auditLog";

describe("diffRecords", () => {
  it("returns only fields that actually changed", () => {
    const changes = diffRecords(
      { name: "Alice", role: "staff", active: true },
      { name: "Alice", role: "admin", active: true }
    );

    expect(changes).toEqual({
      role: { before: "staff", after: "admin" },
    });
  });

  it("returns an empty object when nothing changed", () => {
    expect(
      diffRecords({ name: "Alice" }, { name: "Alice" })
    ).toEqual({});
  });

  it("redacts password fields instead of exposing their value", () => {
    const changes = diffRecords(
      { password_hash: "oldhash" },
      { password_hash: "newhash" }
    );

    expect(changes).toEqual({
      password_hash: { before: "[redacted]", after: "[redacted]" },
    });
  });

  it("does not flag a redacted field as changed when it never actually changed", () => {
    const changes = diffRecords(
      { password_hash: "samehash", name: "Alice" },
      { password_hash: "samehash", name: "Alice" }
    );

    expect(changes).toEqual({});
  });

  it("ignores bookkeeping timestamp fields", () => {
    const changes = diffRecords(
      { name: "Alice", updated_at: "2026-01-01" },
      { name: "Alice", updated_at: "2026-07-01" }
    );

    expect(changes).toEqual({});
  });

  it("treats a field only present on one side as a change", () => {
    const changes = diffRecords({ notes: null }, { notes: "New note" });

    expect(changes).toEqual({
      notes: { before: null, after: "New note" },
    });
  });

  it("handles null before/after records (create/delete cases)", () => {
    expect(diffRecords(null, { name: "Alice" })).toEqual({
      name: { before: null, after: "Alice" },
    });

    expect(diffRecords({ name: "Alice" }, null)).toEqual({
      name: { before: "Alice", after: null },
    });
  });
});
