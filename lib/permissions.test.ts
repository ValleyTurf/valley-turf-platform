import { describe, expect, it } from "vitest";
import {
  isPathAllowedForRole,
  type RolePermissionsMap,
} from "./permissions";

const ALL_ALLOWED: RolePermissionsMap = {
  manager: {
    job_costing: true,
    financials: true,
    marketing_analytics: true,
    customer_intelligence: true,
    settings_audit: true,
  },
  staff: {
    job_costing: true,
    financials: true,
    marketing_analytics: true,
    customer_intelligence: true,
    settings_audit: true,
  },
};

const NONE_ALLOWED: RolePermissionsMap = {
  manager: {
    job_costing: false,
    financials: false,
    marketing_analytics: false,
    customer_intelligence: false,
    settings_audit: false,
  },
  staff: {
    job_costing: false,
    financials: false,
    marketing_analytics: false,
    customer_intelligence: false,
    settings_audit: false,
  },
};

describe("isPathAllowedForRole", () => {
  it("always allows admin, regardless of the permissions table", () => {
    expect(isPathAllowedForRole("/team", "admin", NONE_ALLOWED)).toBe(true);
    expect(isPathAllowedForRole("/api/backup/export", "admin", NONE_ALLOWED)).toBe(
      true
    );
    expect(
      isPathAllowedForRole("/settings/permissions", "admin", NONE_ALLOWED)
    ).toBe(true);
  });

  it("never allows Team, Backup, or the Permissions page for non-admins, even if everything else is granted", () => {
    expect(isPathAllowedForRole("/team", "manager", ALL_ALLOWED)).toBe(false);
    expect(isPathAllowedForRole("/team/123", "staff", ALL_ALLOWED)).toBe(
      false
    );
    expect(
      isPathAllowedForRole("/api/backup/export", "manager", ALL_ALLOWED)
    ).toBe(false);
    expect(
      isPathAllowedForRole("/settings/permissions", "manager", ALL_ALLOWED)
    ).toBe(false);
  });

  it("gates each section on the role_permissions value for that role", () => {
    expect(
      isPathAllowedForRole("/materials", "manager", NONE_ALLOWED)
    ).toBe(false);
    expect(isPathAllowedForRole("/materials", "manager", ALL_ALLOWED)).toBe(
      true
    );
    expect(isPathAllowedForRole("/revenue", "staff", ALL_ALLOWED)).toBe(true);
    expect(isPathAllowedForRole("/revenue", "staff", NONE_ALLOWED)).toBe(
      false
    );
  });

  it("matches nested paths under a gated section prefix", () => {
    expect(
      isPathAllowedForRole("/customers/intelligence", "manager", ALL_ALLOWED)
    ).toBe(true);
    expect(
      isPathAllowedForRole(
        "/customers/intelligence",
        "manager",
        NONE_ALLOWED
      )
    ).toBe(false);
    expect(
      isPathAllowedForRole("/settings/jobber", "manager", ALL_ALLOWED)
    ).toBe(true);
  });

  it("does not false-positive match a path that merely starts with the same characters", () => {
    // /customers is NOT gated, only /customers/intelligence is.
    expect(isPathAllowedForRole("/customers", "staff", NONE_ALLOWED)).toBe(
      true
    );
    expect(
      isPathAllowedForRole("/customers/123", "staff", NONE_ALLOWED)
    ).toBe(true);

    // A path like "/teamwork" should not match the "/team" prefix.
    expect(isPathAllowedForRole("/teamwork", "staff", NONE_ALLOWED)).toBe(
      true
    );
  });

  it("leaves ungated paths open to every role", () => {
    expect(isPathAllowedForRole("/dashboard", "staff", NONE_ALLOWED)).toBe(
      true
    );
    expect(isPathAllowedForRole("/schedule", "manager", NONE_ALLOWED)).toBe(
      true
    );
    expect(isPathAllowedForRole("/account", "staff", NONE_ALLOWED)).toBe(
      true
    );
  });
});
