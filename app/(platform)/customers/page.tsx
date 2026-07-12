export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

type CustomersPageProps = {
  searchParams: Promise<{
    search?: string;
    page?: string;
    filter?: string;
  }>;
};

type Customer = {
  id: string;
  jobber_client_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  current_balance: number | string | null;
  last_synced_at: string | null;
};

type RecurringCustomer = {
  jobber_client_id: string;
  recurring_categories: string[] | null;
};

type RecurringFilter = "all" | "recurring" | "non-recurring" | string;

const BASE_FILTER_OPTIONS: { key: RecurringFilter; label: string }[] = [
  { key: "all", label: "All Customers" },
  { key: "recurring", label: "Recurring Only" },
  { key: "non-recurring", label: "Non-Recurring Only" },
];

const CATEGORY_FILTER_OPTIONS: {
  key: string;
  label: string;
  category: string;
}[] = [
  {
    key: "monthly-maintenance",
    label: "Monthly Maintenance",
    category: "Monthly Maintenance",
  },
  {
    key: "quarterly-cleaning",
    label: "Quarterly Cleaning",
    category: "Quarterly Cleaning",
  },
  {
    key: "bimonthly-cleaning",
    label: "Bimonthly Cleaning",
    category: "Bimonthly Cleaning",
  },
  {
    key: "semi-annual-cleaning",
    label: "Semi-Annual Cleaning",
    category: "Semi-Annual Cleaning",
  },
  {
    key: "weekly-maintenance",
    label: "Weekly Maintenance",
    category: "Weekly Maintenance",
  },
];

const VALID_FILTER_KEYS = [
  ...BASE_FILTER_OPTIONS.map((option) => option.key),
  ...CATEGORY_FILTER_OPTIONS.map((option) => option.key),
];

const PAGE_SIZE = 30;

function formatPhone(phone: string | null): string {
  if (!phone) {
    return "No phone";
  }

  const digits = phone.replace(/\D/g, "");

  const normalized =
    digits.length === 11 && digits.startsWith("1")
      ? digits.slice(1)
      : digits;

  if (normalized.length !== 10) {
    return phone;
  }

  return `(${normalized.slice(0, 3)}) ${normalized.slice(
    3,
    6
  )}-${normalized.slice(6)}`;
}

function formatCurrency(value: number | string | null): string {
  const amount = Number(value ?? 0);

  if (Number.isNaN(amount)) {
    return "$0.00";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Not synced";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not synced";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function escapeSearchValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, "\\,")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildCustomersUrl(
  page: number,
  search: string,
  filter: RecurringFilter
): string {
  const params = new URLSearchParams();

  if (search) {
    params.set("search", search);
  }

  if (filter !== "all") {
    params.set("filter", filter);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();

  return query ? `/customers?${query}` : "/customers";
}

function formatCategoryBadge(categories: string[]): string {
  if (categories.length === 0) {
    return "Recurring";
  }

  if (categories.length === 1) {
    return categories[0];
  }

  return `${categories[0]} +${categories.length - 1} more`;
}

export default async function CustomersPage({
  searchParams,
}: CustomersPageProps) {
  const params = await searchParams;

  const search = String(params.search ?? "").trim();

  const filter = (VALID_FILTER_KEYS.includes(params.filter ?? "")
    ? params.filter
    : "all") as RecurringFilter;

  const requestedPage = Number.parseInt(params.page ?? "1", 10);

  const currentPage =
    Number.isFinite(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const recurringResult = await supabaseServer
    .from("recurring_customers")
    .select("jobber_client_id, recurring_categories");

  const recurringCustomers = (recurringResult.data ??
    []) as RecurringCustomer[];

  const recurringMap = new Map<string, string[]>(
    recurringCustomers.map((row) => [
      row.jobber_client_id,
      row.recurring_categories ?? [],
    ])
  );

  const recurringIds = recurringCustomers.map((row) => row.jobber_client_id);

  let query = supabaseServer
    .from("customers")
    .select(
      `
        id,
        jobber_client_id,
        full_name,
        first_name,
        last_name,
        company_name,
        email,
        phone,
        city,
        state,
        current_balance,
        last_synced_at
      `,
      {
        count: "exact",
      }
    )
    .order("full_name", {
      ascending: true,
      nullsFirst: false,
    });

  if (search) {
    const safeSearch = escapeSearchValue(search);

    query = query.or(
      [
        `full_name.ilike.%${safeSearch}%`,
        `first_name.ilike.%${safeSearch}%`,
        `last_name.ilike.%${safeSearch}%`,
        `company_name.ilike.%${safeSearch}%`,
        `email.ilike.%${safeSearch}%`,
        `phone.ilike.%${safeSearch}%`,
        `city.ilike.%${safeSearch}%`,
        `state.ilike.%${safeSearch}%`,
      ].join(",")
    );
  }

  let noResultsForFilter = false;

  if (filter === "recurring") {
    if (recurringIds.length === 0) {
      noResultsForFilter = true;
    } else {
      query = query.in("jobber_client_id", recurringIds);
    }
  } else if (filter === "non-recurring") {
    if (recurringIds.length > 0) {
      const idList = recurringIds.map((id) => `"${id}"`).join(",");
      query = query.not("jobber_client_id", "in", `(${idList})`);
    }
  } else {
    const matchedCategory = CATEGORY_FILTER_OPTIONS.find(
      (option) => option.key === filter
    );

    if (matchedCategory) {
      const categoryIds = recurringCustomers
        .filter((row) =>
          (row.recurring_categories ?? []).includes(matchedCategory.category)
        )
        .map((row) => row.jobber_client_id);

      if (categoryIds.length === 0) {
        noResultsForFilter = true;
      } else {
        query = query.in("jobber_client_id", categoryIds);
      }
    }
  }

  const { data, count, error } = noResultsForFilter
    ? { data: [], count: 0, error: null }
    : await query.range(from, to);

  const customers = (data ?? []) as Customer[];
  const totalCustomers = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCustomers / PAGE_SIZE));

  const firstCustomerNumber =
    totalCustomers === 0 ? 0 : from + 1;

  const lastCustomerNumber =
    totalCustomers === 0
      ? 0
      : Math.min(from + customers.length, totalCustomers);

  const previousPageUrl = buildCustomersUrl(
    Math.max(1, currentPage - 1),
    search,
    filter
  );

  const nextPageUrl = buildCustomersUrl(
    Math.min(totalPages, currentPage + 1),
    search,
    filter
  );

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Customer Database
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              Customers
            </h1>

            <p className="mt-2 text-[#6b705c]">
              Search and view customers synchronized from Jobber.
            </p>

            <div className="mt-3 flex items-center gap-2 text-sm text-[#6b705c]">
              <span className="h-3 w-3 rounded-full border-2 border-[#174734] bg-[#eef4ee]" />
              <span>
                Highlighted cards have an active recurring service
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/api/jobber/sync-customers"
              className="rounded-xl bg-[#d4af37] px-5 py-3 text-center text-sm font-bold text-[#174734] transition hover:bg-[#e6c766]"
            >
              Sync Jobber Customers
            </Link>

            <Link
              href="/"
              className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Home
            </Link>
          </div>
        </header>

        <section className="mt-8 rounded-3xl bg-white p-6 shadow">
          <form
            action="/customers"
            method="get"
            className="flex flex-col gap-3 sm:flex-row"
          >
            <label
              htmlFor="customer-search"
              className="sr-only"
            >
              Search customers
            </label>

            <input
              id="customer-search"
              name="search"
              type="search"
              defaultValue={search}
              placeholder="Search name, email, phone, company, city..."
              className="min-w-0 flex-1 rounded-xl border border-[#d9d4c6] bg-white px-4 py-3 text-[#174734] outline-none transition placeholder:text-[#8b8d82] focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />

            {filter !== "all" && (
              <input type="hidden" name="filter" value={filter} />
            )}

            <button
              type="submit"
              className="rounded-xl bg-[#174734] px-6 py-3 font-bold text-white transition hover:bg-[#226246]"
            >
              Search
            </button>

            {search && (
              <Link
                href="/customers"
                className="rounded-xl border border-[#d9d4c6] px-6 py-3 text-center font-bold transition hover:bg-[#f7f6f1]"
              >
                Clear
              </Link>
            )}
          </form>
        </section>

        <section className="mt-6 flex flex-wrap gap-2">
          {BASE_FILTER_OPTIONS.map((option) => (
            <Link
              key={option.key}
              href={buildCustomersUrl(1, search, option.key)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                filter === option.key
                  ? "bg-[#174734] text-white"
                  : "border border-[#d9d4c6] bg-white text-[#174734] hover:bg-[#f7f6f1]"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </section>

        <section className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-semibold text-[#6b705c]">
            By service:
          </span>

          {CATEGORY_FILTER_OPTIONS.map((option) => (
            <Link
              key={option.key}
              href={buildCustomersUrl(1, search, option.key)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                filter === option.key
                  ? "bg-[#9c7a20] text-white"
                  : "border border-[#e3ded1] bg-white text-[#9c7a20] hover:bg-[#faf4e3]"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </section>

        <section className="mt-6">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-semibold">
              Showing {firstCustomerNumber}–{lastCustomerNumber} of{" "}
              {totalCustomers} customer
              {totalCustomers === 1 ? "" : "s"}
            </p>

            {search && (
              <p className="text-sm text-[#6b705c]">
                Search results for “{search}”
              </p>
            )}
          </div>

          {error ? (
            <div className="rounded-3xl border border-red-200 bg-white p-8 shadow">
              <h2 className="text-2xl font-bold text-red-700">
                Customers could not be loaded
              </h2>

              <p className="mt-3 text-red-600">
                {error.message}
              </p>
            </div>
          ) : customers.length === 0 ? (
            <div className="rounded-3xl bg-white p-8 shadow">
              <h2 className="text-2xl font-bold">
                No customers found
              </h2>

              <p className="mt-2 text-[#6b705c]">
                {search
                  ? "Try a different name, email address, phone number, company, or city."
                  : "Run the Jobber customer sync to load customer records."}
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {customers.map((customer) => {
                const customerName =
                  customer.full_name ||
                  [customer.first_name, customer.last_name]
                    .filter(Boolean)
                    .join(" ") ||
                  customer.company_name ||
                  "Unnamed Customer";

                const location = [
                  customer.city,
                  customer.state,
                ]
                  .filter(Boolean)
                  .join(", ");

                const recurringCategories = recurringMap.get(
                  customer.jobber_client_id
                );
                const isRecurring = Boolean(
                  recurringCategories && recurringCategories.length > 0
                );

                return (
                  <Link
                    key={customer.id}
                    href={`/customers/${encodeURIComponent(
                      customer.jobber_client_id
                    )}`}
                    className={`block rounded-3xl border p-7 shadow transition hover:-translate-y-1 hover:shadow-lg ${
                      isRecurring
                        ? "border-[#174734] bg-[#eef4ee] hover:border-[#174734]"
                        : "border-transparent bg-white hover:border-[#d4af37]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9c7a20]">
                          Customer
                        </p>

                        <h2 className="mt-3 text-2xl font-bold">
                          {customerName}
                        </h2>

                        {customer.company_name &&
                          customer.company_name !== customerName && (
                            <p className="mt-1 text-[#6b705c]">
                              {customer.company_name}
                            </p>
                          )}
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        {isRecurring && (
                          <span className="w-fit rounded-full bg-[#174734] px-3 py-1 text-xs font-bold text-white">
                            {formatCategoryBadge(recurringCategories ?? [])}
                          </span>
                        )}

                        <span className="rounded-full bg-[#f7f6f1] px-3 py-1 text-xs font-bold">
                          Jobber
                        </span>
                      </div>
                    </div>

                    <div className="mt-6 space-y-4 text-sm">
                      <div>
                        <p className="font-bold">Email</p>
                        <p className="mt-1 break-words text-[#6b705c]">
                          {customer.email || "No email"}
                        </p>
                      </div>

                      <div>
                        <p className="font-bold">Phone</p>
                        <p className="mt-1 text-[#6b705c]">
                          {formatPhone(customer.phone)}
                        </p>
                      </div>

                      {location && (
                        <div>
                          <p className="font-bold">Location</p>
                          <p className="mt-1 text-[#6b705c]">
                            {location}
                          </p>
                        </div>
                      )}

                      <div>
                        <p className="font-bold">Current Balance</p>
                        <p className="mt-1 text-[#6b705c]">
                          {formatCurrency(customer.current_balance)}
                        </p>
                      </div>
                    </div>

                    <div
                      className={`mt-6 rounded-2xl p-4 ${
                        isRecurring ? "bg-white" : "bg-[#f7f6f1]"
                      }`}
                    >
                      <p className="font-semibold">
                        View full customer details →
                      </p>

                      <p className="mt-1 text-xs text-[#6b705c]">
                        Synced {formatDate(customer.last_synced_at)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {totalCustomers > 0 && (
          <nav
            aria-label="Customer pagination"
            className="mt-8 flex flex-col items-center justify-between gap-4 rounded-3xl bg-white p-5 shadow sm:flex-row"
          >
            {currentPage > 1 ? (
              <Link
                href={previousPageUrl}
                className="w-full rounded-xl border border-[#d9d4c6] px-5 py-3 text-center font-bold transition hover:bg-[#f7f6f1] sm:w-auto"
              >
                ← Previous
              </Link>
            ) : (
              <span className="w-full cursor-not-allowed rounded-xl border border-[#e6e2d8] px-5 py-3 text-center font-bold text-[#aaa99f] sm:w-auto">
                ← Previous
              </span>
            )}

            <p className="font-semibold">
              Page {Math.min(currentPage, totalPages)} of {totalPages}
            </p>

            {currentPage < totalPages ? (
              <Link
                href={nextPageUrl}
                className="w-full rounded-xl bg-[#174734] px-5 py-3 text-center font-bold text-white transition hover:bg-[#226246] sm:w-auto"
              >
                Next →
              </Link>
            ) : (
              <span className="w-full cursor-not-allowed rounded-xl bg-[#d5d5cf] px-5 py-3 text-center font-bold text-white sm:w-auto">
                Next →
              </span>
            )}
          </nav>
        )}
      </div>
    </main>
  );
}
