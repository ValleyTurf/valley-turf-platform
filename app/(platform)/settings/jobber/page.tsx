export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import SyncButton from "./SyncButton";

type SyncStatus = {
  id: string;
  sync_type: string;
  status: string;
  last_started_at: string | null;
  last_completed_at: string | null;
  last_failed_at: string | null;
  last_success_at: string | null;
  records_received: number;
  records_saved: number;
  pages_processed: number;
  throttle_retries: number;
  last_error: string | null;
};

type SyncRun = {
  id: string;
  sync_type: string;
  sync_mode: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  records_received: number;
  records_saved: number;
  pages_processed: number;
  throttle_retries: number;
  error_message: string | null;
};

type WebhookEvent = {
  id: string;
  topic: string;
  jobber_item_id: string | null;
  status: string;
  attempts: number;
  processed_at: string | null;
  created_at: string;
};

type SyncConfiguration = {
  label: string;
  endpoint: string;
};

const SYNC_CONFIG: Record<
  string,
  SyncConfiguration
> = {
  customers: {
    label: "Customers",
    endpoint:
      "/api/jobber/sync-customers",
  },
  invoices: {
    label: "Invoices",
    endpoint:
      "/api/jobber/sync-invoices",
  },
  jobs: {
    label: "Jobs",
    endpoint:
      "/api/jobber/sync-jobs",
  },
};

function formatDate(
  value: string | null
) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: "America/Phoenix",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }
  ).format(new Date(value));
}

function formatSyncName(value: string) {
  return value
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ");
}

function statusColor(status: string) {
  switch (status.toLowerCase()) {
    case "healthy":
    case "success":
    case "completed":
      return {
        background: "#dcfce7",
        color: "#166534",
      };

    case "running":
    case "processing":
      return {
        background: "#dbeafe",
        color: "#1d4ed8",
      };

    case "failed":
    case "error":
      return {
        background: "#fee2e2",
        color: "#991b1b",
      };

    case "pending":
      return {
        background: "#fef3c7",
        color: "#92400e",
      };

    default:
      return {
        background: "#f3f4f6",
        color: "#4b5563",
      };
  }
}

export default async function JobberSyncPage() {
  const supabase = supabaseServer;

  const [
    syncStatusResult,
    syncRunsResult,
    webhookEventsResult,
    pendingEventsResult,
    failedEventsResult,
  ] = await Promise.all([
    supabase
      .from("jobber_sync_status")
      .select("*")
      .order("sync_type", {
        ascending: true,
      }),

    supabase
      .from("jobber_sync_runs")
      .select("*")
      .order("started_at", {
        ascending: false,
      })
      .limit(10),

    supabase
      .from("jobber_webhook_events")
      .select(
        "id, topic, jobber_item_id, status, attempts, processed_at, created_at"
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(10),

    supabase
      .from("jobber_webhook_events")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("status", "pending"),

    supabase
      .from("jobber_webhook_events")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("status", "failed"),
  ]);

  const syncStatuses =
    (syncStatusResult.data as
      | SyncStatus[]
      | null) ?? [];

  const syncRuns =
    (syncRunsResult.data as
      | SyncRun[]
      | null) ?? [];

  const webhookEvents =
    (webhookEventsResult.data as
      | WebhookEvent[]
      | null) ?? [];

  const pendingEvents =
    pendingEventsResult.count ?? 0;

  const failedEvents =
    failedEventsResult.count ?? 0;

  const lastWebhook =
    webhookEvents[0] ?? null;

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
          maxWidth: "1400px",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "flex-start",
            gap: "24px",
            marginBottom: "32px",
          }}
        >
          <div>
            <Link
              href="/settings"
              style={{
                color: "#64748b",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              ← Settings
            </Link>

            <h1
              style={{
                margin: "12px 0 6px",
                fontSize: "32px",
                color: "#0f172a",
              }}
            >
              Jobber Sync Control Center
            </h1>

            <p
              style={{
                margin: 0,
                color: "#64748b",
                fontSize: "16px",
              }}
            >
              Monitor Jobber data
              synchronization, webhook activity,
              and sync health.
            </p>
          </div>

          <div
            style={{
              padding: "10px 14px",
              borderRadius: "999px",
              background: "#dcfce7",
              color: "#166534",
              fontWeight: 700,
              fontSize: "14px",
            }}
          >
            ● Jobber Connected
          </div>
        </div>

        <section
          style={{
            marginBottom: "32px",
          }}
        >
          <h2
            style={{
              marginBottom: "16px",
              color: "#0f172a",
              fontSize: "20px",
            }}
          >
            Sync Status
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "18px",
            }}
          >
            {syncStatuses.map((sync) => {
              const badge =
                statusColor(sync.status);

              const configuration =
                SYNC_CONFIG[sync.sync_type];

              return (
                <div
                  key={sync.id}
                  style={{
                    background: "#ffffff",
                    border:
                      "1px solid #e2e8f0",
                    borderRadius: "16px",
                    padding: "22px",
                    boxShadow:
                      "0 1px 3px rgba(15, 23, 42, 0.05)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      alignItems: "center",
                      gap: "12px",
                      marginBottom: "20px",
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        color: "#0f172a",
                        fontSize: "20px",
                      }}
                    >
                      {formatSyncName(
                        sync.sync_type
                      )}
                    </h3>

                    <span
                      style={{
                        ...badge,
                        padding: "6px 10px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: 700,
                        textTransform:
                          "capitalize",
                      }}
                    >
                      {sync.status}
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: "34px",
                      fontWeight: 800,
                      color: "#0f172a",
                      marginBottom: "4px",
                    }}
                  >
                    {sync.records_saved.toLocaleString()}
                  </div>

                  <div
                    style={{
                      color: "#64748b",
                      fontSize: "14px",
                      marginBottom: "20px",
                    }}
                  >
                    records saved
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: "8px",
                      color: "#475569",
                      fontSize: "14px",
                    }}
                  >
                    <div>
                      <strong>
                        Last success:
                      </strong>{" "}
                      {formatDate(
                        sync.last_success_at
                      )}
                    </div>

                    <div>
                      <strong>
                        Pages processed:
                      </strong>{" "}
                      {sync.pages_processed.toLocaleString()}
                    </div>

                    <div>
                      <strong>
                        Throttle retries:
                      </strong>{" "}
                      {sync.throttle_retries.toLocaleString()}
                    </div>
                  </div>

                  {sync.last_error ? (
                    <div
                      style={{
                        marginTop: "16px",
                        padding: "12px",
                        background: "#fef2f2",
                        borderRadius: "10px",
                        color: "#991b1b",
                        fontSize: "13px",
                      }}
                    >
                      {sync.last_error}
                    </div>
                  ) : null}

                  {configuration ? (
                    <SyncButton
                      syncType={
                        configuration.label
                      }
                      endpoint={
                        configuration.endpoint
                      }
                    />
                  ) : (
                    <button
                      type="button"
                      disabled
                      style={{
                        width: "100%",
                        marginTop: "20px",
                        border:
                          "1px solid #cbd5e1",
                        background: "#f8fafc",
                        color: "#64748b",
                        padding: "10px 14px",
                        borderRadius: "10px",
                        fontWeight: 700,
                        cursor:
                          "not-allowed",
                      }}
                    >
                      Sync unavailable
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "18px",
            marginBottom: "32px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              border:
                "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "22px",
            }}
          >
            <h2
              style={{
                margin: "0 0 18px",
                color: "#0f172a",
                fontSize: "20px",
              }}
            >
              Automatic Sync
            </h2>

            <div
              style={{
                display: "grid",
                gap: "16px",
              }}
            >
              <div>
                <div
                  style={{
                    color: "#64748b",
                    fontSize: "13px",
                    marginBottom: "4px",
                  }}
                >
                  Webhook Status
                </div>

                <div
                  style={{
                    fontWeight: 700,
                    color: "#92400e",
                  }}
                >
                  ● Not Configured
                </div>
              </div>

              <div>
                <div
                  style={{
                    color: "#64748b",
                    fontSize: "13px",
                    marginBottom: "4px",
                  }}
                >
                  Last Webhook
                </div>

                <div
                  style={{
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  {lastWebhook
                    ? `${lastWebhook.topic} · ${formatDate(
                        lastWebhook.created_at
                      )}`
                    : "No webhook events received"}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              background: "#ffffff",
              border:
                "1px solid #e2e8f0",
              borderRadius: "16px",
              padding: "22px",
            }}
          >
            <h2
              style={{
                margin: "0 0 18px",
                color: "#0f172a",
                fontSize: "20px",
              }}
            >
              Event Queue
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: "16px",
              }}
            >
              <div
                style={{
                  padding: "18px",
                  borderRadius: "12px",
                  background: "#fffbeb",
                }}
              >
                <div
                  style={{
                    fontSize: "30px",
                    fontWeight: 800,
                    color: "#92400e",
                  }}
                >
                  {pendingEvents}
                </div>

                <div
                  style={{
                    color: "#92400e",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  Pending Events
                </div>
              </div>

              <div
                style={{
                  padding: "18px",
                  borderRadius: "12px",
                  background: "#fef2f2",
                }}
              >
                <div
                  style={{
                    fontSize: "30px",
                    fontWeight: 800,
                    color: "#991b1b",
                  }}
                >
                  {failedEvents}
                </div>

                <div
                  style={{
                    color: "#991b1b",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  Failed Events
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            background: "#ffffff",
            border:
              "1px solid #e2e8f0",
            borderRadius: "16px",
            padding: "22px",
            marginBottom: "32px",
          }}
        >
          <h2
            style={{
              margin: "0 0 18px",
              color: "#0f172a",
              fontSize: "20px",
            }}
          >
            Recent Sync Activity
          </h2>

          {syncRuns.length === 0 ? (
            <div
              style={{
                padding: "32px",
                textAlign: "center",
                color: "#64748b",
              }}
            >
              No tracked sync runs yet.
            </div>
          ) : (
            <div
              style={{
                overflowX: "auto",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse:
                    "collapse",
                  fontSize: "14px",
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom:
                        "1px solid #e2e8f0",
                      textAlign: "left",
                    }}
                  >
                    <th style={{ padding: "12px" }}>
                      Started
                    </th>
                    <th style={{ padding: "12px" }}>
                      Data
                    </th>
                    <th style={{ padding: "12px" }}>
                      Mode
                    </th>
                    <th style={{ padding: "12px" }}>
                      Status
                    </th>
                    <th style={{ padding: "12px" }}>
                      Saved
                    </th>
                    <th style={{ padding: "12px" }}>
                      Pages
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {syncRuns.map((run) => {
                    const badge =
                      statusColor(run.status);

                    return (
                      <tr
                        key={run.id}
                        style={{
                          borderBottom:
                            "1px solid #f1f5f9",
                        }}
                      >
                        <td
                          style={{
                            padding:
                              "14px 12px",
                          }}
                        >
                          {formatDate(
                            run.started_at
                          )}
                        </td>

                        <td
                          style={{
                            padding:
                              "14px 12px",
                            fontWeight: 700,
                          }}
                        >
                          {formatSyncName(
                            run.sync_type
                          )}
                        </td>

                        <td
                          style={{
                            padding:
                              "14px 12px",
                          }}
                        >
                          {formatSyncName(
                            run.sync_mode
                          )}
                        </td>

                        <td
                          style={{
                            padding:
                              "14px 12px",
                          }}
                        >
                          <span
                            style={{
                              ...badge,
                              padding:
                                "5px 9px",
                              borderRadius:
                                "999px",
                              fontSize: "12px",
                              fontWeight: 700,
                              textTransform:
                                "capitalize",
                            }}
                          >
                            {run.status}
                          </span>
                        </td>

                        <td
                          style={{
                            padding:
                              "14px 12px",
                          }}
                        >
                          {run.records_saved.toLocaleString()}
                        </td>

                        <td
                          style={{
                            padding:
                              "14px 12px",
                          }}
                        >
                          {run.pages_processed.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          style={{
            background: "#ffffff",
            border:
              "1px solid #e2e8f0",
            borderRadius: "16px",
            padding: "22px",
          }}
        >
          <h2
            style={{
              margin: "0 0 18px",
              color: "#0f172a",
              fontSize: "20px",
            }}
          >
            Recent Webhook Events
          </h2>

          {webhookEvents.length === 0 ? (
            <div
              style={{
                padding: "32px",
                textAlign: "center",
                color: "#64748b",
              }}
            >
              No Jobber webhook events
              received yet.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: "10px",
              }}
            >
              {webhookEvents.map((event) => {
                const badge =
                  statusColor(event.status);

                return (
                  <div
                    key={event.id}
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      alignItems: "center",
                      gap: "16px",
                      padding: "14px",
                      border:
                        "1px solid #e2e8f0",
                      borderRadius: "10px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          color: "#0f172a",
                        }}
                      >
                        {event.topic}
                      </div>

                      <div
                        style={{
                          color: "#64748b",
                          fontSize: "13px",
                          marginTop: "3px",
                        }}
                      >
                        {formatDate(
                          event.created_at
                        )}

                        {event.jobber_item_id
                          ? ` · ${event.jobber_item_id}`
                          : ""}
                      </div>
                    </div>

                    <span
                      style={{
                        ...badge,
                        padding: "5px 9px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: 700,
                        textTransform:
                          "capitalize",
                      }}
                    >
                      {event.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}