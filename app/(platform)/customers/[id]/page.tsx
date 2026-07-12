export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { jobberGraphQL } from "@/lib/jobber";
import { supabaseServer } from "@/lib/supabase-server";

type CustomerDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type JobberEmail = {
  address: string;
};

type JobberPhone = {
  number: string;
};

type JobberProperty = {
  id: string;
  jobberWebUri: string | null;
  address: {
    street1: string | null;
    street2: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    country: string | null;
  } | null;
};

type JobberJob = {
  id: string;
  jobNumber: number | string | null;
  title: string | null;
  jobStatus: string | null;
  jobType: string | null;
  total: number | string | null;
  startAt: string | null;
  endAt: string | null;
  completedAt: string | null;
  jobberWebUri: string | null;
};

type JobberQuote = {
  id: string;
  quoteNumber: string | number | null;
  title: string | null;
  quoteStatus: string | null;
  createdAt: string | null;
  transitionedAt: string | null;
  jobberWebUri: string | null;
};

type JobberInvoice = {
  id: string;
  invoiceNumber: string | number | null;
  subject: string | null;
  invoiceStatus: string | null;
  issuedDate: string | null;
  dueDate: string | null;
  receivedDate: string | null;
  total: number | string | null;
  jobberWebUri: string | null;
};

type JobberClient = {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  balance: number | string | null;
  createdAt: string | null;
  jobberWebUri: string | null;
  emails: JobberEmail[];
  phones: JobberPhone[];

  clientProperties: {
    nodes: JobberProperty[];
  } | null;

  jobs: {
    nodes: JobberJob[];
  } | null;

  quotes: {
    nodes: JobberQuote[];
  } | null;

  invoices: {
    nodes: JobberInvoice[];
  } | null;
};

type CustomerFinancials = {
  jobber_client_id: string;
  customer_name: string | null;
  invoice_count: number | string | null;
  lifetime_invoiced: number | string | null;
  lifetime_collected: number | string | null;
  outstanding_balance: number | string | null;
  average_invoice: number | string | null;
  first_invoice_date: string | null;
  latest_invoice_date: string | null;
};

async function getJobberClient(id: string): Promise<{
  client: JobberClient | null;
  error: string | null;
}> {
  const result = await jobberGraphQL<{
    client: JobberClient | null;
  }>(
    `
      query GetCustomer($id: EncodedId!) {
        client(id: $id) {
          id
          name
          firstName
          lastName
          companyName
          balance
          createdAt
          jobberWebUri

          emails {
            address
          }

          phones {
            number
          }

          clientProperties(first: 10) {
            nodes {
              id
              jobberWebUri

              address {
                street1
                street2
                city
                province
                postalCode
                country
              }
            }
          }

          jobs(first: 10) {
            nodes {
              id
              jobNumber
              title
              jobStatus
              jobType
              total
              startAt
              endAt
              completedAt
              jobberWebUri
            }
          }

          quotes(first: 10) {
            nodes {
              id
              quoteNumber
              title
              quoteStatus
              createdAt
              transitionedAt
              jobberWebUri
            }
          }

          invoices(first: 10) {
            nodes {
              id
              invoiceNumber
              subject
              invoiceStatus
              issuedDate
              dueDate
              receivedDate
              total
              jobberWebUri
            }
          }
        }
      }
    `,
    {
      id,
    }
  );

  return {
    client: result.data?.client ?? null,
    error:
      result.errors
        ?.map((item) => item.message)
        .filter(Boolean)
        .join(", ") ?? null,
  };
}

async function getCustomerFinancials(
  jobberClientId: string
): Promise<CustomerFinancials | null> {
  const { data, error } = await supabaseServer
    .from("customer_financials")
    .select(
      `
        jobber_client_id,
        customer_name,
        invoice_count,
        lifetime_invoiced,
        lifetime_collected,
        outstanding_balance,
        average_invoice,
        first_invoice_date,
        latest_invoice_date
      `
    )
    .eq("jobber_client_id", jobberClientId)
    .maybeSingle();

  if (error) {
    console.error("Customer financial query failed:", error.message);
    return null;
  }

  return data as CustomerFinancials | null;
}

function toNumber(
  value: number | string | null | undefined
): number {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPhone(phone: string): string {
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

function formatCurrency(
  value: number | string | null | undefined
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(
    value.includes("T") ? value : `${value}T12:00:00`
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatStatus(value: string | null): string {
  if (!value) {
    return "Unknown";
  }

  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatAddress(property: JobberProperty): string {
  const address = property.address;

  if (!address) {
    return "Address unavailable";
  }

  const street = [address.street1, address.street2]
    .filter(Boolean)
    .join(" ");

  const cityState = [address.city, address.province]
    .filter(Boolean)
    .join(", ");

  return [street, cityState, address.postalCode, address.country]
    .filter(Boolean)
    .join(" ");
}

function statusClasses(status: string | null): string {
  const normalized = (status ?? "").toUpperCase();

  if (
    normalized.includes("PAID") ||
    normalized.includes("APPROVED") ||
    normalized.includes("COMPLETED") ||
    normalized.includes("ACTIVE")
  ) {
    return "bg-green-100 text-green-800";
  }

  if (
    normalized.includes("DRAFT") ||
    normalized.includes("PENDING") ||
    normalized.includes("AWAITING")
  ) {
    return "bg-yellow-100 text-yellow-800";
  }

  if (
    normalized.includes("CANCEL") ||
    normalized.includes("DECLINED") ||
    normalized.includes("OVERDUE")
  ) {
    return "bg-red-100 text-red-800";
  }

  return "bg-gray-100 text-gray-700";
}

export default async function CustomerDetailPage({
  params,
}: CustomerDetailPageProps) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  const [{ client, error }, financials] = await Promise.all([
    getJobberClient(decodedId),
    getCustomerFinancials(decodedId),
  ]);

  if (!client) {
    return (
      <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
        <div className="mx-auto max-w-5xl">
          <section className="rounded-3xl bg-white p-8 shadow">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Customer Profile
            </p>

            <h1 className="mt-3 text-3xl font-bold">
              Customer could not be loaded
            </h1>

            <p className="mt-4 text-[#6b705c]">
              {error ?? "No customer information was returned by Jobber."}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/customers"
                className="rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white"
              >
                Back to Customers
              </Link>

              <Link
                href="/api/jobber/connect"
                className="rounded-xl border border-[#174734] px-5 py-3 text-sm font-bold"
              >
                Reconnect Jobber
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const email = client.emails?.[0]?.address ?? null;
  const phone = client.phones?.[0]?.number ?? null;

  const properties = client.clientProperties?.nodes ?? [];
  const jobs = client.jobs?.nodes ?? [];
  const quotes = client.quotes?.nodes ?? [];
  const invoices = client.invoices?.nodes ?? [];

  const lifetimeCollected = toNumber(financials?.lifetime_collected);

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Customer Intelligence
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              {client.name || "Unnamed Customer"}
            </h1>

            {client.companyName && (
              <p className="mt-2 text-lg text-[#6b705c]">
                {client.companyName}
              </p>
            )}

            <p className="mt-2 text-sm text-[#6b705c]">
              Jobber customer since {formatDate(client.createdAt)}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {client.jobberWebUri && (
              <a
                href={client.jobberWebUri}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-[#d4af37] px-5 py-3 text-center text-sm font-bold text-[#174734] transition hover:bg-[#e6c766]"
              >
                Open in Jobber
              </a>
            )}

            <Link
              href="/customers"
              className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Back to Customers
            </Link>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-6">
            <section className="rounded-2xl bg-white p-5 shadow">
              <h2 className="text-lg font-bold">
                Contact Information
              </h2>

              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-bold text-[#9c7a20]">
                      Email
                    </p>

                    {email ? (
                      <a
                        href={`mailto:${email}`}
                        className="mt-0.5 block break-words text-sm font-semibold hover:underline"
                      >
                        {email}
                      </a>
                    ) : (
                      <p className="mt-0.5 text-sm text-[#6b705c]">
                        No email
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-bold text-[#9c7a20]">
                      Phone
                    </p>

                    {phone ? (
                      <a
                        href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                        className="mt-0.5 block text-sm font-semibold hover:underline"
                      >
                        {formatPhone(phone)}
                      </a>
                    ) : (
                      <p className="mt-0.5 text-sm text-[#6b705c]">
                        No phone
                      </p>
                    )}
                  </div>
                </div>

                <div className="sm:text-right">
                  <p className="text-xs font-bold text-[#9c7a20]">
                    Lifetime Collected
                  </p>

                  <p className="mt-0.5 text-2xl font-bold">
                    {formatCurrency(lifetimeCollected)}
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-2 border-t border-[#e7e2d5] pt-4">
                {properties.length > 0 ? (
                  properties.map((property) => {
                    const content = (
                      <p className="text-sm font-semibold">
                        {formatAddress(property)}
                      </p>
                    );

                    if (property.jobberWebUri) {
                      return (
                        <a
                          key={property.id}
                          href={property.jobberWebUri}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-xl bg-[#f7f6f1] px-3 py-2 transition hover:bg-[#efeadf]"
                        >
                          {content}
                        </a>
                      );
                    }

                    return (
                      <div
                        key={property.id}
                        className="rounded-xl bg-[#f7f6f1] px-3 py-2"
                      >
                        {content}
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                    No properties found.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-2xl bg-white p-5 shadow">
              <h2 className="text-lg font-bold">
                Property Profile
              </h2>

              <div className="mt-4 rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                Gate code, pet count, pet names, odor level, subscription
                status, service instructions, and internal notes will be
                editable here.
              </div>
            </section>

            <section className="rounded-2xl bg-white p-5 shadow">
              <h2 className="text-lg font-bold">
                Marketing Attribution
              </h2>

              <div className="mt-4 rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                QR campaign, lead source, first scan, conversion history, and
                campaign-generated revenue will be connected here.
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className="rounded-2xl bg-white p-5 shadow">
              <h2 className="text-lg font-bold">
                Recent Jobs
              </h2>

              <div className="mt-3 space-y-2">
                {jobs.length > 0 ? (
                  jobs.map((job) => {
                    const content = (
                      <>
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold">
                              Job #{job.jobNumber ?? "—"}
                              {job.title ? ` — ${job.title}` : ""}
                            </p>

                            <p className="text-xs text-[#6b705c]">
                              {formatDate(job.startAt)}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <span
                              className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClasses(
                                job.jobStatus
                              )}`}
                            >
                              {formatStatus(job.jobStatus)}
                            </span>

                            <p className="text-sm font-bold">
                              {formatCurrency(job.total)}
                            </p>
                          </div>
                        </div>
                      </>
                    );

                    if (job.jobberWebUri) {
                      return (
                        <a
                          key={job.id}
                          href={job.jobberWebUri}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-xl border border-[#e7e2d5] px-3 py-2 transition hover:border-[#d4af37]"
                        >
                          {content}
                        </a>
                      );
                    }

                    return (
                      <div
                        key={job.id}
                        className="rounded-xl border border-[#e7e2d5] px-3 py-2"
                      >
                        {content}
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                    No jobs found.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-2xl bg-white p-5 shadow">
              <h2 className="text-lg font-bold">
                Recent Quotes
              </h2>

              <div className="mt-3 space-y-2">
                {quotes.length > 0 ? (
                  quotes.map((quote) => {
                    const content = (
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">
                            Quote #{quote.quoteNumber ?? "—"}
                            {quote.title ? ` — ${quote.title}` : ""}
                          </p>

                          <p className="text-xs text-[#6b705c]">
                            Created {formatDate(quote.createdAt)}
                          </p>
                        </div>

                        <span
                          className={`w-fit shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClasses(
                            quote.quoteStatus
                          )}`}
                        >
                          {formatStatus(quote.quoteStatus)}
                        </span>
                      </div>
                    );

                    if (quote.jobberWebUri) {
                      return (
                        <a
                          key={quote.id}
                          href={quote.jobberWebUri}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-xl border border-[#e7e2d5] px-3 py-2 transition hover:border-[#d4af37]"
                        >
                          {content}
                        </a>
                      );
                    }

                    return (
                      <div
                        key={quote.id}
                        className="rounded-xl border border-[#e7e2d5] px-3 py-2"
                      >
                        {content}
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                    No quotes found.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-2xl bg-white p-5 shadow">
              <h2 className="text-lg font-bold">
                Recent Invoices
              </h2>

              <div className="mt-3 space-y-2">
                {invoices.length > 0 ? (
                  invoices.map((invoice) => {
                    const content = (
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">
                            Invoice #{invoice.invoiceNumber ?? "—"}
                            {invoice.subject ? ` — ${invoice.subject}` : ""}
                          </p>

                          <p className="text-xs text-[#6b705c]">
                            Issued {formatDate(invoice.issuedDate)}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClasses(
                              invoice.invoiceStatus
                            )}`}
                          >
                            {formatStatus(invoice.invoiceStatus)}
                          </span>

                          <p className="text-sm font-bold">
                            {formatCurrency(invoice.total)}
                          </p>
                        </div>
                      </div>
                    );

                    if (invoice.jobberWebUri) {
                      return (
                        <a
                          key={invoice.id}
                          href={invoice.jobberWebUri}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-xl border border-[#e7e2d5] px-3 py-2 transition hover:border-[#d4af37]"
                        >
                          {content}
                        </a>
                      );
                    }

                    return (
                      <div
                        key={invoice.id}
                        className="rounded-xl border border-[#e7e2d5] px-3 py-2"
                      >
                        {content}
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                    No invoices found.
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
