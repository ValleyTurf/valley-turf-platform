export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";

type Customer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  first_job_at: string | null;
  last_job_at: string | null;
  total_jobs: number | null;
  total_completed_jobs: number | null;
  reactivation_status: string | null;
  reactivation_last_contacted_at: string | null;
  reactivation_next_follow_up_at: string | null;
  reactivation_contact_attempts: number | null;
};

type ReactivationPriority = {
  label: string;
  background: string;
  color: string;
};

type Filter =
  | "all"
  | "candidate"
  | "contacted"
  | "follow_up"
  | "booked"
  | "win_back";

const SIX_MONTHS_IN_DAYS = 183;
const NINE_MONTHS_IN_DAYS = 274;
const TWELVE_MONTHS_IN_DAYS = 365;

async function updateReactivationStatus(formData: FormData) {
  "use server";

  const customerId = String(
    formData.get("customer_id") ?? ""
  ).trim();

  const status = String(
    formData.get("status") ?? ""
  ).trim();

  if (!customerId || !status) {
    return;
  }

  const allowedStatuses = [
    "candidate",
    "contacted",
    "follow_up",
    "booked",
    "not_interested",
    "removed",
  ];

  if (!allowedStatuses.includes(status)) {
    return;
  }

  const { data: customer, error: customerError } =
    await supabaseServer
      .from("customers")
      .select(
        `
          reactivation_contact_attempts,
          reactivation_last_contacted_at,
          reactivation_next_follow_up_at
        `
      )
      .eq("id", customerId)
      .single();

  if (customerError || !customer) {
    console.error(
      "Unable to load reactivation customer:",
      customerError
    );

    return;
  }

  const now = new Date();

  let contactAttempts =
    customer.reactivation_contact_attempts ?? 0;

  let lastContactedAt =
    customer.reactivation_last_contacted_at;

  let nextFollowUpAt =
    customer.reactivation_next_follow_up_at;

  if (
    status === "contacted" ||
    status === "follow_up"
  ) {
    lastContactedAt = now.toISOString();

    contactAttempts += 1;

    const followUpDate = new Date(now);

    followUpDate.setDate(
      followUpDate.getDate() + 3
    );

    nextFollowUpAt = followUpDate.toISOString();
  }

  if (
    status === "booked" ||
    status === "not_interested" ||
    status === "removed"
  ) {
    nextFollowUpAt = null;
  }

  const { error: updateError } =
    await supabaseServer
      .from("customers")
      .update({
        reactivation_status: status,
        reactivation_last_contacted_at:
          lastContactedAt,
        reactivation_next_follow_up_at:
          nextFollowUpAt,
        reactivation_contact_attempts:
          contactAttempts,
      })
      .eq("id", customerId);

  if (updateError) {
    console.error(
      "Unable to update reactivation customer:",
      updateError
    );

    return;
  }

  revalidatePath("/reactivation");
}

function customerName(customer: Customer) {
  const fullName = [
    customer.first_name,
    customer.last_name,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    fullName ||
    customer.company_name ||
    "Unnamed Customer"
  );
}

function formatDate(date: string | null) {
  if (!date) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

function daysSince(date: string | null) {
  if (!date) {
    return 0;
  }

  const dateTime = new Date(date).getTime();
  const now = Date.now();

  return Math.floor(
    (now - dateTime) /
      (1000 * 60 * 60 * 24)
  );
}

function formatInactiveTime(date: string | null) {
  const days = daysSince(date);

  if (days < 30) {
    return `${days} days`;
  }

  const months = Math.floor(days / 30);

  if (months < 12) {
    return `${months} mo`;
  }

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  if (remainingMonths === 0) {
    return `${years} yr`;
  }

  return `${years} yr ${remainingMonths} mo`;
}

function getPriority(
  lastJobAt: string | null
): ReactivationPriority {
  const inactiveDays = daysSince(lastJobAt);

  if (
    inactiveDays >= TWELVE_MONTHS_IN_DAYS
  ) {
    return {
      label: "Win-Back",
      background: "#fee2e2",
      color: "#991b1b",
    };
  }

  if (inactiveDays >= NINE_MONTHS_IN_DAYS) {
    return {
      label: "High Priority",
      background: "#ffedd5",
      color: "#9a3412",
    };
  }

  return {
    label: "Reactivation",
    background: "#fef3c7",
    color: "#92400e",
  };
}

function statusLabel(status: string | null) {
  switch (status) {
    case "contacted":
      return "Contacted";

    case "follow_up":
      return "Follow Up";

    case "booked":
      return "Booked";

    case "not_interested":
      return "Not Interested";

    default:
      return "Candidate";
  }
}

function statusStyles(status: string | null) {
  switch (status) {
    case "contacted":
      return {
        background: "#dbeafe",
        color: "#1d4ed8",
      };

    case "follow_up":
      return {
        background: "#fef3c7",
        color: "#92400e",
      };

    case "booked":
      return {
        background: "#dcfce7",
        color: "#166534",
      };

    case "not_interested":
      return {
        background: "#fee2e2",
        color: "#991b1b",
      };

    default:
      return {
        background: "#f3e8ff",
        color: "#7e22ce",
      };
  }
}

function isActiveWorkflowStatus(
  status: string | null
) {
  return [
    "contacted",
    "follow_up",
    "booked",
    "not_interested",
  ].includes(status ?? "");
}

function isSameDay(
  firstDate: Date,
  secondDate: Date
) {
  return (
    firstDate.getFullYear() ===
      secondDate.getFullYear() &&
    firstDate.getMonth() ===
      secondDate.getMonth() &&
    firstDate.getDate() ===
      secondDate.getDate()
  );
}

function isOverdue(customer: Customer) {
  if (!customer.reactivation_next_follow_up_at) {
    return false;
  }

  const followUpDate = new Date(
    customer.reactivation_next_follow_up_at
  );

  const today = new Date();

  followUpDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  return followUpDate.getTime() < today.getTime();
}

function isDueToday(customer: Customer) {
  if (!customer.reactivation_next_follow_up_at) {
    return false;
  }

  return isSameDay(
    new Date(
      customer.reactivation_next_follow_up_at
    ),
    new Date()
  );
}

function isUpcoming(customer: Customer) {
  if (!customer.reactivation_next_follow_up_at) {
    return false;
  }

  const followUpDate = new Date(
    customer.reactivation_next_follow_up_at
  );

  const today = new Date();

  followUpDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  return followUpDate.getTime() > today.getTime();
}

function matchesFilter(
  customer: Customer,
  filter: Filter
) {
  if (filter === "all") {
    return true;
  }

  if (filter === "candidate") {
    return (
      !customer.reactivation_status ||
      customer.reactivation_status === "candidate"
    );
  }

  if (filter === "win_back") {
    return (
      daysSince(customer.last_job_at) >=
        TWELVE_MONTHS_IN_DAYS &&
      (!customer.reactivation_status ||
        customer.reactivation_status === "candidate")
    );
  }

  return customer.reactivation_status === filter;
}

export default async function ReactivationPage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string;
  }>;
}) {
  const params = await searchParams;

  const allowedFilters: Filter[] = [
    "all",
    "candidate",
    "contacted",
    "follow_up",
    "booked",
    "win_back",
  ];

  const requestedFilter = params.filter as Filter;

  const activeFilter = allowedFilters.includes(
    requestedFilter
  )
    ? requestedFilter
    : "all";

  const { data: exclusionsData } = await supabaseServer
    .from("customer_intelligence_exclusions")
    .select("jobber_client_id")
    .eq("exclusion_type", "reactivation");

  const excludedClientIds = (exclusionsData ?? []).map(
    (row) => row.jobber_client_id
  );

  const idListForFilter =
    excludedClientIds.length > 0
      ? excludedClientIds.map((id) => `"${id}"`).join(",")
      : '"__none__"';

  const { data: customers, error } = await supabaseServer
    .from("customers")
    .select(
      `
        id,
        first_name,
        last_name,
        company_name,
        email,
        phone,
        first_job_at,
        last_job_at,
        total_jobs,
        total_completed_jobs,
        reactivation_status,
        reactivation_last_contacted_at,
        reactivation_next_follow_up_at,
        reactivation_contact_attempts
      `
    )
    .gt("total_completed_jobs", 0)
    .not("last_job_at", "is", null)
    .neq("reactivation_status", "removed")
    .not("jobber_client_id", "in", `(${idListForFilter})`)
    .order("last_job_at", {
      ascending: true,
    })
    .limit(1000);

  if (error) {
    return (
      <main style={{ padding: "32px" }}>
        <h1>Customer Reactivation</h1>

        <div
          style={{
            marginTop: "24px",
            padding: "20px",
            borderRadius: "12px",
            background: "#fee2e2",
            color: "#991b1b",
          }}
        >
          Unable to load reactivation customers.

          <div style={{ marginTop: "8px" }}>
            {error.message}
          </div>
        </div>
      </main>
    );
  }

  const allCustomers =
    (customers ?? []) as Customer[];

  const customerList = allCustomers.filter(
    (customer) => {
      const inactiveDays = daysSince(
        customer.last_job_at
      );

      return (
        inactiveDays >= SIX_MONTHS_IN_DAYS ||
        isActiveWorkflowStatus(
          customer.reactivation_status
        )
      );
    }
  );

  const filteredCustomers = customerList.filter(
    (customer) =>
      matchesFilter(customer, activeFilter)
  );

  const candidates = customerList.filter(
    (customer) =>
      !customer.reactivation_status ||
      customer.reactivation_status === "candidate"
  ).length;

  const contacted = customerList.filter(
    (customer) =>
      customer.reactivation_status === "contacted"
  ).length;

  const followUps = customerList.filter(
    (customer) =>
      customer.reactivation_status === "follow_up"
  ).length;

  const booked = customerList.filter(
    (customer) =>
      customer.reactivation_status === "booked"
  ).length;

  const winBackCustomers = customerList.filter(
    (customer) =>
      daysSince(customer.last_job_at) >=
        TWELVE_MONTHS_IN_DAYS &&
      (!customer.reactivation_status ||
        customer.reactivation_status === "candidate")
  ).length;

  const overdueCustomers = customerList.filter(
    isOverdue
  );

  const dueTodayCustomers = customerList.filter(
    isDueToday
  );

  const upcomingCustomers = customerList.filter(
    isUpcoming
  );

  const filters: {
    value: Filter;
    label: string;
    count: number;
  }[] = [
    {
      value: "all",
      label: "All",
      count: customerList.length,
    },
    {
      value: "candidate",
      label: "Candidates",
      count: candidates,
    },
    {
      value: "contacted",
      label: "Contacted",
      count: contacted,
    },
    {
      value: "follow_up",
      label: "Follow Up",
      count: followUps,
    },
    {
      value: "booked",
      label: "Booked",
      count: booked,
    },
    {
      value: "win_back",
      label: "Win-Back",
      count: winBackCustomers,
    },
  ];

  return (
    <main
      style={{
        padding: "32px",
        minHeight: "100vh",
        background: "#f8fafc",
      }}
    >
      <div style={{ marginBottom: "32px" }}>
        <h1
          style={{
            margin: 0,
            fontSize: "32px",
            color: "#111827",
          }}
        >
          Customer Reactivation
        </h1>

        <p
          style={{
            marginTop: "8px",
            color: "#6b7280",
            fontSize: "16px",
          }}
        >
          Previous customers with no completed service
          in the last 6 months.
        </p>
      </div>

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(5, minmax(0, 1fr))",
          gap: "16px",
          marginBottom: "32px",
        }}
      >
        <MetricCard
          label="Candidates"
          value={candidates}
        />

        <MetricCard
          label="Win-Back"
          value={winBackCustomers}
        />

        <MetricCard
          label="Contacted"
          value={contacted}
        />

        <MetricCard
          label="Follow Ups"
          value={followUps}
        />

        <MetricCard
          label="Booked"
          value={booked}
        />
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(3, minmax(0, 1fr))",
          gap: "16px",
          marginBottom: "32px",
        }}
      >
        <FollowUpCard
          title="Overdue Follow-Ups"
          count={overdueCustomers.length}
          customers={overdueCustomers}
          background="#fef2f2"
          color="#991b1b"
        />

        <FollowUpCard
          title="Due Today"
          count={dueTodayCustomers.length}
          customers={dueTodayCustomers}
          background="#fff7ed"
          color="#9a3412"
        />

        <FollowUpCard
          title="Upcoming"
          count={upcomingCustomers.length}
          customers={upcomingCustomers}
          background="#eff6ff"
          color="#1d4ed8"
        />
      </section>

      <section
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          border: "1px solid #e5e7eb",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <h2
            style={{
              margin: 0,
              color: "#111827",
              fontSize: "20px",
            }}
          >
            Reactivation Pipeline
          </h2>

          <p
            style={{
              margin: "6px 0 0",
              color: "#6b7280",
              fontSize: "14px",
            }}
          >
            {filteredCustomers.length} customers shown.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              marginTop: "18px",
            }}
          >
            {filters.map((filter) => {
              const isActive =
                activeFilter === filter.value;

              return (
                <Link
                  key={filter.value}
                  href={
                    filter.value === "all"
                      ? "/reactivation"
                      : `/reactivation?filter=${filter.value}`
                  }
                  scroll={false}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "7px",
                    padding: "9px 13px",
                    borderRadius: "9px",
                    border: isActive
                      ? "1px solid #111827"
                      : "1px solid #d1d5db",
                    background: isActive
                      ? "#111827"
                      : "#ffffff",
                    color: isActive
                      ? "#ffffff"
                      : "#374151",
                    textDecoration: "none",
                    fontSize: "13px",
                    fontWeight: 700,
                  }}
                >
                  <span>{filter.label}</span>

                  <span
                    style={{
                      padding: "2px 6px",
                      borderRadius: "999px",
                      background: isActive
                        ? "rgba(255,255,255,0.18)"
                        : "#f3f4f6",
                      fontSize: "11px",
                    }}
                  >
                    {filter.count}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {filteredCustomers.length === 0 ? (
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
              color: "#6b7280",
            }}
          >
            No customers match this filter.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f9fafb",
                    textAlign: "left",
                  }}
                >
                  <TableHeader>Customer</TableHeader>
                  <TableHeader>Priority</TableHeader>
                  <TableHeader>
                    Last Service
                  </TableHeader>
                  <TableHeader>Inactive</TableHeader>
                  <TableHeader>Jobs</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>
                    Last Contact
                  </TableHeader>
                  <TableHeader>
                    Follow Up
                  </TableHeader>
                  <TableHeader>
                    Attempts
                  </TableHeader>
                  <TableHeader>Actions</TableHeader>
                  <TableHeader />
                </tr>
              </thead>

              <tbody>
                {filteredCustomers.map((customer) => {
                  const statusStyle =
                    statusStyles(
                      customer.reactivation_status
                    );

                  const priority = getPriority(
                    customer.last_job_at
                  );

                  return (
                    <tr
                      key={customer.id}
                      style={{
                        borderTop:
                          "1px solid #e5e7eb",
                      }}
                    >
                      <TableCell>
                        <div
                          style={{
                            fontWeight: 600,
                            color: "#111827",
                          }}
                        >
                          {customerName(customer)}
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gap: "2px",
                            marginTop: "5px",
                            color: "#6b7280",
                            fontSize: "12px",
                          }}
                        >
                          <span>
                            {customer.phone ||
                              "No phone"}
                          </span>

                          <span>
                            {customer.email ||
                              "No email"}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <span
                          style={{
                            display: "inline-flex",
                            padding: "6px 10px",
                            borderRadius: "999px",
                            fontSize: "12px",
                            fontWeight: 700,
                            background:
                              priority.background,
                            color: priority.color,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {priority.label}
                        </span>
                      </TableCell>

                      <TableCell>
                        {formatDate(
                          customer.last_job_at
                        )}
                      </TableCell>

                      <TableCell>
                        <strong>
                          {formatInactiveTime(
                            customer.last_job_at
                          )}
                        </strong>
                      </TableCell>

                      <TableCell>
                        {customer.total_completed_jobs ??
                          0}
                      </TableCell>

                      <TableCell>
                        <span
                          style={{
                            display: "inline-flex",
                            padding: "6px 10px",
                            borderRadius: "999px",
                            fontSize: "12px",
                            fontWeight: 700,
                            ...statusStyle,
                          }}
                        >
                          {statusLabel(
                            customer.reactivation_status
                          )}
                        </span>
                      </TableCell>

                      <TableCell>
                        {formatDate(
                          customer.reactivation_last_contacted_at
                        )}
                      </TableCell>

                      <TableCell>
                        {formatDate(
                          customer.reactivation_next_follow_up_at
                        )}
                      </TableCell>

                      <TableCell>
                        {customer.reactivation_contact_attempts ??
                          0}
                      </TableCell>

                      <TableCell>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "6px",
                            minWidth: "220px",
                          }}
                        >
                          <StatusButton
                            customerId={customer.id}
                            status="contacted"
                            label="Contacted"
                          />

                          <StatusButton
                            customerId={customer.id}
                            status="follow_up"
                            label="Follow Up"
                          />

                          <StatusButton
                            customerId={customer.id}
                            status="booked"
                            label="Booked"
                          />

                          <StatusButton
                            customerId={customer.id}
                            status="not_interested"
                            label="Not Interested"
                          />

                          <StatusButton
                            customerId={customer.id}
                            status="removed"
                            label="Remove"
                          />
                        </div>
                      </TableCell>

                      <TableCell>
                        <Link
                          href={`/customers/${customer.id}`}
                          style={{
                            display: "inline-flex",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            background: "#111827",
                            color: "#ffffff",
                            textDecoration: "none",
                            fontSize: "13px",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          View Customer
                        </Link>
                      </TableCell>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function FollowUpCard({
  title,
  count,
  customers,
  background,
  color,
}: {
  title: string;
  count: number;
  customers: Customer[];
  background: string;
  color: string;
}) {
  return (
    <div
      style={{
        padding: "20px",
        borderRadius: "14px",
        background,
        border: "1px solid #e5e7eb",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <div
          style={{
            fontSize: "15px",
            fontWeight: 700,
            color,
          }}
        >
          {title}
        </div>

        <div
          style={{
            fontSize: "28px",
            fontWeight: 800,
            color,
          }}
        >
          {count}
        </div>
      </div>

      <div
        style={{
          marginTop: "16px",
          display: "grid",
          gap: "8px",
        }}
      >
        {customers.length === 0 ? (
          <div
            style={{
              color: "#6b7280",
              fontSize: "13px",
            }}
          >
            No customers
          </div>
        ) : (
          customers.slice(0, 5).map((customer) => (
            <Link
              key={customer.id}
              href={`/customers/${customer.id}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                textDecoration: "none",
                color: "#374151",
                fontSize: "13px",
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                }}
              >
                {customerName(customer)}
              </span>

              <span>
                {formatDate(
                  customer.reactivation_next_follow_up_at
                )}
              </span>
            </Link>
          ))
        )}

        {customers.length > 5 && (
          <div
            style={{
              marginTop: "4px",
              color: "#6b7280",
              fontSize: "12px",
            }}
          >
            + {customers.length - 5} more
          </div>
        )}
      </div>
    </div>
  );
}

function StatusButton({
  customerId,
  status,
  label,
}: {
  customerId: string;
  status: string;
  label: string;
}) {
  return (
    <form action={updateReactivationStatus}>
      <input
        type="hidden"
        name="customer_id"
        value={customerId}
      />

      <input
        type="hidden"
        name="status"
        value={status}
      />

      <button
        type="submit"
        style={{
          padding: "7px 9px",
          borderRadius: "7px",
          border: "1px solid #d1d5db",
          background: "#ffffff",
          color: "#374151",
          fontSize: "11px",
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </button>
    </form>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div
      style={{
        padding: "22px",
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "14px",
      }}
    >
      <div
        style={{
          color: "#6b7280",
          fontSize: "14px",
          fontWeight: 600,
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: "8px",
          fontSize: "30px",
          fontWeight: 700,
          color: "#111827",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function TableHeader({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <th
      style={{
        padding: "14px 16px",
        color: "#6b7280",
        fontSize: "12px",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function TableCell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <td
      style={{
        padding: "16px",
        color: "#374151",
        fontSize: "14px",
        verticalAlign: "middle",
      }}
    >
      {children}
    </td>
  );
}
