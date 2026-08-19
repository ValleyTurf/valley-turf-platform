import { describe, expect, it } from "vitest";
import {
  isPathAllowedForRole,
  type RolePermissionsMap,
} from "./permissionRules";

const ALL_ALLOWED: RolePermissionsMap = {
  manager: {
    job_costing: true,
    financials: true,
    marketing_analytics: true,
    customer_intelligence: true,
    settings_audit: true,
    quotes: true,
    jobs: true,
    customer_portal: true,
    general_access: true,
  },
  staff: {
    job_costing: true,
    financials: true,
    marketing_analytics: true,
    customer_intelligence: true,
    settings_audit: true,
    quotes: true,
    jobs: true,
    customer_portal: true,
    general_access: true,
  },
};

const NONE_ALLOWED: RolePermissionsMap = {
  manager: {
    job_costing: false,
    financials: false,
    marketing_analytics: false,
    customer_intelligence: false,
    settings_audit: false,
    quotes: false,
    jobs: false,
    customer_portal: false,
    general_access: false,
  },
  staff: {
    job_costing: false,
    financials: false,
    marketing_analytics: false,
    customer_intelligence: false,
    settings_audit: false,
    quotes: false,
    jobs: false,
    customer_portal: false,
    general_access: false,
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

  it("gates /quotes the same way as any other section", () => {
    expect(isPathAllowedForRole("/quotes", "staff", NONE_ALLOWED)).toBe(
      false
    );
    expect(isPathAllowedForRole("/quotes", "staff", ALL_ALLOWED)).toBe(true);
    expect(
      isPathAllowedForRole("/quotes/new", "manager", NONE_ALLOWED)
    ).toBe(false);
  });

  it("gates /jobs the same way as any other section", () => {
    expect(isPathAllowedForRole("/jobs/new", "staff", NONE_ALLOWED)).toBe(
      false
    );
    expect(isPathAllowedForRole("/jobs/new", "staff", ALL_ALLOWED)).toBe(
      true
    );
    expect(
      isPathAllowedForRole("/jobs/new", "manager", NONE_ALLOWED)
    ).toBe(false);
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
    // A path like "/teamwork" should not match the "/team" prefix.
    expect(isPathAllowedForRole("/teamwork", "staff", NONE_ALLOWED)).toBe(
      true
    );
  });

  it("resolves /customers/intelligence to customer_intelligence, not general_access, even though /customers is also gated", () => {
    const customerIntelOnly: RolePermissionsMap = {
      ...NONE_ALLOWED,
      staff: { ...NONE_ALLOWED.staff, customer_intelligence: true },
    };

    expect(
      isPathAllowedForRole("/customers/intelligence", "staff", customerIntelOnly)
    ).toBe(true);
    // general_access is still off, so plain /customers stays blocked.
    expect(
      isPathAllowedForRole("/customers", "staff", customerIntelOnly)
    ).toBe(false);
  });

  it("gates general_access the same way as any other section", () => {
    expect(isPathAllowedForRole("/dashboard", "staff", NONE_ALLOWED)).toBe(
      false
    );
    expect(isPathAllowedForRole("/dashboard", "staff", ALL_ALLOWED)).toBe(
      true
    );
    expect(isPathAllowedForRole("/schedule", "manager", NONE_ALLOWED)).toBe(
      false
    );
    expect(isPathAllowedForRole("/customers", "staff", NONE_ALLOWED)).toBe(
      false
    );
    expect(
      isPathAllowedForRole("/customers/123", "staff", NONE_ALLOWED)
    ).toBe(false);
    expect(isPathAllowedForRole("/job-costs", "staff", NONE_ALLOWED)).toBe(
      false
    );
    // /job-costing-analytics is a different, already-gated (job_costing)
    // path that merely shares a prefix with /job-costs — must not be
    // affected by general_access at all.
    expect(
      isPathAllowedForRole("/job-costing-analytics", "staff", {
        ...NONE_ALLOWED,
        staff: { ...NONE_ALLOWED.staff, job_costing: true },
      })
    ).toBe(true);
  });

  it("gates Seasonal Trends under financials, not job_costing, despite sharing the /job-costing-analytics URL prefix", () => {
    // financials granted, job_costing not — should still be allowed,
    // since the page moved to the Financials nav group.
    expect(
      isPathAllowedForRole("/job-costing-analytics/trends", "staff", {
        ...NONE_ALLOWED,
        staff: { ...NONE_ALLOWED.staff, financials: true },
      })
    ).toBe(true);

    // job_costing granted, financials not — should now be blocked, the
    // reverse of how it worked before the move.
    expect(
      isPathAllowedForRole("/job-costing-analytics/trends", "staff", {
        ...NONE_ALLOWED,
        staff: { ...NONE_ALLOWED.staff, job_costing: true },
      })
    ).toBe(false);
  });

  it("leaves My Day, Timeclock, and account/logout-style paths open to every role regardless of permissions", () => {
    expect(isPathAllowedForRole("/my-day", "staff", NONE_ALLOWED)).toBe(
      true
    );
    expect(isPathAllowedForRole("/timeclock", "staff", NONE_ALLOWED)).toBe(
      true
    );
    expect(isPathAllowedForRole("/account", "staff", NONE_ALLOWED)).toBe(
      true
    );
  });

  it("leaves the Knowledge Base itself open to every role regardless of permissions, since it isn't in any gated section", () => {
    expect(
      isPathAllowedForRole("/knowledge-base", "staff", NONE_ALLOWED)
    ).toBe(true);
    expect(
      isPathAllowedForRole(
        "/knowledge-base/9f1c-some-article-id",
        "staff",
        NONE_ALLOWED
      )
    ).toBe(true);
  });

  it("blocks staff from Knowledge Base's manager-plus prefixes (new article) but allows manager and admin", () => {
    expect(
      isPathAllowedForRole("/knowledge-base/new", "staff", ALL_ALLOWED)
    ).toBe(false);
    expect(
      isPathAllowedForRole("/knowledge-base/new", "manager", ALL_ALLOWED)
    ).toBe(true);
    expect(
      isPathAllowedForRole("/knowledge-base/new", "admin", NONE_ALLOWED)
    ).toBe(true);
  });

  it("blocks staff from Crew Status and Timecards even with every section granted", () => {
    expect(isPathAllowedForRole("/crew-status", "staff", ALL_ALLOWED)).toBe(
      false
    );
    expect(isPathAllowedForRole("/timecards", "staff", ALL_ALLOWED)).toBe(
      false
    );
    expect(isPathAllowedForRole("/crew-status", "manager", ALL_ALLOWED)).toBe(
      true
    );
  });
});
