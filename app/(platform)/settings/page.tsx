import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SettingsSection = {
  title: string;
  description: string;
  href: string;
  icon: string;
  status: string;
  external?: boolean;
  // Structurally admin-only sections (Team, Data Backup) that stay
  // hidden from managers even though they can otherwise view this page —
  // these aren't part of the editable role_permissions table.
  adminOnly?: boolean;
};

const settingsSections: SettingsSection[] = [
  {
    title: "Team",
    description:
      "Manage individual logins, roles, and access. Add or remove team members and reset passwords.",
    href: "/team",
    icon: "🧑‍🤝‍🧑",
    status: "Manage",
    adminOnly: true,
  },
  {
    title: "Permissions",
    description:
      "Control which feature groups Manager and Staff logins can see.",
    href: "/settings/permissions",
    icon: "🔐",
    status: "Manage",
    adminOnly: true,
  },
  {
    title: "Jobber Sync",
    description:
      "Monitor Jobber synchronization, run manual syncs, review webhook activity, and manage automated data updates.",
    href: "/settings/jobber",
    icon: "🔄",
    status: "Connected",
  },
  {
    title: "Notifications",
    description:
      "Configure automated pre-visit text/email reminders and (once ready) review request messages.",
    href: "/settings/notifications",
    icon: "🔔",
    status: "Manage",
    adminOnly: true,
  },
  {
    title: "System Health",
    description:
      "Diagnostic checks on synced data — subject/status field integrity, cost snapshot accuracy, and sync freshness.",
    href: "/health",
    icon: "🩺",
    status: "Monitor",
  },
  {
    title: "Data Backup",
    description:
      "Download a ZIP of CSV files covering customers, leads, campaigns, materials, job costing data, and everything else that only lives here — not in Jobber.",
    href: "/api/backup/export",
    icon: "💾",
    status: "Download",
    external: true,
    adminOnly: true,
  },
];

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "admin";

  const visibleSections = settingsSections.filter(
    (section) => !section.adminOnly || isAdmin
  );

  return (
    <main
      className="px-4 py-6 sm:p-8"
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            marginBottom: "32px",
          }}
        >
          <h1
            style={{
              margin: "0 0 8px",
              fontSize: "32px",
              color: "#0f172a",
            }}
          >
            Settings
          </h1>

          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: "16px",
            }}
          >
            Manage integrations and system configuration for the Valley Turf
            Revival business platform.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "20px",
          }}
        >
          {visibleSections.map((section) => {
            const CardTag = section.external ? "a" : Link;

            return (
            <CardTag
              key={section.href}
              href={section.href}
              style={{
                display: "block",
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "16px",
                padding: "24px",
                textDecoration: "none",
                boxShadow:
                  "0 1px 3px rgba(15, 23, 42, 0.05)",
                transition:
                  "transform 0.15s ease, box-shadow 0.15s ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: "16px",
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: "52px",
                      height: "52px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "14px",
                      background: "#f1f5f9",
                      fontSize: "26px",
                      flexShrink: 0,
                    }}
                  >
                    {section.icon}
                  </div>

                  <div>
                    <h2
                      style={{
                        margin: "0 0 8px",
                        color: "#0f172a",
                        fontSize: "20px",
                      }}
                    >
                      {section.title}
                    </h2>

                    <p
                      style={{
                        margin: 0,
                        color: "#64748b",
                        fontSize: "14px",
                        lineHeight: 1.6,
                      }}
                    >
                      {section.description}
                    </p>
                  </div>
                </div>

                <span
                  style={{
                    padding: "6px 10px",
                    borderRadius: "999px",
                    background: "#dcfce7",
                    color: "#166534",
                    fontSize: "12px",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {section.status}
                </span>
              </div>

              <div
                style={{
                  marginTop: "22px",
                  paddingTop: "18px",
                  borderTop: "1px solid #f1f5f9",
                  color: "#174734",
                  fontSize: "14px",
                  fontWeight: 700,
                }}
              >
                {section.external ? "Download →" : "Open settings →"}
              </div>
            </CardTag>
            );
          })}
        </div>
      </div>
    </main>
  );
}
