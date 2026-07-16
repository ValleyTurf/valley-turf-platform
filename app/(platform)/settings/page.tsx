import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const settingsSections = [
  {
    title: "Jobber Sync",
    description:
      "Monitor Jobber synchronization, run manual syncs, review webhook activity, and manage automated data updates.",
    href: "/settings/jobber",
    icon: "🔄",
    status: "Connected",
  },
  {
    title: "System Health",
    description:
      "Diagnostic checks on synced data — subject/status field integrity, cost snapshot accuracy, and sync freshness.",
    href: "/health",
    icon: "🩺",
    status: "Monitor",
  },
];

export default function SettingsPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        padding: "32px",
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
              "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "20px",
          }}
        >
          {settingsSections.map((section) => (
            <Link
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
                Open settings →
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
